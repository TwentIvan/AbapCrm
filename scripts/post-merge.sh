#!/bin/bash
set -e

# Install dependencies (idempotent, handles any new packages from merged tasks).
npm install

# NOTE: Schema changes are applied via direct SQL during each task, NOT via
# `drizzle-kit push`. The live DB intentionally drifts from shared/schema.ts in
# places (e.g. intervention_documents), so an unattended `db:push` would prompt
# interactively and/or apply destructive renames. Do not add it here.
