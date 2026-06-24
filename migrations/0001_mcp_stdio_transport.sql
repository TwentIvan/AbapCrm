-- Phase 5: stdio transport + template-based config resolution for MCP servers

ALTER TABLE mcp_server_configs
  ADD COLUMN IF NOT EXISTS transport_type text NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS launch_command text,
  ADD COLUMN IF NOT EXISTS launch_args jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS config_template jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS field_mappings jsonb DEFAULT '{}'::jsonb;

ALTER TABLE mcp_catalog
  ADD COLUMN IF NOT EXISTS required_schema jsonb DEFAULT '{}'::jsonb;
