import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, pgEnum, boolean, uuid, time, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auth providers enum
export const authProviderEnum = pgEnum("auth_provider", ["local", "google", "apple"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").unique(), // Made optional for OAuth users
  password: text("password"), // Made optional for OAuth users
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  profileImageUrl: text("profile_image_url"), // For OAuth profile pictures
  // OAuth fields
  provider: authProviderEnum("provider").default("local").notNull(),
  externalId: text("external_id"), // Provider's user ID
  isEmailVerified: boolean("is_email_verified").default(false).notNull(),
  // Password reset fields
  resetToken: text("reset_token"), // Token for password reset
  resetTokenExpiry: timestamp("reset_token_expiry"), // Token expiration
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Organizations - Support for multi-tenant data segregation
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(), // Status field
  theme: text("theme").default("blue").notNull(), // Theme color
  partnerId: uuid("partner_id"), // Optional partner reference
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User-Organization many-to-many relationship
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member", "viewer"]);
export const organizationRoleEnum = pgEnum("organization_role", ["owner", "admin", "member", "viewer"]);

export const userOrganizations = pgTable("user_organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  role: organizationRoleEnum("role").default("member").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
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
  sapSystemId: uuid("sap_system_id").references(() => sapSystems.id), // Sistema SAP associato al progetto
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  progress: integer("progress").default(0).notNull(),
  estimatedEffort: integer("estimated_effort"), // in hours
  color: text("color").default("#3B82F6").notNull(), // Colore esadecimale per il progetto
  sourceMessageIds: text("source_message_ids").array().default([]), // IDs dei messaggi da cui è stato creato
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
  milestoneId: uuid("milestone_id").references(() => projectMilestones.id), // Collegamento alla milestone
  parentTaskId: uuid("parent_task_id"), // Self-reference for task hierarchy
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  assignedTo: uuid("assigned_to").references(() => users.id),
  sapSystemId: uuid("sap_system_id").references(() => sapSystems.id), // Collegamento al sistema SAP per connessione automatica
  startDate: timestamp("start_date"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  estimatedEffort: integer("estimated_effort"), // in hours
  remainingEffort: integer("remaining_effort"), // in hours - automatically calculated
  completionPercentage: integer("completion_percentage").default(0).notNull(), // 0-100
  sourceMessageIds: text("source_message_ids").array().default([]), // IDs dei messaggi da cui è stato creato
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const recurrenceTypeEnum = pgEnum("recurrence_type", ["none", "daily", "weekly", "monthly", "yearly"]);
export const timesheetStatusEnum = pgEnum("timesheet_status", ["draft", "to_send", "sent", "invoiced"]);

// Planning Windows - Multiple planning periods for a project with recurrence support
export const planningWindows = pgTable("planning_windows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  // Note: planning windows are NOT segregated by organization - shared planning calendar
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
  address: text("address"), // Indirizzo completo (retrocompatibilità)
  street: text("street"), // Via/Piazza
  streetNumber: text("street_number"), // Numero civico
  city: text("city"),
  province: text("province"), // Provincia (es. MI, RM)
  postalCode: text("postal_code"),
  country: text("country").default("IT"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }), // Coordinate per mappa
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  isLegalAddress: boolean("is_legal_address").default(true), // true = sede legale, false = sede operativa
  parentPartnerId: uuid("parent_partner_id").references((): any => partners.id), // Riferimento al partner principale (per sedi operative)
  fiscalCode: text("fiscal_code"), // Codice fiscale
  vatNumber: text("vat_number"), // Partita IVA
  logoUrl: text("logo_url"), // URL del logo
  website: text("website"),
  domain: text("domain"), // Dominio estratto dal sito web, poi modificabile
  type: partnerTypeEnum("type").default("client").notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  notes: text("notes"),
  sourceMessageIds: text("source_message_ids").array().default([]), // IDs dei messaggi da cui è stato creato
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Partner Emails - Supporto per email multiple con flag principale
export const partnerEmailLabelEnum = pgEnum("partner_email_label", ["work", "home", "billing", "support", "other"]);

export const partnerEmails = pgTable("partner_emails", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "cascade" }).notNull(),
  email: text("email").notNull(),
  label: partnerEmailLabelEnum("label").default("work").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Partner Phones - Supporto per telefoni multipli con flag principale
export const partnerPhoneLabelEnum = pgEnum("partner_phone_label", ["work", "mobile", "home", "fax", "other"]);

export const partnerPhones = pgTable("partner_phones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "cascade" }).notNull(),
  phone: text("phone").notNull(),
  label: partnerPhoneLabelEnum("label").default("work").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contacts - Contatti di riferimento (persone individuali)
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Nome completo
  email: text("email").notNull(), // Email (identificatore principale)
  phone: text("phone"),
  position: text("position"), // Ruolo/posizione
  company: text("company"), // Azienda di appartenenza
  partnerId: uuid("partner_id").references(() => partners.id), // Partner associato (opzionale)
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  notes: text("notes"),
  sourceMessageIds: text("source_message_ids").array().default([]), // IDs dei messaggi da cui è stato creato
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
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
  // Note: calendar events are NOT segregated by organization - shared planning calendar
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
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
  organizationId: uuid("organization_id").references(() => organizations.id), // 🔧 FIX: Organization segregation for messages
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
  // 🔧 PLAN B: Forward detection artifacts for cascade pipeline
  forwardArtifacts: jsonb("forward_artifacts"), // { rfc822Payload?: {...}, resentHeaders?: {...}, hasRfc822: boolean, hasResent: boolean }
  // Chat metadata for multi-message conversations
  metadata: jsonb("metadata"), // { platform?: string, participants?: Array, messages?: Array, summary?: string, rawSource?: string }
  attachments: text("attachments").array(), // Array di nomi/paths allegati
  receivedAt: timestamp("received_at").notNull(),
  // Email Threading Support
  threadId: text("thread_id"), // ID univoco per raggruppare email correlate in thread
  inReplyTo: text("in_reply_to"), // Message-ID dell'email a cui si risponde
  references: text("references").array(), // Array di Message-IDs della catena di conversazione
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
}, (table) => ({
  threadIdIdx: index("messages_thread_id_idx").on(table.threadId),
}));

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

// Message Links - Sistema per collegare messaggi a qualsiasi entità del CRM
export const messageLinkTypeEnum = pgEnum("message_link_type", ["discussion", "attachment", "reference", "notification"]);

// AI Proposals - Status enum
export const proposalStatusEnum = pgEnum("proposal_status", ["pending", "accepted", "rejected", "partially_accepted"]);

export const messageLinks = pgTable("message_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid("message_id").references(() => messages.id).notNull(),
  linkedTableName: text("linked_table_name").notNull(), // "projects", "tasks", "partners", "deals", etc.
  linkedRecordId: text("linked_record_id").notNull(), // UUID del record collegato
  linkType: messageLinkTypeEnum("link_type").default("discussion").notNull(),
  isAutomatic: boolean("is_automatic").default(false).notNull(), // Se collegato automaticamente dall'AI
  userId: uuid("user_id").references(() => users.id).notNull(), // Chi ha creato il collegamento
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  notes: text("notes"), // Note aggiuntive sul collegamento
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Proposals - Proposte AI salvate in background per analisi messaggi
export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  messageId: uuid("message_id").references(() => messages.id).notNull(),
  status: proposalStatusEnum("status").default("pending").notNull(),
  proposalData: jsonb("proposal_data").notNull(), // { project, partner, tasks, reasoning }
  errorMessage: text("error_message"), // Eventuale errore durante l'analisi
  appliedAt: timestamp("applied_at"), // Quando è stata applicata
  appliedBy: uuid("applied_by").references(() => users.id), // Chi ha applicato la proposta
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Domini supportati dalle organizzazioni (per identificazione automatica email)
export const organizationDomains = pgTable("organization_domains", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  domain: text("domain").notNull(), // es. "lutech.it", "c.lutech.it"
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"), // Note opzionali sul dominio
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Configurazioni email IMAP salvate per ogni utente
export const emailConfigs = pgTable("email_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id), // Associazione opzionale all'organizzazione
  email: text("email").notNull(),
  password: text("password").notNull(),
  host: text("host").notNull().default("imap.gmail.com"),
  port: integer("port").notNull().default(993),
  tls: boolean("tls").notNull().default(true),
  folders: text("folders").array().notNull().default([]), // Array di cartelle da monitorare
  isActive: boolean("is_active").notNull().default(true),
  // NUOVI CAMPI per gestione forwarding intelligente
  isForwarder: boolean("is_forwarder").default(false).notNull(), // Se questo account inoltra tipicamente email
  customSignature: text("custom_signature"), // Firma personalizzata di questo account (per rimozione più precisa)
  // NUOVO: Account IMAP da usare per l'invio (per account inoltranti)
  sendingAccountId: uuid("sending_account_id"), // Quale account usare per inviare email da questo inoltrante (UUID di altra EmailConfig)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Timesheet creati (raggruppamenti salvati di time entries)
export const timesheets = pgTable("timesheets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(), // "Timesheet Settimana 35", "Progetto ABC - Agosto"
  description: text("description"),
  status: timesheetStatusEnum("status").default("draft").notNull(),
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

// Offerte/Preventivi - Quote management
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "rejected", "expired"]);
export const quoteItemTypeEnum = pgEnum("quote_item_type", ["service", "package", "expense"]);

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  
  // Cliente e contatto
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  
  // Numero e versione
  quoteNumber: text("quote_number").notNull().unique(), // OFF-2025-001
  version: integer("version").default(1).notNull(),
  parentQuoteId: uuid("parent_quote_id").references((): any => quotes.id), // Riferimento alla versione precedente
  
  // Riferimenti
  rateAgreementId: uuid("rate_agreement_id").references(() => rateAgreements.id), // Accordo tariffario di base
  projectId: uuid("project_id").references(() => projects.id), // Progetto/Engagement collegato
  
  // Stato e date
  status: quoteStatusEnum("status").default("draft").notNull(),
  issueDate: timestamp("issue_date").defaultNow().notNull(),
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validTo: timestamp("valid_to").notNull(), // Data scadenza offerta
  
  // Totali
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0.00").notNull(),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).default("0.00"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  taxes: decimal("taxes", { precision: 10, scale: 2 }).default("0.00").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).default("0.00").notNull(),
  currency: text("currency").default("EUR").notNull(),
  
  // Condizioni commerciali
  paymentTerms: text("payment_terms"), // "30gg FM", "50% anticipo, 50% consegna"
  deliveryMode: text("delivery_mode"), // "remote", "on-site", "hybrid"
  specialConditions: text("special_conditions"), // Clausole particolari
  
  // Note
  internalNotes: text("internal_notes"), // Note interne (non visibili al cliente)
  externalNotes: text("external_notes"), // Note esterne (nel documento offerta)
  
  // Tracking invio e accettazione
  sentAt: timestamp("sent_at"),
  sentChannel: text("sent_channel"), // "email", "portal", "other"
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: text("accepted_by"), // Nome e ruolo di chi ha accettato
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Conversione in ordine
  convertedToOrderId: uuid("converted_to_order_id").references(() => salesOrders.id),
  convertedAt: timestamp("converted_at"),
  
  // Metadati
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: uuid("quote_id").references(() => quotes.id).notNull(),
  
  // Ordinamento
  lineNumber: integer("line_number").notNull(),
  
  // Tipo e descrizione
  itemType: quoteItemTypeEnum("item_type").default("service").notNull(),
  description: text("description").notNull(),
  
  // Quantità e prezzo
  quantity: decimal("quantity", { precision: 8, scale: 2 }).notNull(),
  unitOfMeasure: text("unit_of_measure").default("ore").notNull(), // "ore", "giorni", "mese", "pacchetto"
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).default("0.00"),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  
  // Flag fuori listino
  isOffList: boolean("is_off_list").default(false), // Indica se il prezzo è diverso dall'accordo tariffario
  
  // Link opzionali
  projectId: uuid("project_id").references(() => projects.id),
  humanResourceId: uuid("human_resource_id").references(() => humanResources.id),
  
  // Note riga
  notes: text("notes"),
  
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  name: text("name").notNull(), // Nome della risorsa (può essere diverso dal nome utente)
  role: text("role").notNull(), // Ruolo: "developer", "analyst", "consultant", "designer", "manager", etc.
  skillLevel: text("skill_level").notNull(), // "junior", "mid", "senior", "lead", "principal"
  department: text("department"), // "IT", "Consulting", "Analysis", "Design", etc.
  costCenter: text("cost_center"), // Centro di costo aziendale
  
  // Collegamento all'utente del sistema
  linkedUserId: uuid("linked_user_id").references(() => users.id), // Utente collegato (99% dei casi)
  
  // Collegamento all'organizzazione esterna (se la risorsa è un freelance con proprio account)
  externalOrganizationId: uuid("external_organization_id").references(() => organizations.id), // Organizzazione del freelance
  
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

// SAP Systems Management
export const sapSystemTypeEnum = pgEnum("sap_system_type", ["ecc", "s4hana", "bw", "pi", "po", "solution_manager", "crm", "srm", "other"]);
export const sapSystemStatusEnum = pgEnum("sap_system_status", ["active", "inactive", "maintenance", "test"]);

export const sapSystems = pgTable("sap_systems", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  partnerId: uuid("partner_id").references(() => partners.id), // Cliente a cui appartiene il sistema (opzionale)
  projectId: uuid("project_id").references(() => projects.id), // Progetto associato opzionale
  name: text("name").notNull(), // Nome del sistema (es. "PRD", "DEV", "QAS")
  description: text("description"),
  systemId: text("system_id").notNull(), // System ID SAP (3 caratteri, es. "PRD", "DEV", "QAS")
  systemType: sapSystemTypeEnum("system_type").default("ecc").notNull(),
  status: sapSystemStatusEnum("status").default("active").notNull(),
  
  // Connection details
  serverHost: text("server_host").notNull(), // IP o hostname
  systemNumber: text("system_number").notNull(), // 00, 01, etc.
  // clientNumber rimosso - è dato applicativo che va nelle credenziali
  applicationServerPort: integer("application_server_port").default(3200), // 32XX
  messageServerPort: integer("message_server_port").default(3600), // 36XX
  
  // Additional SAP details
  sapReleaseVersion: text("sap_release_version"), // 750, 740, etc.
  kernelVersion: text("kernel_version"),
  landscape: text("landscape").default("production"), // production, test, development
  
  // VPN Configuration
  vpnConnectionId: uuid("vpn_connection_id").references(() => vpnConnections.id),
  
  // Default credentials (fallback when no specific credentials are configured)
  defaultUsername: text("default_username"),
  defaultPassword: text("default_password"), // Encrypted in storage
  
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Credenziali multiple per ogni sistema SAP
export const sapSystemCredentials = pgTable("sap_system_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sapSystemId: uuid("sap_system_id").references(() => sapSystems.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  
  // Credential details
  username: text("username").notNull(),
  password: text("password").notNull(), // Encrypted in storage
  description: text("description"), // "Admin user", "Developer", "Functional", etc.
  
  // Authorization details
  userType: text("user_type").default("dialog").notNull(), // dialog, system, service, communication
  authorizationProfile: text("authorization_profile"), // SAP_ALL, Z_DEVELOPER, etc.
  
  // Validity
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validTo: timestamp("valid_to"), // null = no expiration
  isActive: boolean("is_active").default(true).notNull(),
  
  // Last usage tracking
  lastUsed: timestamp("last_used"),
  usageCount: integer("usage_count").default(0).notNull(),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// VPN Connections for accessing SAP systems
export const vpnConnectionTypeEnum = pgEnum("vpn_connection_type", ["openvpn", "ipsec", "wireguard", "cisco_anyconnect", "fortigate", "other"]);
export const vpnStatusEnum = pgEnum("vpn_status", ["active", "inactive", "expired", "blocked"]);

// VPN Software (Master Data)
export const vpnSoftware = pgTable("vpn_software", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // "FortiClient", "Azure VPN Client", "GlobalProtect"
  vendor: text("vendor").notNull(), // "Fortinet", "Microsoft", "Palo Alto Networks"
  version: text("version"), // "7.2.0", "Latest"
  description: text("description"),
  iconUrl: text("icon_url"), // URL dell'icona del software
  downloadUrl: text("download_url"), // URL per scaricare il software
  documentationUrl: text("documentation_url"), // URL documentazione
  supportedPlatforms: text("supported_platforms").array().default([]), // ["windows", "mac", "linux", "ios", "android"]
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// VPN Systems (per partner con software specifico)
export const vpnSystems = pgTable("vpn_systems", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  vpnSoftwareId: uuid("vpn_software_id").references(() => vpnSoftware.id).notNull(),
  
  name: text("name").notNull(), // "VPN Azienda ABC", "Accesso remoto Cliente XYZ"
  description: text("description"),
  
  // Connection details
  serverHost: text("server_host").notNull(),
  serverPort: integer("server_port"),
  username: text("username"),
  connectionProfile: text("connection_profile"), // Nome profilo configurazione
  
  // Configuration
  configNotes: text("config_notes"), // Note di configurazione specifiche
  autoStart: boolean("auto_start").default(false).notNull(),
  
  // Status
  status: vpnStatusEnum("status").default("active").notNull(),
  lastConnected: timestamp("last_connected"),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const vpnConnections = pgTable("vpn_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  partnerId: uuid("partner_id").references(() => partners.id).notNull(), // Cliente a cui appartiene la VPN
  
  name: text("name").notNull(), // "Cliente ABC VPN", "Site-to-Site Production"
  description: text("description"),
  connectionType: vpnConnectionTypeEnum("connection_type").default("openvpn").notNull(),
  status: vpnStatusEnum("status").default("active").notNull(),
  
  // Connection details
  serverHost: text("server_host").notNull(),
  serverPort: integer("server_port").default(1194).notNull(),
  protocol: text("protocol").default("udp").notNull(), // udp, tcp
  
  // Configuration files/settings
  configFileContent: text("config_file_content"), // VPN config file content
  certificatePath: text("certificate_path"), // Path to client certificate
  keyPath: text("key_path"), // Path to private key
  caCertPath: text("ca_cert_path"), // Path to CA certificate
  
  // Automation script for VPN connection
  automationScript: text("automation_script"), // Generated AppleScript/Shell script for VPN automation
  scriptType: text("script_type"), // "applescript", "shell", "native_macos"
  scriptGeneratedAt: timestamp("script_generated_at", { withTimezone: true }), // When script was generated
  scriptValidatedAt: timestamp("script_validated_at", { withTimezone: true }), // When script was last tested
  
  // Additional settings
  allowedIpRanges: text("allowed_ip_ranges").array().default([]), // IP ranges accessible through VPN
  dnsServers: text("dns_servers").array().default([]), // DNS servers to use
  
  // Connection tracking
  autoConnect: boolean("auto_connect").default(false).notNull(),
  lastConnected: timestamp("last_connected"),
  connectionDuration: integer("connection_duration").default(0), // Total minutes connected
  
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Credenziali multiple per ogni VPN
export const vpnCredentials = pgTable("vpn_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vpnConnectionId: uuid("vpn_connection_id").references(() => vpnConnections.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  
  // Credential details
  username: text("username").notNull(),
  password: text("password").notNull(), // Encrypted in storage
  description: text("description"), // "Primary user", "Backup access", etc.
  
  // Pre-shared keys for IPSec
  preSharedKey: text("pre_shared_key"), // For IPSec connections
  
  // Two-factor authentication
  totpSecret: text("totp_secret"), // TOTP secret for 2FA
  backupCodes: text("backup_codes").array().default([]), // Backup authentication codes
  
  // Validity and usage
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validTo: timestamp("valid_to"), // null = no expiration
  isActive: boolean("is_active").default(true).notNull(),
  lastUsed: timestamp("last_used"),
  usageCount: integer("usage_count").default(0).notNull(),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tabella unificata per credenziali di sistema (SAP + VPN)
export const systemTypeEnum = pgEnum("system_type", ["sap", "vpn"]);

export const systemCredentials = pgTable("system_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  
  // Credenziali
  username: text("username").notNull(),
  password: text("password").notNull(), // Encrypted in storage
  
  // Tipo sistema e riferimento
  systemType: systemTypeEnum("system_type").notNull(), // SAP o VPN
  systemId: uuid("system_id"), // ID del sistema SAP o VPN di riferimento
  systemName: text("system_name").notNull(), // Nome leggibile del sistema
  
  // Scadenza e validità
  expirationDate: timestamp("expiration_date"), // Data scadenza credenziali
  isActive: boolean("is_active").default(true).notNull(),
  
  // Tracking utilizzo
  lastUsed: timestamp("last_used"),
  usageCount: integer("usage_count").default(0).notNull(),
  
  // Note aggiuntive
  description: text("description"), // "Admin user", "Developer", "VPN Client", etc.
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// VPN Software Discovery - Risultati del discovery automatico
export const discoveredVpnSoftware = pgTable("discovered_vpn_software", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  
  // Identificatore software
  softwareKey: text("software_key").notNull(), // "forticlient", "cisco_anyconnect", etc.
  name: text("name").notNull(), // "FortiClient", "Cisco AnyConnect"
  vendor: text("vendor"), // "Fortinet", "Cisco"
  
  // Risultati discovery
  installed: boolean("installed").default(false).notNull(),
  canReadConfigs: boolean("can_read_configs").default(false).notNull(),
  configCount: integer("config_count").default(0).notNull(),
  
  // Tipo automazione disponibile
  automationType: text("automation_type").notNull(), // "full", "credentials", "manual"
  description: text("description"),
  
  // Paths e info tecniche trovate
  installPath: text("install_path"), // Dove è installato il software
  configPath: text("config_path"), // Dove sono le configurazioni
  executablePath: text("executable_path"), // Path dell'eseguibile
  
  // Discovery metadata
  discoveryMethod: text("discovery_method").default("filesystem").notNull(), // "filesystem", "registry", "command"
  platform: text("platform").default("unknown").notNull(), // "macos", "windows", "linux"
  
  // Timestamps
  discoveredAt: timestamp("discovered_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// VPN Configurations Discovery - Configurazioni trovate per ogni software
export const discoveredVpnConfigurations = pgTable("discovered_vpn_configurations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  discoveredSoftwareId: uuid("discovered_software_id").references(() => discoveredVpnSoftware.id).notNull(),
  
  // Identificatori configurazione
  configId: text("config_id").notNull(), // ID univoco della configurazione nel sistema
  name: text("name").notNull(), // Nome del profilo/connessione
  
  // Dettagli connessione
  server: text("server"), // Server VPN
  port: integer("port"), // Porta
  protocol: text("protocol"), // "UDP", "TCP", "IKEv2", etc.
  
  // Stato configurazione
  configured: boolean("configured").default(false).notNull(),
  active: boolean("active").default(false).notNull(),
  
  // Metadati configurazione
  configPath: text("config_path"), // Path del file di configurazione
  profileData: text("profile_data"), // Dati del profilo (JSON o testo)
  extractionMethod: text("extraction_method"), // "fccconfig", "xml_parse", "registry"
  
  // Discovery info
  discoveredAt: timestamp("discovered_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Transport Request files (cofile and data file)
export const transportRequestStatusEnum = pgEnum("transport_request_status", ["development", "testing", "quality", "production", "released", "imported"]);
export const transportRequestTypeEnum = pgEnum("transport_request_type", ["workbench", "customizing", "copy", "relocate"]);

export const transportRequests = pgTable("transport_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  sapSystemId: uuid("sap_system_id").references(() => sapSystems.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  taskId: uuid("task_id").references(() => tasks.id),
  
  // Transport request details
  requestNumber: text("request_number").notNull().unique(), // DEVK9XXXXX
  description: text("description").notNull(),
  type: transportRequestTypeEnum("type").default("workbench").notNull(),
  status: transportRequestStatusEnum("status").default("development").notNull(),
  
  // Owner information
  owner: text("owner").notNull(), // SAP user who created the transport
  targetSystem: text("target_system"), // Target system for import
  
  // File information
  cofilePath: text("cofile_path"), // Path to cofile (control file)
  datafilePath: text("datafile_path"), // Path to data file
  cofileContent: text("cofile_content"), // Content of cofile for AI analysis
  
  // Metadata
  releaseDate: timestamp("release_date"),
  importDate: timestamp("import_date"),
  
  // Objects included (for AI documentation)
  includedObjects: text("included_objects").array().default([]), // List of SAP objects in transport
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI-generated intervention documentation
export const interventionDocumentStatusEnum = pgEnum("intervention_document_status", ["draft", "pending_review", "approved", "archived"]);
export const interventionDocumentTypeEnum = pgEnum("intervention_document_type", ["transport_analysis", "system_configuration", "troubleshooting", "development", "custom"]);

export const interventionDocuments = pgTable("intervention_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  taskId: uuid("task_id").references(() => tasks.id),
  sapSystemId: uuid("sap_system_id").references(() => sapSystems.id),
  transportRequestId: uuid("transport_request_id").references(() => transportRequests.id),
  
  title: text("title").notNull(),
  type: interventionDocumentTypeEnum("type").default("transport_analysis").notNull(),
  status: interventionDocumentStatusEnum("status").default("draft").notNull(),
  
  // AI-generated content
  aiGeneratedContent: text("ai_generated_content").notNull(), // Main AI-generated documentation
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 3, scale: 2 }), // 0.00-1.00
  aiModel: text("ai_model").default("gpt-5").notNull(), // AI model used for generation
  
  // Analysis data used for generation
  sourceFiles: text("source_files").array().default([]), // Files analyzed for generation
  analysisPrompt: text("analysis_prompt"), // Prompt used for AI generation
  
  // Manual edits and reviews
  manualEdits: text("manual_edits"), // User edits to AI content
  reviewNotes: text("review_notes"), // Review comments
  finalContent: text("final_content"), // Final approved content
  
  // Template and customization
  templateId: text("template_id"), // If using a specific template
  customFields: text("custom_fields"), // JSON for custom client-specific fields
  
  // Metadata
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  
  // Export and sharing
  exportedFormats: text("exported_formats").array().default([]), // pdf, docx, html
  sharedWithClient: boolean("shared_with_client").default(false).notNull(),
  clientAccessUrl: text("client_access_url"), // Secure URL for client access
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Email training selections - Manual selections for algorithm training
// ✅ MODULAR DESIGN: All selection types follow the same pattern
export const selectionTypeEnum = pgEnum("selection_type", [
  "body", "header", "thread", "signatureBody", "signatureHeader", "mailThread"
]);

export const emailTrainingSelections = pgTable("email_training_selections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid("message_id").references(() => messages.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  // ✅ UNIFIED: All selection types use the same structure
  selectionType: selectionTypeEnum("selection_type").notNull(),
  selectedText: text("selected_text").notNull(),
  sourceMessageId: uuid("source_message_id"), // Optional: for thread types that need source tracking
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
  sapSystems: many(sapSystems),
  sapSystemCredentials: many(sapSystemCredentials),
  vpnConnections: many(vpnConnections),
  vpnCredentials: many(vpnCredentials),
  transportRequests: many(transportRequests),
  interventionDocuments: many(interventionDocuments),
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
  sapSystems: many(sapSystems),
  transportRequests: many(transportRequests),
  sapTransportRequests: many(sapTransportRequests),
  interventionDocuments: many(interventionDocuments),
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
  transportRequests: many(transportRequests),
  interventionDocuments: many(interventionDocuments),
}));

export const partnersRelations = relations(partners, ({ one, many }) => ({
  user: one(users, { fields: [partners.userId], references: [users.id] }),
  organization: one(organizations, { fields: [partners.organizationId], references: [organizations.id], relationName: "organizationPartners" }),
  parentPartner: one(partners, { fields: [partners.parentPartnerId], references: [partners.id], relationName: "parentPartner" }),
  operationalAddresses: many(partners, { relationName: "parentPartner" }), // Sedi operative collegate
  projects: many(projects),
  deals: many(deals),
  calendarEvents: many(calendarEvents),
  messages: many(messages),
  salesOrders: many(salesOrders),
  sapSystems: many(sapSystems),
  vpnConnections: many(vpnConnections),
  vpnSystems: many(vpnSystems),
  contacts: many(contacts),
}));

export const humanResourcesRelations = relations(humanResources, ({ one, many }) => ({
  user: one(users, { fields: [humanResources.userId], references: [users.id] }),
  linkedUser: one(users, { fields: [humanResources.linkedUserId], references: [users.id], relationName: "linkedUser" }),
  externalOrganization: one(organizations, { fields: [humanResources.externalOrganizationId], references: [organizations.id], relationName: "externalOrgResources" }),
  projectAssignments: many(projectAssignments),
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
  messageLinks: many(messageLinks),
  proposals: many(proposals),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, { fields: [contacts.userId], references: [users.id] }),
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
  partner: one(partners, { fields: [contacts.partnerId], references: [partners.id] }),
}));

export const proposalsRelations = relations(proposals, ({ one }) => ({
  user: one(users, { fields: [proposals.userId], references: [users.id] }),
  organization: one(organizations, { fields: [proposals.organizationId], references: [organizations.id] }),
  message: one(messages, { fields: [proposals.messageId], references: [messages.id] }),
  appliedByUser: one(users, { fields: [proposals.appliedBy], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  project: one(projects, { fields: [comments.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  message: one(messages, { fields: [comments.messageId], references: [messages.id] }),
}));

export const emailConfigsRelations = relations(emailConfigs, ({ one }) => ({
  user: one(users, { fields: [emailConfigs.userId], references: [users.id] }),
  organization: one(organizations, { fields: [emailConfigs.organizationId], references: [organizations.id] }),
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

// SAP System Relations
export const sapSystemsRelations = relations(sapSystems, ({ one, many }) => ({
  user: one(users, { fields: [sapSystems.userId], references: [users.id] }),
  partner: one(partners, { fields: [sapSystems.partnerId], references: [partners.id] }),
  project: one(projects, { fields: [sapSystems.projectId], references: [projects.id] }),
  vpnConnection: one(vpnConnections, { fields: [sapSystems.vpnConnectionId], references: [vpnConnections.id] }),
  credentials: many(sapSystemCredentials),
  transportRequests: many(transportRequests),
  interventionDocuments: many(interventionDocuments),
}));

export const sapSystemCredentialsRelations = relations(sapSystemCredentials, ({ one }) => ({
  user: one(users, { fields: [sapSystemCredentials.userId], references: [users.id] }),
  sapSystem: one(sapSystems, { fields: [sapSystemCredentials.sapSystemId], references: [sapSystems.id] }),
}));

export const vpnSoftwareRelations = relations(vpnSoftware, ({ many }) => ({
  vpnSystems: many(vpnSystems),
}));

export const vpnSystemsRelations = relations(vpnSystems, ({ one }) => ({
  user: one(users, { fields: [vpnSystems.userId], references: [users.id] }),
  partner: one(partners, { fields: [vpnSystems.partnerId], references: [partners.id] }),
  vpnSoftware: one(vpnSoftware, { fields: [vpnSystems.vpnSoftwareId], references: [vpnSoftware.id] }),
}));

export const vpnConnectionsRelations = relations(vpnConnections, ({ one, many }) => ({
  user: one(users, { fields: [vpnConnections.userId], references: [users.id] }),
  partner: one(partners, { fields: [vpnConnections.partnerId], references: [partners.id] }),
  credentials: many(vpnCredentials),
  sapSystems: many(sapSystems),
}));

export const vpnCredentialsRelations = relations(vpnCredentials, ({ one }) => ({
  user: one(users, { fields: [vpnCredentials.userId], references: [users.id] }),
  vpnConnection: one(vpnConnections, { fields: [vpnCredentials.vpnConnectionId], references: [vpnConnections.id] }),
}));

export const transportRequestsRelations = relations(transportRequests, ({ one, many }) => ({
  user: one(users, { fields: [transportRequests.userId], references: [users.id] }),
  sapSystem: one(sapSystems, { fields: [transportRequests.sapSystemId], references: [sapSystems.id] }),
  project: one(projects, { fields: [transportRequests.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [transportRequests.taskId], references: [tasks.id] }),
  interventionDocuments: many(interventionDocuments),
}));

export const interventionDocumentsRelations = relations(interventionDocuments, ({ one }) => ({
  user: one(users, { fields: [interventionDocuments.userId], references: [users.id] }),
  project: one(projects, { fields: [interventionDocuments.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [interventionDocuments.taskId], references: [tasks.id] }),
  sapSystem: one(sapSystems, { fields: [interventionDocuments.sapSystemId], references: [sapSystems.id] }),
  transportRequest: one(transportRequests, { fields: [interventionDocuments.transportRequestId], references: [transportRequests.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  // Make password optional for OAuth users
  password: z.string().optional(),
  username: z.string().optional(),
});

// Organization schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserOrganizationSchema = createInsertSchema(userOrganizations).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  organizationId: true, // Auto-filled from user session
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  organizationId: true, // Auto-filled from user session
});

export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  organizationId: true, // Auto-filled from user session
});

// Partner Email/Phone schemas for 1:N relationships
export const insertPartnerEmailSchema = createInsertSchema(partnerEmails).omit({
  id: true,
  createdAt: true,
});
export type InsertPartnerEmail = z.infer<typeof insertPartnerEmailSchema>;
export type PartnerEmail = typeof partnerEmails.$inferSelect;

export const insertPartnerPhoneSchema = createInsertSchema(partnerPhones).omit({
  id: true,
  createdAt: true,
});
export type InsertPartnerPhone = z.infer<typeof insertPartnerPhoneSchema>;
export type PartnerPhone = typeof partnerPhones.$inferSelect;

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  organizationId: true, // Auto-filled from user session
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  actualCloseDate: true,
  organizationId: true, // Auto-filled from user session
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

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  attachments: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageLinkSchema = createInsertSchema(messageLinks).omit({
  id: true,
  createdAt: true,
  organizationId: true, // Auto-filled from user session
});

export const insertOrganizationDomainSchema = createInsertSchema(organizationDomains).omit({
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

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  quoteNumber: true,
  convertedToOrderId: true,
  convertedAt: true,
});

export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Organization types
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UserOrganization = typeof userOrganizations.$inferSelect;
export type InsertUserOrganization = z.infer<typeof insertUserOrganizationSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
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
export type MessageLink = typeof messageLinks.$inferSelect;
export type InsertMessageLink = z.infer<typeof insertMessageLinkSchema>;
export type OrganizationDomain = typeof organizationDomains.$inferSelect;
export type InsertOrganizationDomain = z.infer<typeof insertOrganizationDomainSchema>;
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
export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;

export const insertHumanResourceSchema = createInsertSchema(humanResources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// SAP Insert Schemas
export const insertSapSystemSchema = createInsertSchema(sapSystems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSapSystemCredentialsSchema = createInsertSchema(sapSystemCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
  usageCount: true,
});

export const insertVpnConnectionSchema = createInsertSchema(vpnConnections).omit({
  id: true,
  userId: true, // Auto-filled from user session
  createdAt: true,
  updatedAt: true,
  lastConnected: true,
  connectionDuration: true,
  scriptGeneratedAt: true, // Auto-generated when script is created
  scriptValidatedAt: true, // Auto-generated when script is tested
}).extend({
  allowedIpRanges: z.array(z.string()).optional(),
  dnsServers: z.array(z.string()).optional(),
});

export const insertVpnCredentialsSchema = createInsertSchema(vpnCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
  usageCount: true,
}).extend({
  backupCodes: z.array(z.string()).optional(),
});

export const insertTransportRequestSchema = createInsertSchema(transportRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  releaseDate: true,
  importDate: true,
}).extend({
  includedObjects: z.array(z.string()).optional(),
});

export const insertInterventionDocumentSchema = createInsertSchema(interventionDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  generatedAt: true,
  reviewedAt: true,
  approvedAt: true,
}).extend({
  sourceFiles: z.array(z.string()).optional(),
  exportedFormats: z.array(z.string()).optional(),
});

// System Credentials Insert Schema
export const insertSystemCredentialsSchema = createInsertSchema(systemCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
  usageCount: true,
});

// VPN Software Insert Schema
export const insertVpnSoftwareSchema = createInsertSchema(vpnSoftware).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  supportedPlatforms: z.array(z.string()).optional(),
});

// VPN Systems Insert Schema
export const insertVpnSystemsSchema = createInsertSchema(vpnSystems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastConnected: true,
});

// Discovery VPN Insert Schemas
export const insertDiscoveredVpnSoftwareSchema = createInsertSchema(discoveredVpnSoftware).omit({
  id: true,
  discoveredAt: true,
  updatedAt: true,
});

export const insertDiscoveredVpnConfigurationSchema = createInsertSchema(discoveredVpnConfigurations).omit({
  id: true,
  discoveredAt: true,
  updatedAt: true,
});

// All Types
export type HumanResource = typeof humanResources.$inferSelect;
export type InsertHumanResource = z.infer<typeof insertHumanResourceSchema>;

export type SapSystem = typeof sapSystems.$inferSelect;
export type InsertSapSystem = z.infer<typeof insertSapSystemSchema>;
export type SapSystemCredentials = typeof sapSystemCredentials.$inferSelect;
export type InsertSapSystemCredentials = z.infer<typeof insertSapSystemCredentialsSchema>;
export type VpnConnection = typeof vpnConnections.$inferSelect;
export type InsertVpnConnection = z.infer<typeof insertVpnConnectionSchema>;
export type VpnCredentials = typeof vpnCredentials.$inferSelect;
export type InsertVpnCredentials = z.infer<typeof insertVpnCredentialsSchema>;
export type TransportRequest = typeof transportRequests.$inferSelect;
export type InsertTransportRequest = z.infer<typeof insertTransportRequestSchema>;
export type InterventionDocument = typeof interventionDocuments.$inferSelect;
export type InsertInterventionDocument = z.infer<typeof insertInterventionDocumentSchema>;
export type SystemCredentials = typeof systemCredentials.$inferSelect;
export type InsertSystemCredentials = z.infer<typeof insertSystemCredentialsSchema>;
export type VpnSoftware = typeof vpnSoftware.$inferSelect;
export type InsertVpnSoftware = z.infer<typeof insertVpnSoftwareSchema>;
export type VpnSystems = typeof vpnSystems.$inferSelect;
export type InsertVpnSystems = z.infer<typeof insertVpnSystemsSchema>;
export type DiscoveredVpnSoftware = typeof discoveredVpnSoftware.$inferSelect;
export type InsertDiscoveredVpnSoftware = z.infer<typeof insertDiscoveredVpnSoftwareSchema>;
export type DiscoveredVpnConfiguration = typeof discoveredVpnConfigurations.$inferSelect;
export type InsertDiscoveredVpnConfiguration = z.infer<typeof insertDiscoveredVpnConfigurationSchema>;

// Organization Invitations
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "declined", "expired"]);

export const organizationInvitations = pgTable("organization_invitations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id).notNull(),
  invitedEmail: text("invited_email").notNull(), // Email dell'utente invitato
  invitedUserId: uuid("invited_user_id").references(() => users.id), // Null se l'utente non ha ancora account
  role: organizationRoleEnum("role").default("member").notNull(),
  status: invitationStatusEnum("status").default("pending").notNull(),
  message: text("message"), // Messaggio opzionale dall'invitante
  token: text("token").notNull().unique(), // Token unico per l'invito
  expiresAt: timestamp("expires_at").notNull(), // Data scadenza invito
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type InsertOrganizationInvitation = typeof organizationInvitations.$inferInsert;
export const insertOrganizationInvitationSchema = createInsertSchema(organizationInvitations).omit({ id: true, createdAt: true, updatedAt: true });

// Email Verification Tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  email: text("email").notNull(), // Email da verificare
  token: text("token").notNull().unique(), // Token unico per la verifica
  expiresAt: timestamp("expires_at").notNull(), // Data scadenza token (24 ore)
  verifiedAt: timestamp("verified_at"), // Quando è stato verificato
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).omit({ id: true, createdAt: true, updatedAt: true });

// SAP Transport Request System
export const sapTransportStatusEnum = pgEnum("sap_transport_status", ["modifiable", "released", "imported", "error"]);
export const sapTaskTypeEnum = pgEnum("sap_task_type", ["development", "customizing", "repair"]);
export const sapObjectTypeEnum = pgEnum("sap_object_type", ["program", "function", "class", "table", "view", "report", "screen", "smartform", "webdynpro", "other"]);

// Transport Requests - Richieste di trasporto SAP
export const sapTransportRequests = pgTable("sap_transport_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // SAP identifiers
  requestNumber: text("request_number").notNull().unique(), // es. DEVK900123
  description: text("description").notNull(),
  status: sapTransportStatusEnum("status").default("modifiable").notNull(),
  owner: text("owner").notNull(), // SAP username
  targetSystem: text("target_system"), // Sistema target (es. QAS, PRD)
  
  // Project association (opzionale per TR importate da OData)
  projectId: uuid("project_id").references(() => projects.id),
  
  // Organization context
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  
  // SAP dates
  createdDate: timestamp("created_date"),
  releasedDate: timestamp("released_date"),
  importedDate: timestamp("imported_date"),
  
  // Metadata
  sapSystemId: uuid("sap_system_id").references(() => sapSystems.id), // Sistema SAP di origine
  category: text("category"), // Categoria trasporto (es. CUST, WORKBENCH)
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Transport Tasks - Task associati alle transport request
export const sapTransportTasks = pgTable("sap_transport_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // SAP identifiers
  taskNumber: text("task_number").notNull().unique(), // es. DEVK900124
  requestId: uuid("request_id").references(() => sapTransportRequests.id, { onDelete: "cascade" }).notNull(),
  description: text("description"),
  taskType: sapTaskTypeEnum("task_type").default("development").notNull(),
  owner: text("owner").notNull(), // SAP username
  status: sapTransportStatusEnum("status").default("modifiable").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Transport Objects - Oggetti modificati nelle transport request
export const sapTransportObjects = pgTable("sap_transport_objects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // SAP identifiers
  requestId: uuid("request_id").references(() => sapTransportRequests.id, { onDelete: "cascade" }).notNull(),
  taskId: uuid("task_id").references(() => sapTransportTasks.id, { onDelete: "cascade" }),
  
  // Object info
  objectType: sapObjectTypeEnum("object_type").default("other").notNull(),
  objectName: text("object_name").notNull(), // Nome oggetto SAP
  objectKey: text("object_key"), // Chiave oggetto (es. per funzioni, classi)
  packageName: text("package_name"), // Package/Devclass
  
  // Lock info
  lockStatus: text("lock_status"), // Stato del lock
  lockedBy: text("locked_by"), // Utente che ha il lock
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Object Content - Contenuto degli oggetti SAP
export const sapObjectContent = pgTable("sap_object_content", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  objectId: uuid("object_id").references(() => sapTransportObjects.id, { onDelete: "cascade" }).notNull(),
  
  // Content info
  contentType: text("content_type").notNull(), // "source", "documentation", "metadata"
  content: text("content").notNull(), // Contenuto effettivo (codice sorgente, doc, etc.)
  lineNumber: integer("line_number"), // Numero riga per il codice
  
  // Metadata
  language: text("language").default("ABAP"), // Linguaggio
  encoding: text("encoding").default("UTF-8"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ========== Project Assignments & Milestones ==========

// Engagement/Assignment Types
export const engagementTypeEnum = pgEnum("engagement_type", ["fixed", "hourly"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["active", "completed", "cancelled"]);
export const milestoneStatusEnum = pgEnum("milestone_status", ["planned", "in_progress", "completed", "cancelled"]);
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["draft", "approved", "sent", "received", "cancelled"]);
export const vendorInvoiceStatusEnum = pgEnum("vendor_invoice_status", ["draft", "received", "approved", "paid", "cancelled"]);

// Project Assignments - Ingaggi freelance sui progetti
export const projectAssignments = pgTable("project_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  resourceId: uuid("resource_id").references(() => humanResources.id).notNull(), // Il freelance
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  
  // Tipo di compenso
  engagementType: engagementTypeEnum("engagement_type").notNull(),
  
  // Importi
  fixedAmount: decimal("fixed_amount", { precision: 10, scale: 2 }), // Se tipo 'fixed'
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }), // Se tipo 'hourly'
  estimatedHours: decimal("estimated_hours", { precision: 8, scale: 2 }), // Stima ore per budget
  currency: text("currency").default("EUR").notNull(),
  
  // Date e stato
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: assignmentStatusEnum("status").default("active").notNull(),
  
  // Note e descrizione
  title: text("title").notNull(), // "Sviluppo Feature X"
  description: text("description"),
  notes: text("notes"),
  
  // Auto-generazione Purchase Order
  autoPurchaseOrderGenerated: boolean("auto_purchase_order_generated").default(false).notNull(),
  purchaseOrderId: uuid("purchase_order_id"), // PO generato automaticamente (FK aggiunto dopo)
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Project Milestones - Milestone/Gantt per progetti
export const projectMilestones = pgTable("project_milestones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  
  // Informazioni milestone
  name: text("name").notNull(), // "Sprint 1", "Alpha Release", "Go-Live"
  description: text("description"),
  
  // Date e durata (solo stringhe YYYY-MM-DD, no timezone)
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  completedDate: text("completed_date"), // Data effettiva completamento
  
  // Stato e progresso
  status: milestoneStatusEnum("status").default("planned").notNull(),
  progress: integer("progress").default(0).notNull(), // 0-100
  
  // Budget e costi
  budgetAmount: decimal("budget_amount", { precision: 10, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }),
  currency: text("currency").default("EUR").notNull(),
  
  // Dipendenze
  dependsOnMilestoneId: uuid("depends_on_milestone_id"), // Milestone prerequisito (FK self-reference)
  
  // Ordine di visualizzazione
  displayOrder: integer("display_order").default(0).notNull(),
  
  // Deliverables e note
  deliverables: text("deliverables"), // Cosa deve essere consegnato
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ========== Procurement (Acquisti) ==========

// Purchase Orders - Ordini di acquisto
export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  
  // Numero e riferimenti
  orderNumber: text("order_number").notNull().unique(), // PO-2025-001
  vendorOrganizationId: uuid("vendor_organization_id").references(() => organizations.id), // Organizzazione fornitore
  vendorPartnerId: uuid("vendor_partner_id").references(() => partners.id), // Partner fornitore (se non ha org)
  vendorName: text("vendor_name").notNull(), // Nome fornitore (denormalizzato per storico)
  
  // Progetto collegato
  projectId: uuid("project_id").references(() => projects.id),
  projectAssignmentId: uuid("project_assignment_id"), // Se generato da assignment (FK aggiunto dopo)
  
  // Importi
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default('0').notNull(),
  currency: text("currency").default("EUR").notNull(),
  
  // Date
  orderDate: timestamp("order_date").defaultNow().notNull(),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  
  // Stato
  status: purchaseOrderStatusEnum("status").default("draft").notNull(),
  
  // Descrizione e note
  description: text("description").notNull(),
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  
  // Tracking
  sentDate: timestamp("sent_date"),
  receivedDate: timestamp("received_date"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Vendor Invoices - Fatture fornitori
export const vendorInvoices = pgTable("vendor_invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(), // Data segregation
  
  // Numero fattura e riferimenti
  invoiceNumber: text("invoice_number").notNull(), // Numero fattura del fornitore
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id), // PO collegato
  vendorOrganizationId: uuid("vendor_organization_id").references(() => organizations.id), // Organizzazione fornitore
  vendorPartnerId: uuid("vendor_partner_id").references(() => partners.id), // Partner fornitore
  vendorName: text("vendor_name").notNull(), // Nome fornitore (denormalizzato)
  
  // Progetto collegato
  projectId: uuid("project_id").references(() => projects.id),
  
  // Importi
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default('0').notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("EUR").notNull(),
  
  // Date
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  receivedDate: timestamp("received_date").defaultNow().notNull(), // Quando è arrivata
  paidDate: timestamp("paid_date"), // Quando è stata pagata
  
  // Stato
  status: vendorInvoiceStatusEnum("status").default("received").notNull(),
  
  // Descrizione e allegati
  description: text("description").notNull(),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"), // URL del PDF fattura
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Audit Log System - Universal change tracking for all entities
export const auditActionEnum = pgEnum("audit_action", ["CREATE", "UPDATE", "DELETE"]);

// Email Feedback System
export const feedbackCategoryEnum = pgEnum("feedback_category", [
  "missing-content", 
  "wrong-order", 
  "mixed-threads", 
  "extra-content", 
  "signature-issues",
  "thread-not-collapsed",
  "thread-badly-collapsed", 
  "other"
]);

export const emailFeedbacks = pgTable("email_feedbacks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Core feedback data
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  
  // Feedback content
  isCorrect: boolean("is_correct").notNull(),
  category: feedbackCategoryEnum("category"), // null for positive feedback
  comment: text("comment"), // Optional user comment
  customReasonId: uuid("custom_reason_id").references(() => customFeedbackReasons.id, { onDelete: "set null" }), // Link to existing custom reason
  
  // Message metadata for analysis
  messageSubject: text("message_subject"),
  fromEmail: text("from_email"),
  messageLength: integer("message_length"), // Length of body text
  hasHtml: boolean("has_html"),
  htmlLength: integer("html_length"), // Length of HTML content
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Tracking info
  tableName: text("table_name").notNull(), // "projects", "tasks", "partners", etc.
  recordId: text("record_id").notNull(), // UUID of the modified record
  action: auditActionEnum("action").notNull(),
  
  // Change details
  oldValues: jsonb("old_values"), // JSON object of old field values (null for CREATE)
  newValues: jsonb("new_values"), // JSON object of new field values (null for DELETE)  
  changedFields: text("changed_fields").array(), // Array of field names that changed
  
  // Context
  userId: uuid("user_id").references(() => users.id).notNull(), // Who made the change
  userAgent: text("user_agent"), // Browser/client info
  ipAddress: text("ip_address"), // IP address
  
  // Organization context (for data segregation)
  organizationId: uuid("organization_id").references(() => organizations.id),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Custom Feedback Reasons - to store user-defined reasons for "other" category
export const customFeedbackReasons = pgTable("custom_feedback_reasons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  reason: text("reason").notNull(), // The custom reason text
  usageCount: integer("usage_count").default(1).notNull(), // How many times it's been used
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailFeedback = typeof emailFeedbacks.$inferSelect;
export type InsertEmailFeedback = typeof emailFeedbacks.$inferInsert;
export const insertEmailFeedbackSchema = createInsertSchema(emailFeedbacks).omit({ id: true, createdAt: true });

export type CustomFeedbackReason = typeof customFeedbackReasons.$inferSelect;
export type InsertCustomFeedbackReason = typeof customFeedbackReasons.$inferInsert;
export const insertCustomFeedbackReasonSchema = createInsertSchema(customFeedbackReasons).omit({ id: true, createdAt: true, updatedAt: true });

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

export type EmailTrainingSelection = typeof emailTrainingSelections.$inferSelect;
export type InsertEmailTrainingSelection = typeof emailTrainingSelections.$inferInsert;
export const insertEmailTrainingSelectionSchema = createInsertSchema(emailTrainingSelections).omit({ id: true, createdAt: true, updatedAt: true });

// SAP Transport Request types
export type SapTransportRequest = typeof sapTransportRequests.$inferSelect;
export type InsertSapTransportRequest = typeof sapTransportRequests.$inferInsert;
export const insertSapTransportRequestSchema = createInsertSchema(sapTransportRequests).omit({ id: true, createdAt: true, updatedAt: true });

export type SapTransportTask = typeof sapTransportTasks.$inferSelect;
export type InsertSapTransportTask = typeof sapTransportTasks.$inferInsert;
export const insertSapTransportTaskSchema = createInsertSchema(sapTransportTasks).omit({ id: true, createdAt: true, updatedAt: true });

export type SapTransportObject = typeof sapTransportObjects.$inferSelect;
export type InsertSapTransportObject = typeof sapTransportObjects.$inferInsert;
export const insertSapTransportObjectSchema = createInsertSchema(sapTransportObjects).omit({ id: true, createdAt: true, updatedAt: true });

export type SapObjectContent = typeof sapObjectContent.$inferSelect;
export type InsertSapObjectContent = typeof sapObjectContent.$inferInsert;
export const insertSapObjectContentSchema = createInsertSchema(sapObjectContent).omit({ id: true, createdAt: true, updatedAt: true });

// Relations for audit logs
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
}));

// Relations for message links
export const messageLinksRelations = relations(messageLinks, ({ one }) => ({
  message: one(messages, {
    fields: [messageLinks.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageLinks.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [messageLinks.organizationId],
    references: [organizations.id],
  }),
}));

// Relations for email feedbacks
export const emailFeedbacksRelations = relations(emailFeedbacks, ({ one }) => ({
  message: one(messages, {
    fields: [emailFeedbacks.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [emailFeedbacks.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [emailFeedbacks.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  partner: one(partners, { fields: [organizations.partnerId], references: [partners.id] }),
  userOrganizations: many(userOrganizations),
  projects: many(projects),
  tasks: many(tasks),
  partners: many(partners, { relationName: "organizationPartners" }),
  deals: many(deals),
  calendarEvents: many(calendarEvents),
  messages: many(messages),
  messageLinks: many(messageLinks),
  salesOrders: many(salesOrders),
  sapSystems: many(sapSystems),
  vpnConnections: many(vpnConnections),
  organizationDomains: many(organizationDomains),
  emailConfigs: many(emailConfigs),
  sourceBusinessScenarios: many(businessScenarios, { relationName: "sourceBusinessScenarios" }),
  targetBusinessScenarios: many(businessScenarios, { relationName: "targetBusinessScenarios" }),
}));

// Relations for organization domains
export const organizationDomainsRelations = relations(organizationDomains, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationDomains.organizationId],
    references: [organizations.id],
  }),
}));

// Relations for email training selections
export const emailTrainingSelectionsRelations = relations(emailTrainingSelections, ({ one }) => ({
  message: one(messages, {
    fields: [emailTrainingSelections.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [emailTrainingSelections.userId],
    references: [users.id],
  }),
}));

// Relations for SAP Transport Requests
export const sapTransportRequestsRelations = relations(sapTransportRequests, ({ one, many }) => ({
  project: one(projects, {
    fields: [sapTransportRequests.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [sapTransportRequests.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [sapTransportRequests.organizationId],
    references: [organizations.id],
  }),
  sapSystem: one(sapSystems, {
    fields: [sapTransportRequests.sapSystemId],
    references: [sapSystems.id],
  }),
  tasks: many(sapTransportTasks),
  objects: many(sapTransportObjects),
}));

// Relations for SAP Transport Tasks
export const sapTransportTasksRelations = relations(sapTransportTasks, ({ one, many }) => ({
  request: one(sapTransportRequests, {
    fields: [sapTransportTasks.requestId],
    references: [sapTransportRequests.id],
  }),
  objects: many(sapTransportObjects),
}));

// Relations for SAP Transport Objects
export const sapTransportObjectsRelations = relations(sapTransportObjects, ({ one, many }) => ({
  request: one(sapTransportRequests, {
    fields: [sapTransportObjects.requestId],
    references: [sapTransportRequests.id],
  }),
  task: one(sapTransportTasks, {
    fields: [sapTransportObjects.taskId],
    references: [sapTransportTasks.id],
  }),
  contents: many(sapObjectContent),
}));

// Relations for SAP Object Content
export const sapObjectContentRelations = relations(sapObjectContent, ({ one }) => ({
  object: one(sapTransportObjects, {
    fields: [sapObjectContent.objectId],
    references: [sapTransportObjects.id],
  }),
}));

// Relations for Project Assignments
export const projectAssignmentsRelations = relations(projectAssignments, ({ one }) => ({
  project: one(projects, {
    fields: [projectAssignments.projectId],
    references: [projects.id],
  }),
  resource: one(humanResources, {
    fields: [projectAssignments.resourceId],
    references: [humanResources.id],
  }),
  user: one(users, {
    fields: [projectAssignments.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [projectAssignments.organizationId],
    references: [organizations.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [projectAssignments.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));

// Relations for Project Milestones
export const projectMilestonesRelations = relations(projectMilestones, ({ one }) => ({
  project: one(projects, {
    fields: [projectMilestones.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMilestones.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [projectMilestones.organizationId],
    references: [organizations.id],
  }),
  dependsOnMilestone: one(projectMilestones, {
    fields: [projectMilestones.dependsOnMilestoneId],
    references: [projectMilestones.id],
    relationName: "milestoneDependency",
  }),
}));

// Relations for Purchase Orders
export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [purchaseOrders.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [purchaseOrders.organizationId],
    references: [organizations.id],
  }),
  vendorOrganization: one(organizations, {
    fields: [purchaseOrders.vendorOrganizationId],
    references: [organizations.id],
    relationName: "vendorPurchaseOrders",
  }),
  vendorPartner: one(partners, {
    fields: [purchaseOrders.vendorPartnerId],
    references: [partners.id],
  }),
  project: one(projects, {
    fields: [purchaseOrders.projectId],
    references: [projects.id],
  }),
  projectAssignment: one(projectAssignments, {
    fields: [purchaseOrders.projectAssignmentId],
    references: [projectAssignments.id],
  }),
  vendorInvoices: many(vendorInvoices),
}));

// Relations for Vendor Invoices
export const vendorInvoicesRelations = relations(vendorInvoices, ({ one }) => ({
  user: one(users, {
    fields: [vendorInvoices.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [vendorInvoices.organizationId],
    references: [organizations.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [vendorInvoices.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  vendorOrganization: one(organizations, {
    fields: [vendorInvoices.vendorOrganizationId],
    references: [organizations.id],
    relationName: "vendorInvoices",
  }),
  vendorPartner: one(partners, {
    fields: [vendorInvoices.vendorPartnerId],
    references: [partners.id],
  }),
  project: one(projects, {
    fields: [vendorInvoices.projectId],
    references: [projects.id],
  }),
}));

// Business Scenarios - Organization relationships for business flows
export const relationshipTypeEnum = pgEnum("relationship_type", [
  "cliente_fattura", // Cliente destinatario fattura
  "cliente_servizio", // Cliente destinatario servizio
  "cliente_timesheet", // Cliente destinatario timesheet
  "fornitore", // Fornitore/vendor
  "partner", // Partner commerciale
  "subappaltatore", // Subcontractor
]);

export const businessScenarios = pgTable("business_scenarios", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceOrganizationId: uuid("source_organization_id").references(() => organizations.id).notNull(),
  targetOrganizationId: uuid("target_organization_id").references(() => organizations.id).notNull(),
  relationshipType: relationshipTypeEnum("relationship_type").notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const businessScenariosRelations = relations(businessScenarios, ({ one }) => ({
  sourceOrganization: one(organizations, {
    fields: [businessScenarios.sourceOrganizationId],
    references: [organizations.id],
    relationName: "sourceBusinessScenarios",
  }),
  targetOrganization: one(organizations, {
    fields: [businessScenarios.targetOrganizationId],
    references: [organizations.id],
    relationName: "targetBusinessScenarios",
  }),
}));

// ========================================
// METADATA SYSTEM - Custom Fields & Entities
// ========================================

export const fieldTypeEnum = pgEnum("field_type", [
  "text", "number", "date", "boolean", "select", "relation"
]);

export const fieldStatusEnum = pgEnum("field_status", [
  "active", "retired"
]);

// Custom Entities - User-defined or system entities with extensibility
export const customEntities = pgTable("custom_entities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // Display name
  slug: text("slug").notNull(), // Unique identifier (projects, tasks, custom_inventory, etc.)
  description: text("description"),
  baseTable: text("base_table"), // If extending a system table (e.g., "projects", "tasks")
  isSystem: boolean("is_system").default(false).notNull(), // True for core entities (non-deletable)
  icon: text("icon"), // Lucide icon name
  color: text("color"), // Hex color
  config: jsonb("config"), // Additional entity configuration
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSlugPerOrg: uniqueIndex("custom_entities_org_slug_idx").on(table.organizationId, table.slug),
}));

// Custom Fields - User-defined fields for entities
export const customFields = pgTable("custom_fields", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  entityId: uuid("entity_id").references(() => customEntities.id).notNull(),
  fieldKey: text("field_key").notNull(), // Unique identifier within entity
  label: text("label").notNull(), // Display label
  description: text("description"),
  fieldType: fieldTypeEnum("field_type").notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  isUnique: boolean("is_unique").default(false).notNull(),
  defaultValue: jsonb("default_value"), // Default value for new records
  validationRules: jsonb("validation_rules"), // {min, max, pattern, minLength, maxLength, etc}
  options: jsonb("options"), // For select type: [{value, label}]
  relationTargetEntityId: uuid("relation_target_entity_id").references(() => customEntities.id), // For relation type
  uiSchema: jsonb("ui_schema"), // {placeholder, helpText, width, order, section}
  status: fieldStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueFieldKeyPerEntity: uniqueIndex("custom_fields_entity_key_idx").on(table.entityId, table.fieldKey),
}));

// Custom Field Mappings - Link custom fields to existing system table columns
export const customFieldMappings = pgTable("custom_field_mappings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  customFieldId: uuid("custom_field_id").references(() => customFields.id).notNull(),
  systemTable: text("system_table").notNull(), // e.g., "projects", "tasks"
  systemColumn: text("system_column").notNull(), // e.g., "description", "status"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Custom Records - Storage for fully custom entities (not extending system tables)
export const customRecords = pgTable("custom_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: uuid("entity_id").references(() => customEntities.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  recordId: uuid("record_id").notNull(), // UUID for the custom record
  data: jsonb("data").notNull(), // All field values in JSONB: {fieldKey: {value, display, metadata}}
  version: integer("version").default(1).notNull(), // For optimistic locking
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  entityRecordIdx: index("custom_records_entity_record_idx").on(table.entityId, table.recordId),
}));

// Custom Record Relations - Storage for relation-type fields
export const customRecordRelations = pgTable("custom_record_relations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  sourceEntityId: uuid("source_entity_id").references(() => customEntities.id).notNull(),
  sourceRecordId: uuid("source_record_id").notNull(),
  fieldId: uuid("field_id").references(() => customFields.id).notNull(),
  targetEntityId: uuid("target_entity_id").references(() => customEntities.id).notNull(),
  targetRecordId: uuid("target_record_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sourceIdx: index("custom_record_relations_source_idx").on(table.sourceEntityId, table.sourceRecordId, table.fieldId),
  targetIdx: index("custom_record_relations_target_idx").on(table.targetEntityId, table.targetRecordId),
}));

// Entity Custom Values - Storage for custom field values on core/system entities
export const entityCustomValues = pgTable("entity_custom_values", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  entityKey: text("entity_key").notNull(), // "projects", "tasks", etc.
  recordId: uuid("record_id").notNull(), // ID of the record in the entity table
  fieldId: uuid("field_id").references(() => customFields.id).notNull(),
  fieldKey: text("field_key").notNull(), // Denormalized for query performance
  value: jsonb("value").notNull(), // {value, display, metadata}
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  entityRecordIdx: index("entity_custom_values_entity_record_idx").on(table.entityKey, table.recordId),
  fieldIdx: index("entity_custom_values_field_idx").on(table.fieldId),
}));

// ========================================
// WORKFLOW SYSTEM - Event-Driven Automations
// ========================================

export const triggerTypeEnum = pgEnum("trigger_type", [
  "onCreate", "onUpdate", "onDelete", "onFieldChange"
]);

export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft", "active", "inactive", "error"
]);

export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "pending", "running", "completed", "failed", "cancelled"
]);

export const actionTypeEnum = pgEnum("action_type", [
  "createRecord", "updateRecord", "deleteRecord", "sendEmail", "sendNotification", "callWebhook"
]);

// Workflow Definitions - User-configured automation rules
export const workflowDefinitions = pgTable("workflow_definitions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: triggerTypeEnum("trigger_type").notNull(),
  triggerEntityId: uuid("trigger_entity_id").references(() => customEntities.id).notNull(),
  conditions: jsonb("conditions").notNull(), // {operator: 'AND', rules: [{field, operator, value}]}
  actions: jsonb("actions").notNull(), // [{type, config: {...}}]
  status: workflowStatusEnum("status").default("draft").notNull(),
  version: integer("version").default(1).notNull(),
  executionOrder: integer("execution_order").default(0).notNull(), // For multiple workflows on same trigger
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  triggerEntityIdx: index("workflow_definitions_trigger_entity_idx").on(table.triggerEntityId, table.status),
}));

// Workflow Runs - Execution history
export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowDefinitionId: uuid("workflow_definition_id").references(() => workflowDefinitions.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  triggerRecordId: uuid("trigger_record_id").notNull(), // Record that triggered the workflow
  status: workflowRunStatusEnum("status").default("pending").notNull(),
  context: jsonb("context").notNull(), // {record, oldRecord, user, organization, trigger}
  error: text("error"), // Error message if failed
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
}, (table) => ({
  workflowIdx: index("workflow_runs_workflow_idx").on(table.workflowDefinitionId, table.status),
}));

// Workflow Action Logs - Individual action execution logs
export const workflowActionLogs = pgTable("workflow_action_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id).notNull(),
  actionType: actionTypeEnum("action_type").notNull(),
  actionConfig: jsonb("action_config").notNull(), // The action configuration
  status: text("status").notNull(), // success, failed
  result: jsonb("result"), // Result data
  error: text("error"), // Error message if failed
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

// ========================================
// PERMISSION SYSTEM - Role-Based Access Control
// ========================================

// Custom Roles - User-defined roles with inheritance
export const customRoles = pgTable("custom_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // e.g., "Project Manager", "Accountant"
  description: text("description"),
  inheritsFromRoleId: uuid("inherits_from_role_id"), // Self-reference for role inheritance
  systemRole: organizationRoleEnum("system_role"), // Link to system role (owner, admin, member, viewer)
  priority: integer("priority").default(0).notNull(), // Higher priority = more permissions
  isSystem: boolean("is_system").default(false).notNull(), // True for default roles (non-deletable)
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueNamePerOrg: uniqueIndex("custom_roles_org_name_idx").on(table.organizationId, table.name),
}));

// Role Entity Permissions - CRUD permissions per entity
export const roleEntityPermissions = pgTable("role_entity_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: uuid("role_id").references(() => customRoles.id).notNull(),
  entityId: uuid("entity_id").references(() => customEntities.id).notNull(),
  canCreate: boolean("can_create").default(false).notNull(),
  canRead: boolean("can_read").default(false).notNull(),
  canUpdate: boolean("can_update").default(false).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueRoleEntity: uniqueIndex("role_entity_permissions_role_entity_idx").on(table.roleId, table.entityId),
}));

// Role Field Permissions - Field-level view/edit permissions
export const roleFieldPermissions = pgTable("role_field_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: uuid("role_id").references(() => customRoles.id).notNull(),
  entityId: uuid("entity_id").references(() => customEntities.id).notNull(),
  fieldId: uuid("field_id").references(() => customFields.id).notNull(),
  canViewField: boolean("can_view_field").default(false).notNull(),
  canEditField: boolean("can_edit_field").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueRoleField: uniqueIndex("role_field_permissions_role_field_idx").on(table.roleId, table.fieldId),
}));

// User Custom Roles - Assignment of users to custom roles
export const userCustomRoles = pgTable("user_custom_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  roleId: uuid("role_id").references(() => customRoles.id).notNull(),
  assignedBy: uuid("assigned_by").references(() => users.id).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserOrgRole: uniqueIndex("user_custom_roles_user_org_role_idx").on(table.userId, table.organizationId, table.roleId),
}));

// ========== Insert Schemas for New Tables ==========

export const insertProjectAssignmentSchema = createInsertSchema(projectAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectMilestoneSchema = createInsertSchema(projectMilestones, {
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data non valido (richiesto YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data non valido (richiesto YYYY-MM-DD)"),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data non valido (richiesto YYYY-MM-DD)").optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVendorInvoiceSchema = createInsertSchema(vendorInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ========== Type Exports for New Tables ==========

export type ProjectAssignment = typeof projectAssignments.$inferSelect;
export type InsertProjectAssignment = z.infer<typeof insertProjectAssignmentSchema>;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type InsertProjectMilestone = z.infer<typeof insertProjectMilestoneSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type VendorInvoice = typeof vendorInvoices.$inferSelect;
export type InsertVendorInvoice = z.infer<typeof insertVendorInvoiceSchema>;

export const insertBusinessScenarioSchema = createInsertSchema(businessScenarios).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BusinessScenario = typeof businessScenarios.$inferSelect;
export type InsertBusinessScenario = z.infer<typeof insertBusinessScenarioSchema>;

// ========== Insert Schemas & Types for Metadata System ==========

export const insertCustomEntitySchema = createInsertSchema(customEntities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomFieldSchema = createInsertSchema(customFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomFieldMappingSchema = createInsertSchema(customFieldMappings).omit({
  id: true,
  createdAt: true,
});

export const insertCustomRecordSchema = createInsertSchema(customRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomRecordRelationSchema = createInsertSchema(customRecordRelations).omit({
  id: true,
  createdAt: true,
});

export const insertEntityCustomValueSchema = createInsertSchema(entityCustomValues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CustomEntity = typeof customEntities.$inferSelect;
export type InsertCustomEntity = z.infer<typeof insertCustomEntitySchema>;
export type CustomField = typeof customFields.$inferSelect;
export type InsertCustomField = z.infer<typeof insertCustomFieldSchema>;
export type CustomFieldMapping = typeof customFieldMappings.$inferSelect;
export type InsertCustomFieldMapping = z.infer<typeof insertCustomFieldMappingSchema>;
export type CustomRecord = typeof customRecords.$inferSelect;
export type InsertCustomRecord = z.infer<typeof insertCustomRecordSchema>;
export type CustomRecordRelation = typeof customRecordRelations.$inferSelect;
export type InsertCustomRecordRelation = z.infer<typeof insertCustomRecordRelationSchema>;
export type EntityCustomValue = typeof entityCustomValues.$inferSelect;
export type InsertEntityCustomValue = z.infer<typeof insertEntityCustomValueSchema>;

// ========== Insert Schemas & Types for Workflow System ==========

export const insertWorkflowDefinitionSchema = createInsertSchema(workflowDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({
  id: true,
  startedAt: true,
});

export const insertWorkflowActionLogSchema = createInsertSchema(workflowActionLogs).omit({
  id: true,
  executedAt: true,
});

export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type InsertWorkflowDefinition = z.infer<typeof insertWorkflowDefinitionSchema>;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type WorkflowActionLog = typeof workflowActionLogs.$inferSelect;
export type InsertWorkflowActionLog = z.infer<typeof insertWorkflowActionLogSchema>;

// ========== Insert Schemas & Types for Permission System ==========

export const insertCustomRoleSchema = createInsertSchema(customRoles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoleEntityPermissionSchema = createInsertSchema(roleEntityPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoleFieldPermissionSchema = createInsertSchema(roleFieldPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCustomRoleSchema = createInsertSchema(userCustomRoles).omit({
  id: true,
  assignedAt: true,
});

export type CustomRole = typeof customRoles.$inferSelect;
export type InsertCustomRole = z.infer<typeof insertCustomRoleSchema>;
export type RoleEntityPermission = typeof roleEntityPermissions.$inferSelect;
export type InsertRoleEntityPermission = z.infer<typeof insertRoleEntityPermissionSchema>;
export type RoleFieldPermission = typeof roleFieldPermissions.$inferSelect;
export type InsertRoleFieldPermission = z.infer<typeof insertRoleFieldPermissionSchema>;
export type UserCustomRole = typeof userCustomRoles.$inferSelect;
export type InsertUserCustomRole = z.infer<typeof insertUserCustomRoleSchema>;

// ========== Chat System Tables ==========

export const chatRoomTypeEnum = pgEnum("chat_room_type", ["direct", "group"]);
export const chatEntityTypeEnum = pgEnum("chat_entity_type", ["project", "partner", "deal", "contact", "task", "organization", "human_resource"]);

// Chat Rooms - Both internal team chats and external client chats
export const chatRooms = pgTable("chat_rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"), // Null for direct chats, required for groups
  type: chatRoomTypeEnum("type").default("direct").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  isExternal: boolean("is_external").default(false).notNull(), // True if includes external contacts
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Chat Messages
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: uuid("room_id").references(() => chatRooms.id).notNull(),
  senderId: uuid("sender_id").references(() => users.id), // Internal user
  senderContactId: uuid("sender_contact_id").references(() => contacts.id), // External contact
  message: text("message").notNull(),
  attachmentUrl: text("attachment_url"), // URL to uploaded file
  attachmentName: text("attachment_name"), // Original filename
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chat Participants - Links users/contacts to rooms
export const chatParticipants = pgTable("chat_participants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: uuid("room_id").references(() => chatRooms.id).notNull(),
  userId: uuid("user_id").references(() => users.id), // Internal user
  contactId: uuid("contact_id").references(() => contacts.id), // External contact
  isActive: boolean("is_active").default(true).notNull(),
  lastReadAt: timestamp("last_read_at"), // Track read status
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

// Chat Room Entity Links - Connect chats to projects, partners, deals, etc.
export const chatRoomEntities = pgTable("chat_room_entities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: uuid("room_id").references(() => chatRooms.id).notNull(),
  entityType: chatEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(), // ID of the linked entity
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ========== Insert Schemas & Types for Chat System ==========

export const insertChatRoomSchema = createInsertSchema(chatRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertChatParticipantSchema = createInsertSchema(chatParticipants).omit({
  id: true,
  joinedAt: true,
});

export const insertChatRoomEntitySchema = createInsertSchema(chatRoomEntities).omit({
  id: true,
  createdAt: true,
});

export type ChatRoom = typeof chatRooms.$inferSelect;
export type InsertChatRoom = z.infer<typeof insertChatRoomSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type InsertChatParticipant = z.infer<typeof insertChatParticipantSchema>;
export type ChatRoomEntity = typeof chatRoomEntities.$inferSelect;
export type InsertChatRoomEntity = z.infer<typeof insertChatRoomEntitySchema>;

// ========== Test Execution System ==========

export const testResultEnum = pgEnum("test_result", ["success", "failed", "partial", "blocked"]);

export const testExecutions = pgTable("test_executions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  testName: text("test_name").notNull(),
  testResult: testResultEnum("test_result").notNull(),
  description: text("description"),
  executionLog: text("execution_log"), // Log dettagliato dell'esecuzione
  screenshotPaths: text("screenshot_paths").array().default([]), // Array di path per gli screenshot
  executedBy: uuid("executed_by").references(() => users.id).notNull(),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(), // Owner
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ========== Insert Schemas & Types for Test Executions ==========

export const insertTestExecutionSchema = createInsertSchema(testExecutions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  executedAt: true,
});

export type TestExecution = typeof testExecutions.$inferSelect;
export type InsertTestExecution = z.infer<typeof insertTestExecutionSchema>;

// ========== Entity Field Metadata System ==========
// Metadati dinamici per configurazione layout tabelle

export const metadataFieldTypeEnum = pgEnum("metadata_field_type", [
  "text", "number", "boolean", "date", "datetime", "email", "url", "phone",
  "select", "multiselect", "relation", "image", "currency", "percentage", "json"
]);

export const entityFieldMetadata = pgTable("entity_field_metadata", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  entity: text("entity").notNull(), // Nome entità: "partners", "projects", "tasks", etc.
  fieldKey: text("field_key").notNull(), // Nome campo nel DB/oggetto: "name", "email", "type"
  label: text("label").notNull(), // Etichetta visualizzata: "Nome", "Email", "Tipo"
  fieldType: metadataFieldTypeEnum("metadata_field_type").default("text").notNull(), // Tipo campo per rendering
  defaultVisible: boolean("default_visible").default(true).notNull(), // Visibile di default
  sortable: boolean("sortable").default(true).notNull(), // Può essere ordinato
  filterable: boolean("filterable").default(true).notNull(), // Può essere filtrato
  searchable: boolean("searchable").default(false).notNull(), // Incluso nella ricerca globale
  displayOrder: integer("display_order").default(0).notNull(), // Ordine di visualizzazione
  width: integer("width"), // Larghezza colonna in px (null = auto)
  minWidth: integer("min_width").default(80), // Larghezza minima
  // Configurazione per tipi speciali
  relationEntity: text("relation_entity"), // Per type=relation: entità collegata
  relationDisplayField: text("relation_display_field"), // Campo da mostrare nella relazione
  selectOptions: jsonb("select_options"), // Per type=select/multiselect: [{value, label}]
  formatPattern: text("format_pattern"), // Pattern di formattazione (es. per date, currency)
  // Metadati aggiuntivi
  description: text("description"), // Descrizione per tooltip
  isSystemField: boolean("is_system_field").default(false).notNull(), // Campo di sistema non modificabile
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  entityFieldIdx: uniqueIndex("entity_field_idx").on(table.entity, table.fieldKey),
}));

// ========== Insert Schemas & Types for Entity Field Metadata ==========

export const insertEntityFieldMetadataSchema = createInsertSchema(entityFieldMetadata).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EntityFieldMetadata = typeof entityFieldMetadata.$inferSelect;
export type InsertEntityFieldMetadata = z.infer<typeof insertEntityFieldMetadataSchema>;

// Relations for entityFieldMetadata (empty relations - standalone table)
export const entityFieldMetadataRelations = relations(entityFieldMetadata, ({}) => ({}));

