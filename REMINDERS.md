# Reminders & Future Ideas

This document consolidates all reminders, future ideas, and planned features for CRC.
Cross-reference with `CLAUDE.md` Development Checklist for technical implementation details.

**Last updated:** 2026/02/28

---

## Fix Now (Blocking or Broken)

### Sign-Up / Profile Create — 400 Console Error
- [ ] **Root cause: no `pending_profiles` row exists when user first submits the profile create form**
  - `profile/create/+page.svelte` calls `.update()` on `pending_profiles` WHERE `user_id = $user.id`
  - But no row is ever **inserted** when a new user signs up — so the update finds 0 rows and Supabase returns a 400
  - Fix: change the `.update()` call to an `.upsert()` with `onConflict: 'user_id'`
  - Or: insert a stub row in `pending_profiles` in the auth callback (after `exchangeCodeForSession`) if one doesn't exist yet
- [ ] **Secondary: `auth/callback/+server.ts` queries `runner_profiles` table (line 80) — this table doesn't exist**
  - The correct table is `profiles` — this silent mismatch means the profile check always falls through and redirects new users to `/profile/create` even if they already have a profile
  - Fix: change `runner_profiles` → `profiles` in the callback

### Run Submission
- [ ] **Drop permissive RLS policy** — run in Supabase SQL editor:
  ```sql
  DROP POLICY "Authenticated users can submit runs" ON pending_runs;
  ```
  This policy currently lets any authenticated user write anything to `pending_runs`, bypassing the Worker's validation. The Worker's own auth + insert is the correct path.

### Claim System (Pending Runs)
- [ ] **Add columns to `pending_runs`** — UI is fully built, columns just don't exist in DB yet
  ```sql
  ALTER TABLE pending_runs
    ADD COLUMN claimed_by uuid REFERENCES auth.users(id),
    ADD COLUMN claimed_at timestamptz;
  ```
  Then add an UPDATE RLS policy so verifiers can write to those two columns:
  ```sql
  CREATE POLICY "Verifiers can claim runs"
  ON pending_runs FOR UPDATE
  USING (auth.uid() IN (SELECT user_id FROM profiles WHERE role IN ('verifier','moderator','admin')))
  WITH CHECK (true);
  ```

### Profile Approval → Runners Table Gap
- [x] ~~Worker doesn't insert into `runners` when approving a profile~~ — **Already fixed** in `worker/src/index.js` (`handleApproveProfile` upserts into both `runners` and `profiles`)
- [ ] **Friend's account**: approved but `runner_id` is null — needs a manual Supabase fix:
  ```sql
  -- Find the user, then:
  UPDATE profiles SET runner_id = '<their_runner_id>' WHERE user_id = '<their_user_id>';
  -- Also ensure a row exists in runners:
  INSERT INTO runners (runner_id, runner_name, status, ...) VALUES (...) ON CONFLICT DO NOTHING;
  ```

### Theme Page
- [x] ~~Apply pending fixes to recovered theme page~~

---

## Revisit (Needs Polish)

### Admin Panel
- [ ] Improve Submission Testers and figure out if we need it

### Global
- [ ] Icons for Admins, Super Admins, Verifiers — attach to profiles
- [ ] Add default profile picture and default banner
- [ ] Light mode CSS variables + colorblind mode testing
- [ ] Dark/light mode testing across all pages

---

## Short-Term Priorities

### 1. Supabase Migration — Tables + Seed (Phase 1-2)
- [ ] Server-side pagination for runs (cursor-based)

### 2. Content & Polish
- [ ] Fill glossary definitions (hit, damage, death, hitless vs damageless, etc.)
- [ ] Fill support page (FAQ, staff section, privacy request form)
- [ ] Test Discord webhooks (run submission, game submission)
- [ ] Audit SCSS for dead code

### 4. Legal & Compliance
- [ ] Review Terms of Service line-by-line
- [ ] Review Privacy Policy line-by-line
- [ ] Make email accounts for privacy and legal contacts
- [ ] Test user data export feature (GDPR compliance)
- [ ] Create disaster recovery plan document
- [ ] DMCA safe harbor policy + designated agent registration ($6)

---

## Medium-Term Priorities

