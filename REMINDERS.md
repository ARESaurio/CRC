# Reminders & Future Ideas

This document consolidates all reminders, future ideas, and planned features for CRC.
Cross-reference with `CLAUDE.md` Development Checklist for technical implementation details.

**Last updated:** 2026/03/02

---

## Revisit (Needs Polish)
### Global
- [ ] Icons for Admins, Super Admins, Verifiers — attach to profiles
- [ ] Add default profile picture and default banner
- [ ] **Favicon** — update once we have a logo (currently empty placeholder)
- [ ] **Split game editor into sub-components** (`src/routes/admin/game-editor/[game_id]/+page.svelte`) — currently ~1,620 lines. Split into GeneralTab.svelte, CategoriesTab.svelte, ChallengesTab.svelte, etc. **Revisit when:** file exceeds 2,000 lines OR a new feature requires editing 3+ tab sections simultaneously.

---

## QA Feedback (Aves — 2/27/2026)
### Still To Do — UX Polish
- [ ] **News container on homepage** — only shows News/Date/Title headers with no content visible. May need posts or a different empty state.

### Still To Do — Suggestions (Lower Priority)
- [ ] **Add "Home" button in nav** — Aves recommends alongside logo
- [ ] **Nav layout rebalance** — Aves suggests tabs on left next to logo, search on right

---

## Short-Term Priorities

### 1. Small fixes
- Games Pages:
  - Rules tab
    - Add subtle pulse around "Open" on Rule Editor when runner visits for the first time. Use Theme color.

- Runner Page:
  - Run Statistics:
    - [ ] Update how the runs are displayed when you click into a game.

- [ ] remove test account from supabase: 1130d9b9-db13-41ad-b6b0-737826590e37

### 2. Content & Polish
- [ ] Fill glossary definitions (hit, damage, death, hitless vs damageless, etc.)
- [ ] Fill support page (FAQ, staff section, privacy request form)
- [ ] Test Discord webhooks (run submission, game submission)
- [ ] Audit SCSS for dead code — known unused selectors: `.legal-page h3` (guidelines, terms), `.btn--sm` / `.mt-3` (debug), `.fh a` (profile edit), `.mt-section` (submit), `section` (rules)

### 3. Legal & Compliance
- [ ] Review Terms of Service line-by-line
- [ ] Review Privacy Policy line-by-line
- [ ] Make email accounts for privacy and legal contacts
- [ ] Test user data export feature (GDPR compliance)
- [ ] Create disaster recovery plan document
- [ ] DMCA safe harbor policy + designated agent registration ($6)
- [ ] Review https://www.gdpradvisor.co.uk/gdpr-countries

---

## Medium-Term Priorities
### 4. Spanish Language Support
**PROMISED TO COMMUNITY — HIGH PRIORITY**
- [ ] Evaluate: `paraglide-js` or `$lib/i18n` approach
- [ ] Create translation files
- [ ] Add language toggle to header
- [ ] Request community translation help early

### 5. Verifier CMS
- [ ] Inline editing on game pages with diff preview
- [ ] Require 2 verifiers to approve rule changes
- [ ] Game submission UI in admin dashboard (replace external form)

### 6. Badges & Achievements System
- [ ] Design badge types (run count, challenge completion, community milestones)
- [ ] Run count badges on game cards
- [ ] Badge display on runner profiles
- [ ] Achievement progress tracking

### 7. Leaderboards
- [ ] Per-game leaderboards
- [ ] Per-challenge leaderboards
- [ ] Sortable/filterable tables

### 8. Multi-Runner Support
Requires messaging system to be built first (runners must verify co-op participation).
- [ ] Runner search component (typeahead, searches `profiles` table)
- [ ] `co_runners` column on `pending_runs` (JSONB array of user_ids)
- [ ] Verification flow: co-runner receives a message and must confirm
- [ ] Co-runners displayed on approved run cards
- [ ] Submit form: "Add Additional Runners" section (currently stubbed as Coming Soon)

### 9. Multi-Run Support
For runs that span multiple games (e.g., marathon challenge runs).
- [ ] Scope and design TBD — related to Multi-Game Run Support in Future Features

---

## Future Features (Backlog)
### Modded Game Support
- [ ] Separate game pages for modded versions (Option A from earlier discussion)

### History Tab
- [ ] Rule changes, discussions, community milestones
- [ ] Needs Badges/Achievements system first
- [ ] News + history integration (unified timeline)

### Forum Integration
Decision needed: GitHub Discussions vs Discord vs embedded mini-forum
- [ ] `/games/[game_id]/forum` route placeholder exists
- [ ] Option C: Discord integration with widgets + channel links per game

