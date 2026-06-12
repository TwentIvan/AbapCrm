---
name: MCP validation flow
description: How mcp_catalog_validations works and how the executor enforces it
---

## Rule
`mcp_catalog_validations` is per-org (organization_id, catalog_id UNIQUE). Custom servers registered via the wizard get a `mcp_catalog` row (source="custom") at creation time so the same validation flow applies to them. The AI task executor loads all validations for the current org and skips any MCP config whose `catalogId` is set but not validated.

**Why:** Prevents the AI executor from using untrusted/unreviewed MCP servers in production tasks without explicit org-level sign-off.

**How to apply:** Any new MCP config that links to a catalog entry (catalogId non-null) must have a corresponding validated=true row in mcp_catalog_validations for the target org before the executor will use it. Configs with catalogId=null are treated as always-valid (legacy/non-catalog configs).