### 5. Spanish Language Support
**PROMISED TO COMMUNITY — HIGH PRIORITY**
- [ ] Evaluate: `paraglide-js` or `$lib/i18n` approach
- [ ] Create translation files
- [ ] Add language toggle to header
- [ ] Request community translation help early

### 6. Verifier CMS
- [ ] Inline editing on game pages with diff preview
- [ ] Require 2 verifiers to approve rule changes
- [ ] Game submission UI in admin dashboard (replace external form)

### 7. Badges & Achievements System
- [ ] Design badge types (run count, challenge completion, community milestones)
- [ ] Run count badges on game cards
- [ ] Badge display on runner profiles
- [ ] Achievement progress tracking

### 8. Leaderboards
- [ ] Per-game leaderboards
- [ ] Per-challenge leaderboards
- [ ] Sortable/filterable tables

---

## Future Features (Backlog)

### Modded Game Support
- [ ] Separate game pages for modded versions (Option A from earlier discussion)

### Multi-Game Run Support
- [ ] `is_multi_game` + `related_games` fields
- [ ] "🎮 MULTI-GAME" badge on game cards
- [ ] Treat like modded games — own game entry with linking relationship

### Team Profiles (LOW PRIORITY)
- [ ] Team submission process
- [ ] Team page layout with member lists
- [ ] Team badges

### Forum Integration
Decision needed: GitHub Discussions vs Discord vs embedded mini-forum
- [ ] `/games/[game_id]/forum` route placeholder exists
- [ ] Option C: Discord integration with widgets + channel links per game

### History Tab
- [ ] Rule changes, discussions, community milestones
- [ ] Needs Badges/Achievements system first
- [ ] News + history integration (unified timeline)

### Community Features
- [ ] Player-made challenges via forum, connected to profiles
- [ ] RSS feed optimization
- [ ] "How to Navigate the Site" guide / FAQ
- [ ] "Fixing Mistakes" guide for admins/verifiers

---

## 🛠️ Technical Debt

### Supabase
- [ ] Upgrade to paid plan (first service upgrade)
  - After upgrade: enable "Prevent use of leaked passwords" in Auth → Attack Protection
- [ ] GDPR export gap: `runs` and `game_achievements` RLS filters by `status = 'approved'` — admin can't export non-approved entries (minor, since tables only contain approved rows in practice)

### Code Cleanup (After Supabase Migration)
- [ ] Remove `src/data/games/`, `src/data/runners/`, `src/data/runs/` markdown files

### Game Editor — Fixed Loadout (Site-Wide Feature)
- [ ] Add `fixed_loadout` support to game categories (game editor + submit runs)
  - When a challenge/mini-challenge has `fixed_loadout: true`, certain fields become locked for runners
  - The editor should let staff define which fields are fixed: Character, Challenge, Restriction
  - Example: "Trial of Moon" requires "Moonstone Axe — Charon Aspect", so character field is pre-filled and locked
  - Needs changes in: game editor categories tab, submit run form, run display page
  - Schema: add `fixed_loadout` object to category items (e.g. `{ enabled: bool, character?: string, challenge?: string, restriction?: string }`)
  - Submit form should read these values and disable the corresponding dropdowns when a fixed-loadout category is selected

---

## 📝 Notes

### Supabase Upgrade Priority
Supabase is the first service to upgrade. After upgrading:
- Enable "Prevent use of leaked passwords" in Auth → Attack Protection

### Database Schema Rule
**Never guess database schemas, API shapes, or column names.** Always ask for actual schema/data before writing queries. Guessing causes repeated broken deploys.


---

## Revisit (Needs Polish)

### Admin Panel
- [ ] Improve Submission Testers and figure out if we need it

### Global
- [ ] Icons for Admins, Super Admins, Verifiers — attach to profiles
- [ ] Add default profile picture and default banner
- [ ] Light mode CSS variables + colorblind mode testing
- [ ] Dark/light mode testing across all pages

---

## Short-Term Priorities

### 1. Supabase Migration — Tables + Seed (Phase 1-2)
- [ ] Server-side pagination for runs (cursor-based)

