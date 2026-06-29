-- ============================================================================
-- DB CLEANUP — wipe business/transactional data, keep configuration & masters
-- ============================================================================
-- KEEP (NOT touched by this script):
--   • Auth/org:    users, organizations, user_organizations, organization_domains,
--                  organization_invitations, email_verification_tokens,
--                  custom_roles, user_custom_roles, role_entity_permissions,
--                  role_field_permissions
--   • AI/MCP cfg:  ai_providers, ai_models, mcp_catalog, mcp_catalog_validations,
--                  mcp_server_configs
--   • SAP/VPN/cred:sap_systems, sap_system_credentials, system_credentials,
--                  vpn_connections, vpn_systems, vpn_credentials, vpn_software,
--                  discovered_vpn_configurations, discovered_vpn_software,
--                  connection_workflows, email_configs
--   • Masters:     partners, partner_emails, partner_phones, contacts,
--                  human_resources, resource_skills, resource_availability,
--                  resource_skill_assessments, skill_catalog, planning_windows,
--                  custom_entities, custom_fields, custom_field_mappings
--
-- WIPE (emptied below): all transactional/business data.
--
-- Usage on Replit:  psql "$DATABASE_URL" -f scripts/db-cleanup.sql
-- Review before running. Wrapped in a transaction — rolls back on any error.
-- ============================================================================

BEGIN;

-- Disable FK constraint checks so we only touch the listed tables
-- (no surprise cascades to the KEEP tables).
SET session_replication_role = replica;

-- ── Messages & email processing ──────────────────────────────────────────
DELETE FROM message_links;
DELETE FROM email_training_selections;
DELETE FROM email_feedbacks;
DELETE FROM messages;

-- ── Projects, tasks & related ────────────────────────────────────────────
DELETE FROM project_contacts;
DELETE FROM project_milestones;
DELETE FROM project_shares;
DELETE FROM project_skill_requirements;
DELETE FROM project_assignments;
DELETE FROM task_required_skills;
DELETE FROM task_skill_requirements;
DELETE FROM tasks;
DELETE FROM projects;

-- ── Sales / purchasing / quotes / proposals ──────────────────────────────
DELETE FROM quote_items;
DELETE FROM quotes;
DELETE FROM sales_order_items;
DELETE FROM sales_orders;
DELETE FROM purchase_orders;
DELETE FROM vendor_invoices;
DELETE FROM proposal_discussions;
DELETE FROM proposals;
DELETE FROM rate_agreements;
DELETE FROM deals;

-- ── Workflows & notifications ────────────────────────────────────────────
DELETE FROM notifications;
DELETE FROM workflows;
DELETE FROM workflow_action_logs;
DELETE FROM workflow_runs;
DELETE FROM workflow_definitions;

-- ── Calendar & time tracking ─────────────────────────────────────────────
DELETE FROM calendar_events;
DELETE FROM calendars;
DELETE FROM time_entries;
DELETE FROM timesheets;

-- ── AI executions, learning & context ────────────────────────────────────
DELETE FROM ai_pending_actions;
DELETE FROM ai_task_executions;
DELETE FROM ai_learning_patterns;
DELETE FROM ai_abap_patterns;
DELETE FROM context_packs;
DELETE FROM intervention_documents;
DELETE FROM test_executions;

-- ── Chat ─────────────────────────────────────────────────────────────────
DELETE FROM chat_messages;
DELETE FROM chat_participants;
DELETE FROM chat_room_entities;
DELETE FROM chat_rooms;

-- ── SAP transport / object content ───────────────────────────────────────
DELETE FROM sap_object_content;
DELETE FROM sap_transport_objects;
DELETE FROM sap_transport_tasks;
DELETE FROM sap_transport_requests;
DELETE FROM transport_requests;

-- ── Org "gestisce" scenarios & misc ──────────────────────────────────────
DELETE FROM business_scenarios;
DELETE FROM comments;
DELETE FROM audit_logs;

-- Re-enable FK constraint checks
SET session_replication_role = DEFAULT;

COMMIT;

-- Done. Verify with e.g.:  SELECT count(*) FROM messages;  (expect 0)
