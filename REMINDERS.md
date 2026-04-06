**Last updated:** 2026/03/29

---

## Waiting / Revisit
### Global
- [ ] Icons for Verifiers, Moderators, Admins, and Super Admins — attach to profiles
- [ ] Add default profile picture and default banner
- [ ] **Favicon** — update once we have a logo (currently empty placeholder)
- [ ] Fix Discord webhooks work: Games, Runs, Submissions

### Reworks:
- Runner Profile:
  - Overview Tab:
    - [ ] For games shown: "runners choice, if they don't chose anything then games with more runs of the runners"
  - Runs tab:
    - [ ] Update how the runs are displayed when you click into a game.
- Admin Panel:
  - Contributions:
    - [ ] Needs an entire rework.
  - Debug:
    - [ ] Revisit and make sure it works properly.

---

## Immediate Priorities
### 1. Bug Fixes
- [ ] Ask Spanish community about the use of "runners" and make a poll to see if it should use feminine or masculine form. Right now, it is common to see feminine form.
- Character not changing in the review preview.
- QoL:
  - [ ] Remove the Source Identifier from videos
  - [ ] games_categories and games_runs paraglide messages don't handle singular ('1 categories' instead of '1 category')

### 2. History Tab
- [ ] Community milestones as timeline events (define event types + write triggers)
- [ ] News + history integration (unified timeline pulling from posts + game_history)

---

## Medium-Term Priorities
### 3. Multi-Runner Support
Messaging system is now built (`/messages` routes + `messages/create-thread` Worker handler). Co-runner verification flow can use it.
- [ ] Runner search component (typeahead, searches `profiles` table)
- [ ] `co_runners` column on `pending_runs` (JSONB array of user_ids)
- [ ] Verification flow: co-runner receives a message and must confirm
- [ ] Co-runners displayed on approved run cards
- [ ] Submit form: "Add Additional Runners" section (currently stubbed as Coming Soon)

### 4. Leaderboards
- [ ] Per-game leaderboards
- [ ] Per-challenge leaderboards
- [ ] Sortable/filterable tables

### 5. Multi-Run Support
For runs that span multiple games (e.g., marathon challenge runs).
- [ ] Scope and design TBD — related to Multi-Game Run Support in Future Features

### 6. Badges & Achievements System
- [ ] Design badge types (run count, challenge completion, community milestones)
- [ ] Run count badges on game cards
- [ ] Badge display on runner profiles
- [ ] Achievement progress tracking

---

## Future Features (Backlog)
### 7. Multi-Game Run Support
- [ ] `is_multi_game` + `related_games` fields
- [ ] "🎮 MULTI-GAME" badge on game cards
- [ ] Treat like modded games — own game entry with linking relationship

### 8. Community Features
- [ ] Player-made challenges via forum, connected to profiles
- [ ] RSS feed optimization
- [ ] "How to Navigate the Site" guide / FAQ
- [ ] "Fixing Mistakes" guide for admins/verifiers

### Content Moderation
- [ ] **Avatar/banner moderation queue** — custom uploads go live immediately via Supabase Storage with no review step. Low risk since only approved profiles can upload. Add a review queue when traffic grows or budget allows automated image moderation (Cloudflare Images or similar).

### Server-Side Pagination
- [ ] Cursor-based pagination for runs queries
    - only needed once a category has hundreds+ runs

### Team Profiles (LOW PRIORITY)
- [ ] Team submission process
- [ ] Team page layout with member lists
- [ ] Team badges

---

### UI Wrapper Component Audit
**Status:** Pending
**Priority:** Low
**Context:** bits-ui migration created 42 wrapper component directories in `src/lib/components/ui/`. 22 are actively imported across the codebase. 20 are unused and could be deleted to reduce clutter, but some may be needed for planned features.

**Actively used (22):** accordion, alert-dialog, button, checkbox, collapsible, combobox, dialog, dropdown-menu, meter, pagination, popover, radio-group, scroll-area, select, separator, sheet, slider, switch, tabs, toggle, toggle-group, tooltip

**Unused (20):** aspect-ratio, avatar, calendar, command, context-menu, date-field, date-picker, date-range-field, date-range-picker, label, link-preview, menubar, navigation-menu, pin-input, progress, range-calendar, rating-group, time-field, time-range-field, toolbar

**Keep reserved:**
- `command` — reserved for ⌘K search palette (tracked in UX Enhancements backlog)

**Decision needed:** Review unused list and decide which to keep for planned features vs. delete. Deleting is safe — they can be regenerated from bits-ui CLI if needed later.

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