-- Phase: Proposal discussion thread + decision capture

-- Add decision fields to proposals
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS decision_summary text,
  ADD COLUMN IF NOT EXISTS decision_reasoning text;

-- Discussion role enum
DO $$ BEGIN
  CREATE TYPE proposal_discussion_role AS ENUM ('user', 'assistant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Discussion messages table
CREATE TABLE IF NOT EXISTS proposal_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  role proposal_discussion_role NOT NULL,
  content text NOT NULL,
  proposal_data_snapshot jsonb,
  user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposal_discussions_proposal_id ON proposal_discussions(proposal_id);
