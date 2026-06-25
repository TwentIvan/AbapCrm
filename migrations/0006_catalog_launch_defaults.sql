ALTER TABLE "mcp_catalog" ADD COLUMN IF NOT EXISTS "default_launch_command" text;
ALTER TABLE "mcp_catalog" ADD COLUMN IF NOT EXISTS "default_launch_args" jsonb DEFAULT '[]';
