-- ═══════════════════════════════════════════════════════════════════════════════
-- Game Initialization System — Community Rule-Building
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Flow: Submit → Admin Approves (Community Review) → Community Builds Rules
--       → Request Approval → Admin Final Approval → Active
--
-- Tables:
--   game_rough_draft        One canonical living document per game
--   draft_proposals         Targeted change proposals to sections
--   draft_proposal_votes    Votes on proposals
--   draft_history           Version snapshots when proposals merge
--   game_role_volunteers    Mod/Verifier volunteer sign-ups

-- ─── 1. Game Rough Draft ─────────────────────────────────────────────────────
-- Single canonical document per game. Auto-seeded from submission data when
-- admin approves to Community Review. Contains ALL section data in one JSONB blob.

CREATE TABLE IF NOT EXISTS game_rough_draft (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id       text NOT NULL UNIQUE,
  version       integer NOT NULL DEFAULT 1,

  -- Section data (all sections in one blob for atomic reads)
  draft_data    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- draft_data structure:
  -- {
  --   overview:       { content: "" },
  --   categories:     { full_runs: [], mini_challenges: [], player_made: [] },
  --   rules:          { general_rules: "" },
  --   challenges:     { challenges_data: [], glitches_data: [], nmg_rules: "", glitch_doc_links: "" },
  --   restrictions:   { restrictions_data: [] },
  --   characters:     { character_column: {}, characters_data: [] },
  --   difficulties:   { difficulty_column: {}, difficulties_data: [] },
  --   achievements:   { community_achievements: [] }
  -- }

  -- Approval readiness
  approval_requested    boolean NOT NULL DEFAULT false,
  approval_requested_at timestamptz,
  approval_requested_by uuid,

  -- Metadata
  seeded_from           text,  -- 'submission' or 'manual'
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rough_draft_game ON game_rough_draft(game_id);

-- ─── 2. Draft Proposals ──────────────────────────────────────────────────────
-- Targeted change proposals to one section of the rough draft.

CREATE TABLE IF NOT EXISTS draft_proposals (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id       text NOT NULL,
  user_id       uuid NOT NULL,

  -- What section this targets
  section       text NOT NULL,
  -- Valid: overview, categories, rules, challenges, restrictions,
  --        characters, difficulties, achievements

  -- The proposed new data for that section
  proposed_data jsonb NOT NULL,

  -- Context
  title         text NOT NULL,
  notes         text,

  -- Status lifecycle: open → accepted | rejected | withdrawn
  status        text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'rejected', 'withdrawn')),

  -- Which rough draft version this was proposed against
  base_version  integer NOT NULL,

  -- Merge tracking
  merged_at     timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_game ON draft_proposals(game_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_user ON draft_proposals(user_id);

-- ─── 3. Draft Proposal Votes ─────────────────────────────────────────────────
-- One vote per user per proposal.

CREATE TABLE IF NOT EXISTS draft_proposal_votes (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id   uuid NOT NULL REFERENCES draft_proposals(id) ON DELETE CASCADE,
  game_id       text NOT NULL,
  user_id       uuid NOT NULL,
  vote          text NOT NULL CHECK (vote IN ('accept', 'reject')),
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal ON draft_proposal_votes(proposal_id);

-- ─── 4. Draft History ────────────────────────────────────────────────────────
-- Snapshot saved each time a proposal merges into the rough draft.

CREATE TABLE IF NOT EXISTS draft_history (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id         text NOT NULL,

  -- Version this snapshot represents (the PREVIOUS version, before merge)
  version         integer NOT NULL,

  -- Full rough draft state at that version
  draft_data      jsonb NOT NULL,

  -- What caused the version bump
  proposal_id     uuid REFERENCES draft_proposals(id) ON DELETE SET NULL,
  section_changed text NOT NULL,
  change_summary  text,

  -- Who triggered the merge
  merged_by       uuid,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draft_history_game ON draft_history(game_id, version DESC);

-- ─── 5. Game Role Volunteers ─────────────────────────────────────────────────
-- People volunteering for Game Moderator or Game Verifier during initialization.
-- Only participants (submitter or runners with published runs) can volunteer.

CREATE TABLE IF NOT EXISTS game_role_volunteers (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id       text NOT NULL,
  user_id       uuid NOT NULL,
  role          text NOT NULL CHECK (role IN ('moderator', 'verifier')),
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (game_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_role_volunteers_game ON game_role_volunteers(game_id);

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Read access is public for all these tables (forum is viewable by anyone).
-- Write access is controlled by the worker (service key), not RLS.

ALTER TABLE game_rough_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_proposal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_role_volunteers ENABLE ROW LEVEL SECURITY;

-- Public read for all
CREATE POLICY "Public read rough draft" ON game_rough_draft FOR SELECT USING (true);
CREATE POLICY "Public read proposals" ON draft_proposals FOR SELECT USING (true);
CREATE POLICY "Public read proposal votes" ON draft_proposal_votes FOR SELECT USING (true);
CREATE POLICY "Public read draft history" ON draft_history FOR SELECT USING (true);
CREATE POLICY "Public read role volunteers" ON game_role_volunteers FOR SELECT USING (true);

-- Authenticated users can insert/update their own proposals and votes
CREATE POLICY "Users manage own proposals" ON draft_proposals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own votes" ON draft_proposal_votes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own volunteer signups" ON game_role_volunteers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
