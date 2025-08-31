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
  sapSystemId: uuid("sap_system_id").references(() => sapSystems.id), // Collegamento al sistema SAP per connessione automatica
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  estimatedEffort: integer("estimated_effort"), // in hours
  remainingEffort: integer("remaining_effort"), // in hours - automatically calculated
  completionPercentage: integer("completion_percentage").default(0).notNull(), // 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const recurrenceTypeEnum = pgEnum("recurrence_type", ["none", "daily", "weekly", "monthly", "yearly"]);
export const timesheetStatusEnum = pgEnum("timesheet_status", ["draft", "to_send", "sent", "invoiced"]);

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

// SAP Systems Management
export const sapSystemTypeEnum = pgEnum("sap_system_type", ["ecc", "s4hana", "bw", "pi", "po", "solution_manager", "crm", "srm", "other"]);
export const sapSystemStatusEnum = pgEnum("sap_system_status", ["active", "inactive", "maintenance", "test"]);

export const sapSystems = pgTable("sap_systems", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id), // Cliente a cui appartiene il sistema (opzionale)
  projectId: uuid("project_id").references(() => projects.id), // Progetto associato opzionale
  name: text("name").notNull(), // Nome del sistema (es. "PRD", "DEV", "QAS")
  description: text("description"),
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
  projects: many(projects),
  deals: many(deals),
  calendarEvents: many(calendarEvents),
  messages: many(messages),
  salesOrders: many(salesOrders),
  sapSystems: many(sapSystems),
  vpnConnections: many(vpnConnections),
  vpnSystems: many(vpnSystems),
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
  createdAt: true,
  updatedAt: true,
  lastConnected: true,
  connectionDuration: true,
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
