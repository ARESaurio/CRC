# CLAUDE.md â€” CRC Development Guide

This file is the canonical reference for any AI assistant (Claude, Copilot, etc.) working
on the Challenge Run Community codebase. Read this FIRST before making any changes.

---

## What Is CRC?

A community platform for tracking challenge runs (deathless, no-hit, speedruns) across
multiple games. Three tiers of users: **runners** (submit runs), **verifiers/game moderators**
(review and approve), **admins** (manage the platform).

The site lives at https://www.challengerun.net.

---

## Architecture: The Most Important Rule

**Supabase is the primary database for all dynamic content. The repo holds only static content.**

### Dynamic (Supabase) â€” changes without redeployment:
- Runs (submitted, pending, approved, rejected)
- Runner profiles
- Achievements
- Teams
- Game definitions (categories, rules, challenges â€” editable by game mods)
- Pending submission queues
- Support tickets, audit logs

### Static (repo files) â€” changes require a commit:
- Global config: `src/data/config/*.yml` (platforms, genres, banned-terms, admin-config)
- Global rules and guidelines: `src/routes/rules/`, `src/routes/guidelines/`
- News posts: `src/data/posts/*.md`
- Staff guides: `src/data/staff-guides/*.md`
- Legal pages: `src/routes/legal/`
- Glossary: `src/routes/glossary/`
- SCSS styles: `src/styles/`
- All Svelte components and route files

### Why this matters:
When a runner submits a run and it gets approved, it must appear on the site immediately
(on page refresh). This is only possible if the site reads from Supabase, not from
markdown files in the repo. **Never add code that reads runs, runners, achievements,
or game definitions from markdown files.** Those paths are being migrated to Supabase.

---

## Data Flow

```
Runner submits run via /games/[game_id]/submit
    â†“
Cloudflare Worker validates + writes to Supabase `pending_runs`
    â†“
Admin/verifier approves via /admin/runs
    â†“
Worker updates status in Supabase (moves to `runs` table or updates status)
    â†“
User visits page â†’ SvelteKit +page.server.ts queries Supabase â†’ data appears
```

No GitHub files are created during this flow. No redeployment needed.

---

## Tech Stack

| Layer | Technology |
|-|-|
| Framework | SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$effect`) |
| Language | TypeScript + SCSS |
| Database | Supabase (PostgreSQL, free tier â€” 500MB is plenty for years) |
| Auth | Supabase Auth (Discord + Twitch OAuth) via httpOnly cookies |
| API | Cloudflare Worker (`worker/src/index.js`) |
| Hosting | Cloudflare Pages (`@sveltejs/adapter-cloudflare`) |
| Package manager | pnpm |

---

## Auth Architecture

Server-side cookies are the single source of truth. Never use localStorage for auth.

```
OAuth callback â†’ exchangeCodeForSession (client)
    â†“
POST /auth/callback â†’ sets httpOnly cookies (sb-access-token, sb-refresh-token)
    â†“
hooks.server.ts â†’ reads cookies â†’ creates Supabase client â†’ sets locals.session
    â†“
+layout.server.ts â†’ passes session to client
    â†“
