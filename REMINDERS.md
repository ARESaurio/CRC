# Reminders & Future Ideas

This document consolidates all reminders, future ideas, and planned features for CRC.
Cross-reference with `CLAUDE.md` Development Checklist for technical implementation details.

**Last updated:** 2026/02/26

---

## Fix Now (Blocking or Broken)

### Run Submission
- [ ] **Drop permissive policy** — run: `DROP POLICY "Authenticated users can submit runs" ON pending_runs;`

### Claim System (Pending Runs)
- [ ] **Add columns to `pending_runs`**: `claimed_by` (uuid), `claimed_at` (timestamptz)
  - UI is built but columns must exist for claims to work
  - SQL: `ALTER TABLE pending_runs ADD COLUMN claimed_by uuid REFERENCES auth.users(id), ADD COLUMN claimed_at timestamptz;`
  - Add UPDATE RLS policy for verifiers to claim runs

### Profile Approval → Runners Table Gap
- [ ] When a profile is approved, a row must also be created in `runners` table
  - Currently: approval updates `profiles.status` but doesn't insert into `runners`
  - Effect: approved profiles don't appear on `/runners` page
  - Fix: update Worker approval endpoint to also insert into `runners`
- [ ] Friend signed up, profile approved, but has no `runner_id` — needs manual fix or re-approval

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

---

## 📝 Notes

### Supabase Upgrade Priority
Supabase is the first service to upgrade. After upgrading:
- Enable "Prevent use of leaked passwords" in Auth → Attack Protection

### Database Schema Rule
**Never guess database schemas, API shapes, or column names.** Always ask for actual schema/data before writing queries. Guessing causes repeated broken deploys.