### Multi-Game Run Support
- [ ] `is_multi_game` + `related_games` fields
- [ ] "🎮 MULTI-GAME" badge on game cards
- [ ] Treat like modded games — own game entry with linking relationship

### Community Features
- [ ] Player-made challenges via forum, connected to profiles
- [ ] RSS feed optimization
- [ ] "How to Navigate the Site" guide / FAQ
- [ ] "Fixing Mistakes" guide for admins/verifiers

### Server-Side Pagination
- [ ] Cursor-based pagination for runs queries
    - only needed once a category has hundreds+ runs

### Team Profiles (LOW PRIORITY)
- [ ] Team submission process
- [ ] Team page layout with member lists
- [ ] Team badges

---

## Technical Debt
### Supabase
- [ ] Upgrade to paid plan (first service upgrade)
  - After upgrade: enable "Prevent use of leaked passwords" in Auth → Attack Protection
- [ ] GDPR export gap: `runs` and `game_achievements` RLS filters by `status = 'approved'` — admin can't export non-approved entries (minor, since tables only contain approved rows in practice)

### Security
- [ ] **Cloudflare WAF rate limiting** — Free plan only allows 1 rate limiting rule (currently protecting `/submit` endpoints). Worker now uses KV-backed global rate limiting (upgraded from per-isolate in-memory `Map`). Upgrade to Pro ($20/mo) for full WAF with multiple rules when budget allows.
- [ ] **CSP `unsafe-inline` for scripts** — SvelteKit requires inline scripts for hydration. Cloudflare Pages (static adapter) can't generate per-request nonces. **Accepted risk** — mitigated by input sanitization, RLS, and Worker validation. Revisit if moving to SSR or if SvelteKit adds static nonce support.

---

## Accessibility

> **Build warnings:** As of Mar 2026, `svelte-check` reports ~142 a11y warnings. These are non-blocking and will be resolved when we tackle this section. See CRC-HANDOFF.md §14 for guidance.

### Color & Theming
- [ ] Light mode CSS variables — audit all `--bg`, `--fg`, `--accent`, `--surface`, `--panel`, `--border`, `--muted` for WCAG AA contrast (4.5:1 for text, 3:1 for large text/UI)
- [ ] Dark/light mode testing across all pages (check for invisible text, low-contrast borders, unreadable links)
- [ ] Colorblind mode testing — verify with Deuteranopia, Protanopia, and Tritanopia simulations (browser DevTools or tools like Stark)
- [ ] Don't rely on color alone to convey status (e.g., approved/rejected/pending should also use icons or text labels)

### Keyboard & Focus
- [ ] All interactive elements focusable and operable via keyboard (Tab, Enter, Escape)
- [ ] Visible focus indicators on buttons, links, tabs, dropdowns, and form fields
- [ ] Logical tab order across all pages (especially admin forms and multi-tab layouts)
- [ ] Skip-to-content link at the top of the page
- [ ] Modal backdrops: add `role="button" tabindex="0" onkeydown` handlers (~15 instances across admin modals — financials, games, profiles, runs)
- [ ] Replace `href="#"` on cookie/privacy settings links with `<button>` or `javascript:void(0)`

### Screen Readers & Semantics
- [ ] Semantic HTML throughout — proper heading hierarchy (h1 → h2 → h3, no skips)
- [ ] `alt` text on all images (game covers, avatars, badges)
- [ ] ARIA labels on icon-only buttons (theme toggle, search, close/dismiss)
- [ ] ARIA live regions for dynamic content (toast notifications, form validation errors)
- [ ] Form `<label>` elements linked to controls via `for`/`id` pairs (~100+ instances: game editor, admin filters, profile edit/create, theme page, rules builder, financials, runs filters, suggest page). Pattern: `<label for="field-id">` + `<input id="field-id">`

### Motion & Preferences
- [ ] Respect `prefers-reduced-motion` — disable hover zoom effects, transitions, and animations
- [ ] Respect `prefers-color-scheme` — auto-detect dark/light preference on first visit
- [ ] Respect `prefers-contrast` — consider a high-contrast mode

### Content
- [ ] Text is resizable to 200% without layout breaking
- [ ] Touch targets are at least 44×44px on mobile
- [ ] Error messages are descriptive (not just "invalid input")

---

## Notes
### Supabase Upgrade Priority
Supabase is the first service to upgrade. After upgrading:
- Enable "Prevent use of leaked passwords" in Auth → Attack Protection

### Database Schema Rule
**Never guess database schemas, API shapes, or column names.** Always ask for actual schema/data before writing queries. Guessing causes repeated broken deploys.
