**Last updated:** 2026/03/05

---

## Waiting / Revisit
### Global
- [ ] Icons for Verifiers, Moderators, Admins, and Super Admins — attach to profiles
- [ ] Add default profile picture and default banner
- [ ] **Favicon** — update once we have a logo (currently empty placeholder)

### Visual Reworks:
- Runner Page:
  - Run Statistics:
    - [ ] Update how the runs are displayed when you click into a game.

### Bits UI Components:
- ui-select-item stays open after making selection. It needs to close after something is picked.

---

## Immediate Priorities
### 1. Bug Fixes
- [ ] Discord webhooks for profile waiting approval = not working
- [ ] Discord webhooks for game submission = not working
- Games Page:
  - Advanced Filters:
    - [ ] Single-Select Drop-Down needs to show options when initially clicked.
  - Forum
    - [ ] Add Commitee for people to join and make suggestions for rule updates. Make requirement to join at least 1 published game of the commitee they are trying to join.

- Admin Pages:

  - Game Editor:
    - General:
      - Status:
        - [ ] Change order to: Inactive -> Community Review -> Active

  - Games:
    - [ ] Change tab order to Pending -> Published -> Needs Change -> Active -> Rejected -> All
      - Active Games are ONLY games that are listed as Active on the site. This means they have a Moderator and Verifier.
      - Published Games are games that are in Community Review.
    - [ ] Add select-select drop-down typeahead for sorting by games
    - [ ] Add number of items next to tabs, like what the Runs page has.

  - Runs:
    - [ ] Change tab order to Pending -> Published -> Needs Change -> Active -> Rejected -> All
      - Active Runs are ONLY runs that are listed as Verified on the site. This means they have a Moderator and Verifier.
    - [ ] Remove Pending Runs from Published.
      - Pending means it has not been touched in any way
        - Runs can be Published, Verified, or Rejected

  - Contributions:
    - [ ] Why is it not showing contributions?

- Admin Panel:
  - [ ] Add Contributions and Glossary Tooltips

### 2. User Report & Request Systems
- [ ] **Report buttons** — "Report" button on runner profiles, game pages, runs (table exists, needs frontend buttons)
   - Remove from Support Page and add Report 
- [ ] **User requests** — feature requests, game suggestions, corrections. Could reuse `support_tickets` or a new `user_requests` table.
- [ ] **Content moderation queue** — flag uploaded avatars/banners for review (graphic/sexual content). Consider automated image moderation (Cloudflare Images or similar) when budget allows.

### 2.5 Cleanup
- Do we need these files?
  - [ ] .docs/MIGRATION.md
  - [ ] REMINDERS-i18n.md
  - [ ] CRC-CHANGES-2026-03-20.md
  - [ ] supabase/README.md

---

## Medium-Term Priorities
### 3. Verifier CMS
- [ ] Inline editing on game pages with diff preview
- [ ] Require 2 verifiers to approve rule changes

### 4. History Tab
- [ ] **UI is built, needs backend wiring** — icons/labels defined for `run_approved`, `rule_updated`, `gm_added`, etc. Server returns empty array. Blocked on: `game_history` table + audit event writes in Worker approval/edit handlers.
- [ ] Rule changes, discussions, community milestones
- [ ] News + history integration (unified timeline)

### 5. Forum Integration
Decision needed: GitHub Discussions vs Discord vs embedded mini-forum
- [ ] `/games/[game_id]/forum` route placeholder exists
- [ ] Option C: Discord integration with widgets + channel links per game

### 6. Multi-Runner Support
Requires messaging system to be built first (runners must verify co-op participation).
- [ ] Runner search component (typeahead, searches `profiles` table)
- [ ] `co_runners` column on `pending_runs` (JSONB array of user_ids)
- [ ] Verification flow: co-runner receives a message and must confirm
- [ ] Co-runners displayed on approved run cards
- [ ] Submit form: "Add Additional Runners" section (currently stubbed as Coming Soon)

### 7. Modded Game Support
- [ ] Separate game pages for modded versions (Option A from earlier discussion)

### 8. Leaderboards
- [ ] Per-game leaderboards
- [ ] Per-challenge leaderboards
- [ ] Sortable/filterable tables

### 9. Multi-Run Support
For runs that span multiple games (e.g., marathon challenge runs).
- [ ] Scope and design TBD — related to Multi-Game Run Support in Future Features

### 10. Badges & Achievements System
- [ ] Design badge types (run count, challenge completion, community milestones)
- [ ] Run count badges on game cards
- [ ] Badge display on runner profiles
- [ ] Achievement progress tracking

---

## Future Features (Backlog)
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
- [ ] Real-time updates via Supabase Realtime (optional, nice-to-have)
- [ ] GDPR export gap: `runs` and `game_achievements` RLS filters by `status = 'approved'` — admin can't export non-approved entries (minor, since tables only contain approved rows in practice)
- [ ]  Supabase DPA — Open a support ticket or email support@supabase.io saying something like: "Hi, I'd like to execute the Data Processing Addendum for my Supabase project. My organization is Challenge Run Community (challengerun.net). Please send me the PandaDoc to sign." Then sign it when they send it.


### Security
- [ ] **Cloudflare WAF rate limiting** — Free plan only allows 1 rate limiting rule (currently protecting `/submit` endpoints). Worker now uses KV-backed global rate limiting (upgraded from per-isolate in-memory `Map`). Upgrade to Pro ($20/mo) for full WAF with multiple rules when budget allows.

### Legal
- EU representative
  - optional, low priority
- [ ] DMCA safe harbor policy + designated agent registration ($6)

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
