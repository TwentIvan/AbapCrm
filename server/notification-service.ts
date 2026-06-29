// Notification Service — generates stakeholder notifications on project events.
// Channel-agnostic: creates in-app notification records with a ready-to-send
// Italian draft body. Email sending / approval gating can be layered on top.

import { db } from "./db";
import { and, eq } from "drizzle-orm";
import { projectContacts, contacts, notifications } from "@shared/schema";
import type { Project } from "@shared/schema";

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "Pianificazione",
  in_progress: "In corso",
  review: "In revisione",
  completed: "Completato",
  on_hold: "Sospeso",
};

const ROLE_LABELS: Record<string, string> = {
  informed: "informato",
  approver: "approvatore",
  responsible: "referente",
  reviewer: "revisore",
};

/**
 * Generate stakeholder notifications when a project's status changes.
 * Only stakeholders with notify=true receive notifications.
 * Approvers get a notification flagged as requiring approval (via eventType payload).
 */
export async function notifyProjectStatusChange(
  project: Project,
  oldStatus: string,
  newStatus: string,
  userId: string,
  organizationId: string,
): Promise<number> {
  if (oldStatus === newStatus) return 0;

  // Fetch stakeholders with notify=true and their contact info
  const stakeholders = await db
    .select({
      contactId: projectContacts.contactId,
      role: projectContacts.role,
      contactName: contacts.name,
      contactEmail: contacts.email,
    })
    .from(projectContacts)
    .leftJoin(contacts, eq(projectContacts.contactId, contacts.id))
    .where(and(
      eq(projectContacts.projectId, project.id),
      eq(projectContacts.organizationId, organizationId),
      eq(projectContacts.notify, true),
    ));

  if (stakeholders.length === 0) return 0;

  const oldLabel = PROJECT_STATUS_LABELS[oldStatus] || oldStatus;
  const newLabel = PROJECT_STATUS_LABELS[newStatus] || newStatus;

  let created = 0;
  for (const sh of stakeholders) {
    const isApprover = sh.role === "approver";
    const greeting = sh.contactName ? `Gentile ${sh.contactName},` : "Gentile referente,";
    const subject = isApprover
      ? `Richiesta approvazione — Progetto "${project.name}" ora ${newLabel}`
      : `Aggiornamento progetto "${project.name}": ${newLabel}`;

    const body = isApprover
      ? `${greeting}

il progetto "${project.name}" è passato dallo stato "${oldLabel}" a "${newLabel}" e richiede la sua approvazione in qualità di ${ROLE_LABELS[sh.role || "approver"]}.

La preghiamo di confermare di aver preso visione e di approvare la fase corrente.

Cordiali saluti`
      : `${greeting}

la informiamo che il progetto "${project.name}" è passato dallo stato "${oldLabel}" a "${newLabel}".

Rimaniamo a disposizione per qualsiasi chiarimento.

Cordiali saluti`;

    await db.insert(notifications).values({
      organizationId,
      userId,
      projectId: project.id,
      contactId: sh.contactId,
      eventType: "project_status_change",
      stakeholderRole: sh.role,
      channel: "email_draft",
      status: "pending",
      subject,
      body,
      payload: { oldStatus, newStatus, projectName: project.name, requiresApproval: isApprover },
    });
    created++;
  }

  console.log(`[NOTIFICATIONS] Project ${project.id} status ${oldStatus}->${newStatus}: ${created} stakeholder notification(s) generated`);
  return created;
}