### 2. Content & Polish
- [ ] Fill glossary definitions (hit, damage, death, hitless vs damageless, etc.)
- [ ] Fill support page (FAQ, staff section, privacy request form)
- [ ] Test Discord webhooks (run submission, game submission)
- [ ] Audit SCSS for dead code

### 4. Legal & Compliance
- [ ] Review Terms of Service line-by-line
- [ ] Review Privacy Policy line-by-line
- [ ] Make email accounts for privacy and legal contacts
- [ ] Test user data export feature (GDPR compliance)
- [ ] Create disaster recovery plan document
- [ ] DMCA safe harbor policy + designated agent registration ($6)

---

## Medium-Term Priorities

### 5. Spanish Language Support
**PROMISED TO COMMUNITY — HIGH PRIORITY**
- [ ] Evaluate: `paraglide-js` or `$lib/i18n` approach
- [ ] Create translation files
- [ ] Add language toggle to header
- [ ] Request community translation help early

### 6. Verifier CMS
- [ ] Inline editing on game pages with diff preview
- [ ] Require 2 verifiers to approve rule changes
- [ ] Game submission UI in admin dashboard (replace external form)

### 7. Badges & Achievements System
- [ ] Design badge types (run count, challenge completion, community milestones)
- [ ] Run count badges on game cards
- [ ] Badge display on runner profiles
- [ ] Achievement progress tracking

### 8. Leaderboards
- [ ] Per-game leaderboards
- [ ] Per-challenge leaderboards
- [ ] Sortable/filterable tables

---

## Future Features (Backlog)

### Modded Game Support
- [ ] Separate game pages for modded versions (Option A from earlier discussion)

### Multi-Game Run Support
- [ ] `is_multi_game` + `related_games` fields
- [ ] "🎮 MULTI-GAME" badge on game cards
- [ ] Treat like modded games — own game entry with linking relationship

### Team Profiles (LOW PRIORITY)
- [ ] Team submission process
- [ ] Team page layout with member lists
- [ ] Team badges

### Forum Integration
Decision needed: GitHub Discussions vs Discord vs embedded mini-forum
- [ ] `/games/[game_id]/forum` route placeholder exists
- [ ] Option C: Discord integration with widgets + channel links per game

### History Tab
- [ ] Rule changes, discussions, community milestones
- [ ] Needs Badges/Achievements system first
- [ ] News + history integration (unified timeline)

### Community Features
- [ ] Player-made challenges via forum, connected to profiles
- [ ] RSS feed optimization
- [ ] "How to Navigate the Site" guide / FAQ
- [ ] "Fixing Mistakes" guide for admins/verifiers

---

## 🛠️ Technical Debt

### Supabase
- [ ] Upgrade to paid plan (first service upgrade)
  - After upgrade: enable "Prevent use of leaked passwords" in Auth → Attack Protection
- [ ] GDPR export gap: `runs` and `game_achievements` RLS filters by `status = 'approved'` — admin can't export non-approved entries (minor, since tables only contain approved rows in practice)

### Code Cleanup (After Supabase Migration)
- [ ] Remove `src/data/games/`, `src/data/runners/`, `src/data/runs/` markdown files

### Game Editor — Fixed Loadout (Site-Wide Feature)
- [ ] Add `fixed_loadout` support to game categories (game editor + submit runs)
  - When a challenge/mini-challenge has `fixed_loadout: true`, certain fields become locked for runners
  - The editor should let staff define which fields are fixed: Character, Challenge, Restriction
  - Example: "Trial of Moon" requires "Moonstone Axe — Charon Aspect", so character field is pre-filled and locked
  - Needs changes in: game editor categories tab, submit run form, run display page
  - Schema: add `fixed_loadout` object to category items (e.g. `{ enabled: bool, character?: string, challenge?: string, restriction?: string }`)
  - Submit form should read these values and disable the corresponding dropdowns when a fixed-loadout category is selected

---

## 📝 Notes

### Supabase Upgrade Priority
Supabase is the first service to upgrade. After upgrading:
- Enable "Prevent use of leaked passwords" in Auth → Attack Protection

### Database Schema Rule
**Never guess database schemas, API shapes, or column names.** Always ask for actual schema/data before writing queries. Guessing causes repeated broken deploys.
