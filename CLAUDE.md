# CLAUDE.md — CRC Development Guide

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

### Dynamic (Supabase) — changes without redeployment:
- Runs (submitted, pending, approved, rejected)
- Runner profiles
- Achievements
- Teams
- Game definitions (categories, rules, challenges — editable by game mods)
- Pending submission queues
- Support tickets, audit logs

### Static (repo files) — changes require a commit:
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
    ↓
Cloudflare Worker validates + writes to Supabase `pending_runs`
    ↓
Admin/verifier approves via /admin/runs
    ↓
Worker updates status in Supabase (moves to `runs` table or updates status)
    ↓
User visits page → SvelteKit +page.server.ts queries Supabase → data appears
```

No GitHub files are created during this flow. No redeployment needed.

---

## Tech Stack

| Layer | Technology |
|-|-|
| Framework | SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$effect`) |
| Language | TypeScript + SCSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Discord + Twitch OAuth) via httpOnly cookies |
| API | Cloudflare Worker (`worker/src/index.js`) |
| Hosting | Cloudflare Pages (`@sveltejs/adapter-cloudflare`) |
| Package manager | pnpm |

---

## Auth Architecture

Server-side cookies are the single source of truth. Never use localStorage for auth.

```
OAuth callback → exchangeCodeForSession (client)
    ↓
POST /auth/callback → sets httpOnly cookies (sb-access-token, sb-refresh-token)
    ↓
hooks.server.ts → reads cookies → creates Supabase client → sets locals.session
    ↓
+layout.server.ts → passes session to client
    ↓
+layout.svelte → hydrateSession(data.session) into auth store
```

- `src/hooks.server.ts` — runs on every request, restores session from cookies
- `src/routes/auth/callback/+server.ts` — POST endpoint that sets cookies
- `src/routes/auth/signout/+server.ts` — POST endpoint that clears cookies
- `src/lib/stores/auth.ts` — client store; `user` is derived from `session`
- `src/lib/supabase.ts` — browser client with `persistSession: false`

**Guards:**
- `src/routes/admin/+layout.server.ts` — redirects unauthenticated users before any admin content renders
- `src/routes/profile/+layout.server.ts` — same for profile routes

---

## Project Structure

```
CRC-main/
├── src/
│   ├── app.html                 # HTML shell (favicon, meta, RSS link)
│   ├── app.d.ts                 # TypeScript declarations (App.Locals, App.Platform)
│   ├── hooks.server.ts          # Auth middleware (runs every request)
│   ├── data/                    # STATIC content only (see below)
│   │   ├── config/              # YAML config (platforms, genres, banned-terms, etc.)
│   │   ├── posts/               # News/blog markdown
│   │   ├── staff-guides/        # Internal staff documentation
│   │   └── templates/           # Templates for game/run/runner markdown
│   ├── lib/
│   │   ├── server/data.ts       # Loads STATIC config/posts/guides from repo files
│   │   ├── supabase.ts          # Browser Supabase client + signOut helper
│   │   ├── admin.ts             # Admin role checking utilities
│   │   ├── components/          # Svelte components
│   │   ├── stores/              # Svelte stores (auth, theme, consent, scroll)
│   │   ├── types/index.ts       # All TypeScript interfaces
│   │   └── utils/               # Helpers (formatDate, renderMarkdown, etc.)
│   ├── routes/                  # SvelteKit file-based routing
│   └── styles/                  # SCSS (base, components, pages)
├── worker/                      # Cloudflare Worker API
├── supabase/                    # Supabase edge functions
├── scripts/                     # CI/validation scripts (Node.js)
├── static/                      # Static assets (images, CNAME, favicon)
└── svelte.config.js             # SvelteKit config (Cloudflare adapter)
```

---

## Key Files

| File | Purpose |
|-|-|
| `src/lib/server/data.ts` | Reads STATIC content (config YAML, posts, staff guides) via `import.meta.glob`. Does NOT read dynamic content (runs, runners, games). |
| `src/lib/types/index.ts` | All TypeScript interfaces (Game, Runner, Run, Achievement, Team, Post, etc.) |
| `src/lib/utils/markdown.ts` | `renderMarkdown()` — uses marked + DOMPurify. All user content MUST go through this. |
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
- Admin/profile routes have layout server guards — individual pages do additional role checks

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
- `games` — game definitions, categories, rules (editable by game mods)
- `runs` — approved runs
- `runners` — public runner profiles
- `achievements` — earned achievements
- `teams` — team profiles

### Queues:
- `pending_runs` — run submissions awaiting approval
- `pending_games` — game submissions awaiting approval
- `pending_profiles` — profile submissions awaiting approval

### Supporting:
- `linked_accounts` — OAuth provider connections
- `support_tickets` — user support requests
- `audit_log` — admin action history

### Schema flexibility:
Adding columns to Supabase tables is safe — existing rows get NULL. The site handles
null/undefined gracefully. Example: adding a `notes` column to `runs` works immediately;
older runs just show no notes.

---

## Environment Variables

```env
# Public (exposed to browser — safe, these are anon keys)
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

- Read files with purpose. Grep to locate relevant sections before reading large files.
- Don't echo back file contents you just read.
- Don't narrate tool calls ("Let me read the file..."). Just do it.
- Keep explanations proportional to complexity.
- Prefer inline work for tasks under ~5 tool calls.

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

- For markdown tables, use the minimum valid separator (`|-|-|` â€” one hyphen per column). Never use repeated hyphens (`|---|---|`), box-drawing characters (`â”€`), or padded separators. This saves tokens.