+layout.svelte â†’ hydrateSession(data.session) into auth store
```

- `src/hooks.server.ts` â€” runs on every request, restores session from cookies
- `src/routes/auth/callback/+server.ts` â€” POST endpoint that sets cookies
- `src/routes/auth/signout/+server.ts` â€” POST endpoint that clears cookies
- `src/lib/stores/auth.ts` â€” client store; `user` is derived from `session`
- `src/lib/supabase.ts` â€” browser client with `persistSession: false`

**Guards:**
- `src/routes/admin/+layout.server.ts` â€” redirects unauthenticated users before any admin content renders
- `src/routes/profile/+layout.server.ts` â€” same for profile routes

---

## Project Structure

```
CRC-main/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ app.html                 # HTML shell (favicon, meta, RSS link)
â”‚   â”œâ”€â”€ app.d.ts                 # TypeScript declarations (App.Locals, App.Platform)
â”‚   â”œâ”€â”€ hooks.server.ts          # Auth middleware (runs every request)
â”‚   â”œâ”€â”€ data/                    # STATIC content only (see below)
â”‚   â”‚   â”œâ”€â”€ config/              # YAML config (platforms, genres, banned-terms, etc.)
â”‚   â”‚   â”œâ”€â”€ posts/               # News/blog markdown
â”‚   â”‚   â”œâ”€â”€ staff-guides/        # Internal staff documentation
â”‚   â”‚   â””â”€â”€ templates/           # Templates for game/run/runner markdown
â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”œâ”€â”€ server/data.ts       # Loads STATIC config/posts/guides from repo files
â”‚   â”‚   â”œâ”€â”€ supabase.ts          # Browser Supabase client + signOut helper
â”‚   â”‚   â”œâ”€â”€ admin.ts             # Admin role checking utilities
â”‚   â”‚   â”œâ”€â”€ components/          # Svelte components
â”‚   â”‚   â”œâ”€â”€ stores/              # Svelte stores (auth, theme, consent, scroll)
â”‚   â”‚   â”œâ”€â”€ types/index.ts       # All TypeScript interfaces
â”‚   â”‚   â””â”€â”€ utils/               # Helpers (formatDate, renderMarkdown, etc.)
â”‚   â”œâ”€â”€ routes/                  # SvelteKit file-based routing
â”‚   â””â”€â”€ styles/                  # SCSS (base, components, pages)
â”œâ”€â”€ worker/                      # Cloudflare Worker API
â”œâ”€â”€ supabase/                    # Supabase edge functions
â”œâ”€â”€ scripts/                     # CI/validation scripts (Node.js)
â”œâ”€â”€ static/                      # Static assets (images, CNAME, favicon)
â””â”€â”€ svelte.config.js             # SvelteKit config (Cloudflare adapter)
```

---

## Key Files

| File | Purpose |
|-|-|
| `src/lib/server/data.ts` | Reads STATIC content (config YAML, posts, staff guides) via `import.meta.glob`. Does NOT read dynamic content (runs, runners, games). |
| `src/lib/types/index.ts` | All TypeScript interfaces (Game, Runner, Run, Achievement, Team, Post, etc.) |
| `src/lib/utils/markdown.ts` | `renderMarkdown()` â€” uses marked + DOMPurify. All user content MUST go through this. |
| `src/lib/stores/auth.ts` | Auth store with `hydrateSession()` and `listenForAuthChanges()` |
| `src/hooks.server.ts` | Restores Supabase session from httpOnly cookies on every request |
| `worker/src/index.js` | All API endpoints (run submission, approval, game submission, export) |

---

## Coding Conventions

### Svelte 5
- Use runes: `$state`, `$derived`, `$effect`, `$props`
- Do NOT use Svelte 4 patterns (`export let`, `$:`, `on:click`)
- Reactive redirects use `$effect`, not `onMount` with store subscriptions

### UI Components (Bits UI)
Always use components from `src/lib/components/ui/` instead of native HTML elements when a matching component exists. Import with `.js` extension: `import * as Button from '$lib/components/ui/button/index.js'`.

Available components: Accordion, AlertDialog, Avatar, Button, Calendar, Checkbox, Collapsible, Combobox, Command, ContextMenu, DateField, DatePicker, Dialog, DropdownMenu, Label, LinkPreview, Menubar, Meter, NavigationMenu, Pagination, PinInput, Popover, Progress, RadioGroup, RangeCalendar, RatingGroup, ScrollArea, Select, Separator, Slider, Switch, Tabs, TimeField, Toggle, ToggleGroup, Toolbar, Tooltip.

Common mappings:
- Dropdowns/pickers → `Select` or `Combobox`
- Expandable sections → `Collapsible`
- On/off toggles → `Switch` (not Checkbox)
- Multi-select lists → `Checkbox`
- Filter pill groups → `ToggleGroup`
- Page navigation → `Pagination`
- Modals/confirms → `Dialog` or `AlertDialog`
- Buttons → `Button.Root` (not raw `<button>`, except for minimal inline toggles)

If no Bits UI component fits (e.g., text inputs, search fields), use a native element with project CSS variables.

### Server Loads
- Page data comes from `+page.server.ts` (server-side), not `+page.ts` (universal)
- Dynamic content: query Supabase in `+page.server.ts`
- Static content: use `data.ts` helpers in `+page.server.ts`
- Admin/profile routes have layout server guards â€” individual pages do additional role checks

### Security
- All markdown rendering goes through `renderMarkdown()` (DOMPurify sanitized)
- Never use `{@html}` with unsanitized content
- Never expose secrets in `PUBLIC_` env vars
- CSRF: SameSite cookies + server-side validation
- File paths: never use `node:fs` or `node:path` (won't work on Cloudflare Workers)

### Styles
- SCSS lives in `src/styles/`, imported via `main.scss` in `+layout.svelte`
- Component-scoped styles use `<style>` blocks in `.svelte` files
- Use existing CSS variables (`--accent`, `--surface`, `--border`, `--fg`, `--muted`)
- Mobile-first: all components must be responsive

---

## Supabase Tables

### Core (dynamic content):
- `games` â€” game definitions, categories, rules (editable by game mods)
- `runs` â€” approved runs
- `runners` â€” public runner profiles
- `achievements` â€” earned achievements
- `teams` â€” team profiles

### Queues:
- `pending_runs` â€” run submissions awaiting approval
- `pending_games` â€” game submissions awaiting approval
- `pending_profiles` â€” profile submissions awaiting approval

### Supporting:
- `linked_accounts` â€” OAuth provider connections
- `support_tickets` â€” user support requests
- `audit_log` â€” admin action history

### Schema flexibility:
Adding columns to Supabase tables is safe â€” existing rows get NULL. The site handles
null/undefined gracefully. Example: adding a `notes` column to `runs` works immediately;
older runs just show no notes.

---

## Environment Variables

```env
# Public (exposed to browser â€” safe, these are anon keys)
PUBLIC_SUPABASE_URL=https://...supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
PUBLIC_SITE_URL=https://www.challengerun.net
PUBLIC_WORKER_URL=https://crc-run-submissions.280sauce.workers.dev
PUBLIC_TURNSTILE_SITE_KEY=...

