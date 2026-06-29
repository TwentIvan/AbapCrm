// Workflow entity metadata registry.
// Describes the entities whose CRUD events can drive a workflow, and for each
// entity the fields available for conditions — with technical name, human label,
// type, and (for enums/relations) the value domain. Consumed by the workflow
// configurator UI and (later) the execution engine.

export type WorkflowFieldType = "string" | "number" | "boolean" | "date" | "enum" | "relation";

export interface WorkflowField {
  name: string;            // technical column name (camelCase as in schema)
  label: string;           // human description (Italian)
  type: WorkflowFieldType;
  enumValues?: string[];   // for type=enum
  relationEntity?: string; // for type=relation — the entityType it points to
}

export interface WorkflowEntity {
  entityType: string;      // technical name
  label: string;           // human description (Italian)
  fields: WorkflowField[];
}

// Shared enum value sets (kept in sync with shared/schema.ts)
const PROJECT_STATUS = ["planning", "in_progress", "review", "completed", "on_hold"];
const TASK_STATUS = ["todo", "in_progress", "review", "completed", "draft"];
const TASK_PRIORITY = ["low", "medium", "high", "urgent"];
const TASK_TYPE = ["development", "analysis", "design", "testing", "consulting", "meeting", "documentation", "maintenance", "support", "other"];
const PARTNER_TYPE = ["client", "vendor", "consultant", "other"];
const DEAL_STAGE = ["prospecting", "proposal", "negotiation", "closing", "won", "lost"];
const MESSAGE_STATUS = ["unread", "read", "processed", "archived"];
const MESSAGE_TYPE = ["email", "chat", "sms", "other"];
const SALES_ORDER_STATUS = ["draft", "sent", "accepted", "invoiced", "paid", "cancelled"];
const QUOTE_STATUS = ["draft", "sent", "accepted", "rejected", "expired"];

export const WORKFLOW_ENTITIES: WorkflowEntity[] = [
  {
    entityType: "project",
    label: "Progetto",
    fields: [
      { name: "name", label: "Nome", type: "string" },
      { name: "status", label: "Stato", type: "enum", enumValues: PROJECT_STATUS },
      { name: "estimatedEffort", label: "Effort stimato (h)", type: "number" },
      { name: "completionPercentage", label: "Percentuale completamento", type: "number" },
      { name: "startDate", label: "Data inizio", type: "date" },
      { name: "endDate", label: "Data fine", type: "date" },
      { name: "clientId", label: "Cliente", type: "relation", relationEntity: "partner" },
      { name: "sapSystemId", label: "Sistema SAP", type: "relation", relationEntity: "sap_system" },
    ],
  },
  {
    entityType: "task",
    label: "Task",
    fields: [
      { name: "title", label: "Titolo", type: "string" },
      { name: "status", label: "Stato", type: "enum", enumValues: TASK_STATUS },
      { name: "priority", label: "Priorità", type: "enum", enumValues: TASK_PRIORITY },
      { name: "taskType", label: "Tipo task", type: "enum", enumValues: TASK_TYPE },
      { name: "estimatedEffort", label: "Effort stimato (h)", type: "number" },
      { name: "completionPercentage", label: "Percentuale completamento", type: "number" },
      { name: "dueDate", label: "Scadenza", type: "date" },
      { name: "projectId", label: "Progetto", type: "relation", relationEntity: "project" },
      { name: "assignedTo", label: "Assegnatario", type: "string" },
      { name: "sapSystemId", label: "Sistema SAP", type: "relation", relationEntity: "sap_system" },
    ],
  },
  {
    entityType: "deal",
    label: "Opportunità",
    fields: [
      { name: "title", label: "Titolo", type: "string" },
      { name: "stage", label: "Fase", type: "enum", enumValues: DEAL_STAGE },
      { name: "value", label: "Valore", type: "number" },
      { name: "probability", label: "Probabilità (%)", type: "number" },
      { name: "expectedCloseDate", label: "Data chiusura prevista", type: "date" },
      { name: "partnerId", label: "Partner", type: "relation", relationEntity: "partner" },
    ],
  },
  {
    entityType: "partner",
    label: "Partner",
    fields: [
      { name: "name", label: "Nome", type: "string" },
      { name: "type", label: "Tipo", type: "enum", enumValues: PARTNER_TYPE },
      { name: "email", label: "Email", type: "string" },
      { name: "company", label: "Azienda", type: "string" },
    ],
  },
  {
    entityType: "contact",
    label: "Contatto",
    fields: [
      { name: "name", label: "Nome", type: "string" },
      { name: "email", label: "Email", type: "string" },
      { name: "position", label: "Ruolo", type: "string" },
      { name: "company", label: "Azienda", type: "string" },
      { name: "partnerId", label: "Partner", type: "relation", relationEntity: "partner" },
    ],
  },
  {
    entityType: "milestone",
    label: "Milestone progetto",
    fields: [
      { name: "name", label: "Nome", type: "string" },
      { name: "dueDate", label: "Scadenza", type: "date" },
      { name: "completed", label: "Completata", type: "boolean" },
      { name: "projectId", label: "Progetto", type: "relation", relationEntity: "project" },
    ],
  },
  {
    entityType: "message",
    label: "Messaggio",
    fields: [
      { name: "subject", label: "Oggetto", type: "string" },
      { name: "status", label: "Stato", type: "enum", enumValues: MESSAGE_STATUS },
      { name: "type", label: "Tipo", type: "enum", enumValues: MESSAGE_TYPE },
      { name: "fromEmail", label: "Mittente", type: "string" },
      { name: "projectId", label: "Progetto", type: "relation", relationEntity: "project" },
      { name: "partnerId", label: "Partner", type: "relation", relationEntity: "partner" },
    ],
  },
  {
    entityType: "sales_order",
    label: "Ordine di vendita",
    fields: [
      { name: "status", label: "Stato", type: "enum", enumValues: SALES_ORDER_STATUS },
      { name: "totalAmount", label: "Importo totale", type: "number" },
      { name: "partnerId", label: "Partner", type: "relation", relationEntity: "partner" },
    ],
  },
  {
    entityType: "quote",
    label: "Preventivo",
    fields: [
      { name: "status", label: "Stato", type: "enum", enumValues: QUOTE_STATUS },
      { name: "totalAmount", label: "Importo totale", type: "number" },
      { name: "validUntil", label: "Valido fino al", type: "date" },
      { name: "partnerId", label: "Partner", type: "relation", relationEntity: "partner" },
    ],
  },
  {
    entityType: "sap_system",
    label: "Sistema SAP",
    fields: [
      { name: "name", label: "Nome", type: "string" },
      { name: "systemId", label: "System ID", type: "string" },
      { name: "landscapeType", label: "Tipo landscape", type: "string" },
    ],
  },
];

// Operators available for update-condition comparisons
export const WORKFLOW_OPERATORS = [
  { value: "eq", label: "uguale (=)", types: ["string", "number", "boolean", "date", "enum", "relation"] },
  { value: "neq", label: "diverso (≠)", types: ["string", "number", "boolean", "date", "enum", "relation"] },
  { value: "gt", label: "maggiore (>)", types: ["number", "date"] },
  { value: "lt", label: "minore (<)", types: ["number", "date"] },
  { value: "gte", label: "maggiore o uguale (≥)", types: ["number", "date"] },
  { value: "lte", label: "minore o uguale (≤)", types: ["number", "date"] },
  { value: "changed", label: "cambiato (qualsiasi valore)", types: ["string", "number", "boolean", "date", "enum", "relation"] },
];
