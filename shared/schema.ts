import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, pgEnum, boolean, uuid, time } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectStatusEnum = pgEnum("project_status", ["planning", "in_progress", "review", "completed", "on_hold"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").default("planning").notNull(),
  clientId: uuid("client_id").references(() => partners.id),
  dealId: uuid("deal_id").references(() => deals.id), // Collegamento all'accordo per tariffe
  parentProjectId: uuid("parent_project_id"), // Self-reference for project hierarchy
  userId: uuid("user_id").references(() => users.id).notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  progress: integer("progress").default(0).notNull(),
  estimatedEffort: integer("estimated_effort"), // in hours
  color: text("color").default("#3B82F6").notNull(), // Colore esadecimale per il progetto
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "review", "completed"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const taskTypeEnum = pgEnum("task_type", [
  "development", "analysis", "design", "testing", "consulting", 
  "meeting", "documentation", "maintenance", "support", "other"
]);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").default("todo").notNull(),
  priority: taskPriorityEnum("priority").default("medium").notNull(),
  taskType: taskTypeEnum("task_type").default("other").notNull(), // Tipo di lavoro per accordi tariffari
  projectId: uuid("project_id").references(() => projects.id),
  parentTaskId: uuid("parent_task_id"), // Self-reference for task hierarchy
  userId: uuid("user_id").references(() => users.id).notNull(),
  assignedTo: uuid("assigned_to").references(() => users.id),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  estimatedEffort: integer("estimated_effort"), // in hours
  remainingEffort: integer("remaining_effort"), // in hours - automatically calculated
  completionPercentage: integer("completion_percentage").default(0).notNull(), // 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const recurrenceTypeEnum = pgEnum("recurrence_type", ["none", "daily", "weekly", "monthly", "yearly"]);

// Planning Windows - Multiple planning periods for a project with recurrence support
export const planningWindows = pgTable("planning_windows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(), // e.g., "Sprint 1", "Phase A", "Q1 Development"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  startTime: time("start_time").notNull().default('09:00'), // Start time of day
  endTime: time("end_time").notNull().default('17:00'), // End time of day
  workingHoursPerDay: integer("working_hours_per_day").default(8).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Recurrence fields
  recurrenceType: recurrenceTypeEnum("recurrence_type").default("none").notNull(),
  daysOfWeek: integer("days_of_week").array(), // [1,2,3,4,5] for Mon-Fri (1=Monday, 7=Sunday)
  recurrenceInterval: integer("recurrence_interval").default(1), // Every N days/weeks/months
  recurrenceEnd: timestamp("recurrence_end"), // When recurrence stops
  excludedDates: timestamp("excluded_dates").array(), // Specific dates to exclude
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const partnerTypeEnum = pgEnum("partner_type", ["client", "vendor", "consultant", "other"]);

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  position: text("position"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country").default("IT"),
  fiscalCode: text("fiscal_code"), // Codice fiscale
  vatNumber: text("vat_number"), // Partita IVA
  logoUrl: text("logo_url"), // URL del logo
  website: text("website"),
  type: partnerTypeEnum("type").default("client").notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dealStageEnum = pgEnum("deal_stage", ["prospecting", "proposal", "negotiation", "closing", "won", "lost"]);

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }), // Tariffa oraria per conversione timesheet
  stage: dealStageEnum("stage").default("prospecting").notNull(),
  probability: integer("probability").default(50).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  expectedCloseDate: timestamp("expected_close_date"),
  actualCloseDate: timestamp("actual_close_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const eventTypeEnum = pgEnum("event_type", ["meeting", "call", "deadline", "reminder", "other"]);

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  type: eventTypeEnum("type").default("other").notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  partnerId: uuid("partner_id").references(() => partners.id),
  dealId: uuid("deal_id").references(() => deals.id),
  isAllDay: boolean("is_all_day").default(false).notNull(),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"), // in minutes
  description: text("description"),
  isRunning: boolean("is_running").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messageStatusEnum = pgEnum("message_status", ["unread", "read", "processed", "archived"]);
export const messageTypeEnum = pgEnum("message_type", ["email", "chat", "sms", "other"]);

// Messaggi ricevuti dalla casella email dedicata
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  messageId: text("message_id"), // ID del messaggio originale (es. Message-ID email)
  type: messageTypeEnum("type").default("email").notNull(),
  status: messageStatusEnum("status").default("unread").notNull(),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  toEmail: text("to_email").notNull(),
  toName: text("to_name"),
  subject: text("subject"),
  body: text("body"),
  htmlBody: text("html_body"),
  attachments: text("attachments").array(), // Array di nomi/paths allegati
  receivedAt: timestamp("received_at").notNull(),
  // Destinatari originali estratti dalle email inoltrate
  originalToEmails: text("original_to_emails").array().default([]), 
  originalCcEmails: text("original_cc_emails").array().default([]), 
  originalBccEmails: text("original_bcc_emails").array().default([]),
  // AI matching results
  projectId: uuid("project_id").references(() => projects.id), // Associazione automatica AI
  taskId: uuid("task_id").references(() => tasks.id), // Associazione automatica AI
  partnerId: uuid("partner_id").references(() => partners.id), // Associazione automatica AI
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }), // 0.00-1.00 - quanto è sicura l'AI del match
  matchingReason: text("matching_reason"), // Spiegazione del perché dell'associazione
  isManuallyVerified: boolean("is_manually_verified").default(false), // Se l'utente ha confermato il match AI
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Commenti collegati a progetti o task (generati da messaggi o inseriti manualmente)
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  taskId: uuid("task_id").references(() => tasks.id),
  messageId: uuid("message_id").references(() => messages.id), // Collegamento al messaggio originale
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(true).notNull(), // Commento interno o comunicazione esterna
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Configurazioni email IMAP salvate per ogni utente
export const emailConfigs = pgTable("email_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  host: text("host").notNull().default("imap.gmail.com"),
  port: integer("port").notNull().default(993),
  tls: boolean("tls").notNull().default(true),
  folder: text("folder").notNull().default("INBOX"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Timesheet creati (raggruppamenti salvati di time entries)
export const timesheets = pgTable("timesheets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(), // "Timesheet Settimana 35", "Progetto ABC - Agosto"
  description: text("description"),
  groupingFields: text("grouping_fields").array().notNull(), // ["taskId", "date"]
  timeEntryIds: text("time_entry_ids").array().notNull(), // Array degli ID time entries incluse
  groupedData: text("grouped_data").notNull(), // JSON con dati processati raggruppati (riferimento storico)
  groupSnapshots: text("group_overrides").notNull(), // JSON con snapshot statici dei gruppi {groupKey: {name, duration, entries, ...}}
  totalDuration: integer("total_duration").notNull(), // Durata totale in minuti
  totalEntries: integer("total_entries").notNull(), // Numero totale entry
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Configurazione normalizzazione tempi
export const timeNormalizationConfigs = pgTable("time_normalization_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(), // "15 minuti", "30 minuti", "1 ora"
  minMinutes: integer("min_minutes").notNull(), // 15, 30, 60
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Ordini di vendita generati da timesheet
export const salesOrderStatusEnum = pgEnum("sales_order_status", ["draft", "sent", "accepted", "invoiced", "paid", "cancelled"]);

export const salesOrders = pgTable("sales_orders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(), // Cliente
  orderNumber: text("order_number").notNull().unique(), // OV-2025-001
  status: salesOrderStatusEnum("status").default("draft").notNull(),
  description: text("description"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxes: decimal("taxes", { precision: 10, scale: 2 }).default("0.00").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("EUR").notNull(),
  issueDate: timestamp("issue_date").defaultNow().notNull(),
  dueDate: timestamp("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Righe degli ordini di vendita (time entries raggruppate)
export const salesOrderItems = pgTable("sales_order_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  salesOrderId: uuid("sales_order_id").references(() => salesOrders.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  taskId: uuid("task_id").references(() => tasks.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 8, scale: 2 }).notNull(), // Ore
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // €/ora
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  workDate: timestamp("work_date"), // Data del lavoro
  timeEntryIds: text("time_entry_ids").array().notNull(), // Array degli ID time_entries raggruppate
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Accordi tariffari dinamici - sistema flessibile per definire tariffe per combinazioni specifiche
export const rateAgreements = pgTable("rate_agreements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(), // "Cliente ABC - Progetto XYZ", "Consulenza SAP - Standard", etc.
  description: text("description"),
  
  // Sistema di chiavi dinamiche (simile ai timesheet)
  groupingFields: text("grouping_fields").array().notNull(), // ["partnerId", "projectId", "humanResourceId", "taskType"]
  groupingValues: text("grouping_values").notNull(), // JSON con valori specifici: {"partnerId": "uuid", "projectId": "uuid", "humanResourceId": "uuid"}
  
  // Tariffa e condizioni
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("EUR").notNull(),
  
  // Priorità per risolvere conflitti (più alto = priorità maggiore)
  priority: integer("priority").default(1).notNull(),
  
  // Validità temporale
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validTo: timestamp("valid_to"), // null = infinito
  
  // Stato dell'accordo
  isActive: boolean("is_active").default(true).notNull(),
  
  // Note e condizioni aggiuntive
  notes: text("notes"),
  minimumHours: decimal("minimum_hours", { precision: 6, scale: 2 }), // Minimo ore per applicare tariffa
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Risorse Umane - Sistema per gestire le risorse collegabili agli utenti
export const humanResources = pgTable("human_resources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(), // Nome della risorsa (può essere diverso dal nome utente)
  role: text("role").notNull(), // Ruolo: "developer", "analyst", "consultant", "designer", "manager", etc.
  skillLevel: text("skill_level").notNull(), // "junior", "mid", "senior", "lead", "principal"
  department: text("department"), // "IT", "Consulting", "Analysis", "Design", etc.
  costCenter: text("cost_center"), // Centro di costo aziendale
  
  // Collegamento all'utente del sistema
  linkedUserId: uuid("linked_user_id").references(() => users.id), // Utente collegato (99% dei casi)
  
  // Tariffa base della risorsa (può essere sovrascritta dagli accordi)
  baseHourlyRate: decimal("base_hourly_rate", { precision: 10, scale: 2 }),
  
  // Disponibilità
  isActive: boolean("is_active").default(true).notNull(),
  startDate: timestamp("start_date"), // Data inizio collaborazione
  endDate: timestamp("end_date"), // Data fine collaborazione (null = attiva)
  
  // Metadati
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  tasks: many(tasks),
  assignedTasks: many(tasks, { relationName: "assignedTasks" }),
  partners: many(partners),
  deals: many(deals),
  calendarEvents: many(calendarEvents),
  timeEntries: many(timeEntries),
  messages: many(messages),
  comments: many(comments),
  emailConfigs: many(emailConfigs),
  timeNormalizationConfigs: many(timeNormalizationConfigs),
  salesOrders: many(salesOrders),
  rateAgreements: many(rateAgreements),
  humanResources: many(humanResources),
  linkedHumanResources: many(humanResources, { relationName: "linkedUser" }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  client: one(partners, { fields: [projects.clientId], references: [partners.id] }),
  deal: one(deals, { fields: [projects.dealId], references: [deals.id] }),
  parentProject: one(projects, { fields: [projects.parentProjectId], references: [projects.id], relationName: "ProjectHierarchy" }),
  subProjects: many(projects, { relationName: "ProjectHierarchy" }),
  tasks: many(tasks),
  planningWindows: many(planningWindows),
  calendarEvents: many(calendarEvents),
  messages: many(messages),
  comments: many(comments),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  assignedUser: one(users, { fields: [tasks.assignedTo], references: [users.id], relationName: "assignedTasks" }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  parentTask: one(tasks, { fields: [tasks.parentTaskId], references: [tasks.id], relationName: "TaskHierarchy" }),
  subTasks: many(tasks, { relationName: "TaskHierarchy" }),
  timeEntries: many(timeEntries),
  messages: many(messages),
  comments: many(comments),
}));

export const partnersRelations = relations(partners, ({ one, many }) => ({
  user: one(users, { fields: [partners.userId], references: [users.id] }),
  projects: many(projects),
  deals: many(deals),
  calendarEvents: many(calendarEvents),
  messages: many(messages),
  salesOrders: many(salesOrders),
}));

export const humanResourcesRelations = relations(humanResources, ({ one }) => ({
  user: one(users, { fields: [humanResources.userId], references: [users.id] }),
  linkedUser: one(users, { fields: [humanResources.linkedUserId], references: [users.id], relationName: "linkedUser" }),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  user: one(users, { fields: [deals.userId], references: [users.id] }),
  partner: one(partners, { fields: [deals.partnerId], references: [partners.id] }),
  projects: many(projects),
  calendarEvents: many(calendarEvents),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, { fields: [calendarEvents.userId], references: [users.id] }),
  project: one(projects, { fields: [calendarEvents.projectId], references: [projects.id] }),
  partner: one(partners, { fields: [calendarEvents.partnerId], references: [partners.id] }),
  deal: one(deals, { fields: [calendarEvents.dealId], references: [deals.id] }),
}));

export const planningWindowsRelations = relations(planningWindows, ({ one }) => ({
  project: one(projects, { fields: [planningWindows.projectId], references: [projects.id] }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
}));

export const timesheetsRelations = relations(timesheets, ({ one }) => ({
  user: one(users, { fields: [timesheets.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  user: one(users, { fields: [messages.userId], references: [users.id] }),
  project: one(projects, { fields: [messages.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [messages.taskId], references: [tasks.id] }),
  partner: one(partners, { fields: [messages.partnerId], references: [partners.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  project: one(projects, { fields: [comments.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  message: one(messages, { fields: [comments.messageId], references: [messages.id] }),
}));

export const emailConfigsRelations = relations(emailConfigs, ({ one }) => ({
  user: one(users, { fields: [emailConfigs.userId], references: [users.id] }),
}));

export const timeNormalizationConfigsRelations = relations(timeNormalizationConfigs, ({ one }) => ({
  user: one(users, {
    fields: [timeNormalizationConfigs.userId],
    references: [users.id],
  }),
}));

export const salesOrdersRelations = relations(salesOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [salesOrders.userId],
    references: [users.id],
  }),
  partner: one(partners, {
    fields: [salesOrders.partnerId],
    references: [partners.id],
  }),
  items: many(salesOrderItems),
}));

export const salesOrderItemsRelations = relations(salesOrderItems, ({ one }) => ({
  salesOrder: one(salesOrders, {
    fields: [salesOrderItems.salesOrderId],
    references: [salesOrders.id],
  }),
  project: one(projects, {
    fields: [salesOrderItems.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [salesOrderItems.taskId],
    references: [tasks.id],
  }),
}));

export const rateAgreementsRelations = relations(rateAgreements, ({ one }) => ({
  user: one(users, {
    fields: [rateAgreements.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  actualCloseDate: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlanningWindowSchema = createInsertSchema(planningWindows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  daysOfWeek: z.array(z.number().min(1).max(7)).optional(),
  excludedDates: z.array(z.string()).optional(),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  duration: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  attachments: z.array(z.string()).optional(),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailConfigSchema = createInsertSchema(emailConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTimeNormalizationConfigSchema = createInsertSchema(timeNormalizationConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSalesOrderSchema = createInsertSchema(salesOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  orderNumber: true,
});

export const insertSalesOrderItemSchema = createInsertSchema(salesOrderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  timeEntryIds: z.array(z.string()),
});

export const insertRateAgreementSchema = createInsertSchema(rateAgreements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  groupingFields: z.array(z.string()),
  groupingValues: z.string(), // JSON string
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type PlanningWindow = typeof planningWindows.$inferSelect;
export type InsertPlanningWindow = z.infer<typeof insertPlanningWindowSchema>;
export const insertTimesheetSchema = createInsertSchema(timesheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type EmailConfig = typeof emailConfigs.$inferSelect;
export type InsertEmailConfig = z.infer<typeof insertEmailConfigSchema>;
export type TimeNormalizationConfig = typeof timeNormalizationConfigs.$inferSelect;
export type InsertTimeNormalizationConfig = z.infer<typeof insertTimeNormalizationConfigSchema>;
export type SalesOrder = typeof salesOrders.$inferSelect;
export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type InsertSalesOrderItem = z.infer<typeof insertSalesOrderItemSchema>;
export type RateAgreement = typeof rateAgreements.$inferSelect;
export type InsertRateAgreement = z.infer<typeof insertRateAgreementSchema>;

export const insertHumanResourceSchema = createInsertSchema(humanResources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type HumanResource = typeof humanResources.$inferSelect;
export type InsertHumanResource = z.infer<typeof insertHumanResourceSchema>;
