-- Record which AI model/agent generated each proposal (so discussion reuses it)
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS model_key text;
