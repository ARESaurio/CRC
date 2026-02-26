# Reminders & Future Ideas

This document consolidates all reminders, future ideas, and planned features for CRC.
Cross-reference with `CLAUDE.md` Development Checklist for technical implementation details.

**Last updated:** 2026/02/26

---

## 🔥 Fix Now (Blocking or Broken)

### Run Submission Bugs
- [ ] Remove `kind` column from submit payload — column doesn't exist in `pending_runs`
- [ ] Verify all payload columns exist: run `SELECT column_name FROM information_schema.columns WHERE table_name = 'pending_runs'`
- [ ] Add `https://noembed.com` to CSP `connect-src` (video preview blocked by Content Security Policy)
  - CSP is NOT in the codebase — check Cloudflare dashboard (Response Headers or Page Rules)
  - Also add `https://flagcdn.com` if not already there (flag images in profiles)

### Profile Approval → Runners Table Gap
- [ ] When a profile is approved, a row must also be created in `runners` table
  - Currently: approval updates `profiles.status` but doesn't insert into `runners`
  - Effect: approved profiles don't appear on `/runners` page
  - Fix: update Worker approval endpoint to also insert into `runners`
- [ ] Friend signed up, profile approved, but has no `runner_id` — needs manual fix or re-approval

---

## 🔧 Revisit (Needs Polish)

### Global
- [ ] Icons for Admins, Super Admins, Verifiers — attach to profiles
- [ ] Add default profile picture and default banner
- [ ] Light mode CSS variables + colorblind mode testing
- [ ] Dark/light mode testing across all pages

---

## 📋 Short-Term Priorities

### 1. Supabase Migration — Tables + Seed (Phase 1-2)
Switch page loads from markdown to live Supabase queries.
See `CLAUDE.md` Phase 1-4 for full checklist.
- [ ] Create tables: `games`, `runs`, `runners`, `achievements`, `teams`
- [ ] Seed script: read existing `.md` files → insert into Supabase
- [ ] Switch page loads (`/games`, `/runners`, `/teams`, homepage)
- [ ] Server-side pagination for runs (cursor-based)

### 2. Content & Polish
- [ ] Fill glossary definitions (hit, damage, death, hitless vs damageless, etc.)
- [ ] Fill support page (FAQ, staff section, privacy request form)
- [ ] Wire cookie consent banner (`CookieConsent.svelte` exists but needs activation)
- [ ] Test Discord webhooks (run submission, game submission)
- [ ] Test full end-to-end: submit → Worker → Supabase → approve → visible on site
- [ ] Audit SCSS for dead code

### 3. Infrastructure
- [ ] Add `static/_headers` file (security headers: X-Frame-Options, CSP, etc.)
  - Move CSP from Cloudflare dashboard into `_headers` for version control
- [ ] Add `src/routes/sitemap.xml/+server.ts`
- [ ] Create `.github/workflows/ci.yml` (pnpm build, YAML validation)
- [ ] Create `.github/CODEOWNERS`
- [ ] Normalize image paths (remove duplicate `static/assets/img/`, keep `static/img/`)

### 4. Legal & Compliance
- [ ] Create disaster recovery plan document
- [ ] DMCA safe harbor policy + designated agent registration ($6)

---

## 🗓️ Medium-Term Priorities

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

## 🚀 Future Features (Backlog)

### Modded Game Support
- [ ] Separate game pages for modded versions (Option A from earlier discussion)
- [ ] `is_modded` + `base_game` fields linking modded ↔ vanilla
- [ ] "🔧 MODDED" badge on game cards and hero images
- [ ] Cross-linking: base game shows "Modded versions available", modded shows "Looking for vanilla?"

### Multi-Game Run Support
- [ ] `is_multi_game` + `related_games` fields
- [ ] "🎮 MULTI-GAME" badge on game cards
- [ ] Treat like modded games — own game entry with linking relationship

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

### Team Profiles (LOW PRIORITY)
- [ ] Team submission process
- [ ] Team page layout with member lists
- [ ] Team badges

---

## 🛠️ Technical Debt

### Supabase
- [ ] Upgrade to paid plan (first service upgrade)
  - After upgrade: enable "Prevent use of leaked passwords" in Auth → Attack Protection
- [ ] GDPR export gap: `runs` and `game_achievements` RLS filters by `status = 'approved'` — admin can't export non-approved entries (minor, since tables only contain approved rows in practice)

### Code Cleanup (After Supabase Migration)
- [ ] Remove `src/data/games/`, `src/data/runners/`, `src/data/runs/` markdown files
- [ ] Remove `getGames()`, `getRunners()`, `getRuns()` etc. from `data.ts`
- [ ] Remove `githubCreateFile()` from Worker
- [ ] Remove legacy scripts (`promote-runs.js`, `sync-runner-profiles.js`)

---

## 📝 Notes

### Supabase Upgrade Priority
Supabase is the first service to upgrade. After upgrading:
- Enable "Prevent use of leaked passwords" in Auth → Attack Protection

### Database Schema Rule
**Never guess database schemas, API shapes, or column names.** Always ask for actual schema/data before writing queries. Guessing causes repeated broken deploys.