# Server-only (NEVER add PUBLIC_ prefix)
# SUPABASE_SERVICE_KEY=...
# TURNSTILE_SECRET_KEY=...
```

---

## What NOT to Do

1. **Don't read runs/runners/games from markdown files.** Use Supabase queries.
2. **Don't use `node:fs` or `node:path`.** The site runs on Cloudflare Workers.
3. **Don't store auth in localStorage.** Cookies are the single source of truth.
4. **Don't use `{@html}` without `renderMarkdown()`.** XSS protection is mandatory.
5. **Don't put admin content in client-side bundles.** Staff guides, admin data, etc. must load via `+page.server.ts` behind auth guards.
6. **Don't use Svelte 4 patterns.** This is a Svelte 5 project (runes).
7. **Don't add generation scripts.** SvelteKit dynamic routing eliminates the need for `generate-game-pages.js`, `generate-run-category-pages.js`, etc.
8. **Don't assume sequential IDs.** Use UUIDs or slugs for resource identification.

---

## Context Efficiency (for AI assistants)

### Subagent Discipline
- Prefer inline work for tasks under ~5 tool calls. Subagents have overhead â€” don't delegate trivially.
- When using subagents, include output rules: "Final response under 2000 characters. List outcomes, not process."
- Never call TaskOutput twice for the same subagent. If it times out, increase the timeout â€” don't re-read.

### File Reading
- Read files with purpose. Before reading a file, know what you're looking for.
- Use Grep to locate relevant sections before reading entire large files.
- Never re-read a file you've already read in this session.
- For files over 500 lines, use offset/limit to read only the relevant section.

### Responses
- Don't echo back file contents you just read â€” the user can see them.
- Don't narrate tool calls ("Let me read the file..." / "Now I'll edit..."). Just do it.
- Keep explanations proportional to complexity. Simple changes need one sentence, not three paragraphs.
- For markdown tables, use the minimum valid separator (`|-|-|` â€” one hyphen per column). Never use repeated hyphens (`|---|---|`), box-drawing characters, or padded separators. This saves tokens.

---

## Development Checklist

**Last updated:** 2026/02/18

---

### Phase 0: Deploy Blockers (DONE âœ…)
- [x] Auth cookie flow (callback sets httpOnly cookies)
- [x] Admin server-side guard (`admin/+layout.server.ts`)
- [x] Profile server-side guard (`profile/+layout.server.ts`)
- [x] Submit-game uses data layer (no `node:fs`)
- [x] Staff guides loaded server-side only
- [x] XSS protection via DOMPurify in `renderMarkdown()`
- [x] Auth store modernized (server canonical, derived user)
- [x] Sign-out flow complete (clears cookies + client session)
- [x] `news/[slug]` route with sanitized markdown
- [x] Runner per-game URL redirect (301 â†’ profile with `?game=` filter)
- [x] Post type has `excerpt` and `featured` fields
- [x] Runner type has `display_name`, `name`, `hidden` fields
- [x] Typed config loaders in `data.ts`
- [x] Production homepage (carousel, resource cards, teams, recent runs)
- [x] Leftover `.bak` files removed

---

### Phase 1: Supabase Migration â€” Create Tables + Seed

Switch from markdown-file reads to live Supabase queries. This is the critical path
to making content appear instantly when approved.

- [ ] Create `games` table in Supabase
- [ ] Create `runs` table in Supabase
- [ ] Create `runners` table in Supabase
- [ ] Create `achievements` table in Supabase
- [ ] Create `teams` table in Supabase
- [ ] Write one-time seed script: read existing `.md` files â†’ insert into Supabase
- [ ] Verify seeded data matches markdown originals

### Phase 2: Supabase Migration â€” Switch Page Loads

- [ ] Create `$lib/server/supabase.ts` with server-side query helpers
- [ ] `/games` index â†’ query Supabase `games` table
- [ ] `/games/[game_id]` overview â†’ Supabase `games`
- [ ] `/games/[game_id]/runs` â†’ Supabase `runs` (paginated)
- [ ] `/games/[game_id]/runs/[tier]/[category]` â†’ Supabase `runs` (filtered)
- [ ] `/games/[game_id]/rules` â†’ Supabase `games.rules_md`
- [ ] `/games/[game_id]/resources` â†’ Supabase `games.resources_md`
- [ ] `/games/[game_id]/history` â†’ Supabase or config YAML
- [ ] `/runners` index â†’ Supabase `runners`
- [ ] `/runners/[runner_id]` â†’ Supabase `runners` + `runs` join
- [ ] `/teams` and `/teams/[team_id]` â†’ Supabase `teams`
- [ ] `/` homepage â†’ Supabase (counts, recent runs) + data.ts (posts)
- [ ] `/search` â†’ Supabase full-text search
- [ ] Add server-side pagination for runs (cursor-based)

### Phase 3: Supabase Migration â€” Update Worker

- [ ] Run approval: remove `githubCreateFile()`, just update Supabase status
- [ ] Run approval: copy row from `pending_runs` to `runs` table
- [ ] Profile approval: update in Supabase, skip GitHub file creation
- [ ] Game approval: write to Supabase `games` table, skip GitHub
- [ ] Simplify `on-profile-update` edge function (no longer needs GitHub dispatch)

### Phase 4: Supabase Migration â€” Cleanup

- [ ] Remove `src/data/games/` markdown files (now in Supabase)
- [ ] Remove `src/data/runners/` markdown files
- [ ] Remove `src/data/runs/` markdown files
- [ ] Remove `src/data/achievements/` markdown files
- [ ] Remove `src/data/teams/` markdown files
- [ ] Remove `getGames()`, `getRunners()`, `getRuns()`, `getAchievements()`, `getTeams()` from `data.ts`
- [ ] Remove `githubCreateFile()` from Worker
- [ ] Remove `promote-runs.js` and `sync-runner-profiles.js` scripts (legacy)

---

### Infrastructure

- [ ] Add `static/_headers` file (security headers: X-Frame-Options, CSP, etc.)
- [ ] Add `static/robots.txt` (block /admin/, /profile/, /auth/)
- [ ] Add `src/routes/sitemap.xml/+server.ts`
- [ ] Create `.github/workflows/ci.yml` (pnpm build, YAML validation, schema checks)
- [ ] Create `.github/CODEOWNERS`
- [ ] Normalize image paths (remove duplicate `static/assets/img/`, keep `static/img/`)
- [ ] Fix inconsistent image ref in `profile/create/+page.svelte`

### Content & Polish

- [ ] Fill glossary definitions (hit, damage, death, hitless vs damageless, etc.)
- [ ] Fill support page (FAQ, staff section, privacy request form)
- [ ] Wire cookie consent banner (`CookieConsent.svelte` exists but needs activation)
- [ ] Test Discord webhooks (run submission, game submission)
- [ ] Test full end-to-end: submit â†’ Worker â†’ Supabase â†’ approve â†’ visible on site
- [ ] Audit SCSS for dead code (141K in components alone)
- [ ] Light mode CSS variables + colorblind mode testing
- [ ] Dark/light mode testing across all pages

### Legal & Compliance

- [ ] Review Terms of Service line-by-line
- [ ] Review Privacy Policy line-by-line
- [ ] Make email accounts for privacy and legal contacts
- [ ] Test user data export feature (GDPR compliance)
- [ ] Remove Privacy Policy 5.2: "GitHub (Microsoft)" after full Supabase migration
- [ ] Create disaster recovery plan document

---

### Future (Backlog)

- [ ] Verifier CMS: inline editing on game pages with diff preview
- [ ] Require 2 verifiers to approve rule changes
- [ ] Spanish language support (paraglide-js or `$lib/i18n`)
- [ ] Forum integration (`/games/[game_id]/forum`)
- [ ] Leaderboards (per-game, per-challenge)
- [ ] Player-made challenges via forum, connected to profiles
- [ ] Badges system + run count badges on game cards
- [ ] Multi-game run support (`is_multi_game` + `related_games`)
- [ ] Team profiles: submission process, member lists, team badges
- [ ] History tab: rule changes, discussions, community milestones
- [ ] Game submission UI in admin dashboard (replace external form)
- [ ] News + history integration (unified timeline)
- [ ] Icons for staff roles (admin, super admin, verifier) on profiles
- [ ] DMCA safe harbor policy + designated agent registration ($6)
- [ ] "How to Navigate the Site" guide / FAQ
- [ ] "Fixing Mistakes" guide for admins/verifiers
