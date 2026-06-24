ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "estimate_tokens_min" integer;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "estimate_tokens_max" integer;
