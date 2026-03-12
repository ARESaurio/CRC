# CRC Development Handoff — Context for New AI Assistants

**Last updated:** 2026-03-12
**Purpose:** This document supplements `CLAUDE.md` (in the repo root) with lessons learned from active development sessions. Read `CLAUDE.md` first, then this document.

> **Note on the `runners` table:** The `runners` table was dropped from Supabase in Mar 2026. All runner data comes from `profiles`. The TypeScript `Runner` interface and function names like `getRunners()` are kept as domain-level abstractions — they describe what the data represents (a runner), not which table it lives in.

---

## 1. Critical Rule: Never Guess Schemas

The single most important lesson from development so far:

> **Never assume database column names, table structures, or API shapes. Always ask the user for the actual schema before writing queries.**

Guessing has caused multiple failed deploys. The user will happily run a SQL query and share the results. It takes 30 seconds and prevents hours of debugging.

To get a table's columns:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'your_table_name'
ORDER BY ordinal_position;
```

To get RLS policies:
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'your_table_name';
```

---

## 2. Database Schema (Current — Mar 2026)

### Recent Migration (Feb 24, 2026)
Tables were renamed and consolidated:
- `runner_profiles` → **`profiles`** (the canonical user data table)
- `achievements` → **`game_achievements`**
- `ticket_messages` → **`support_messages`**
- `profile_audit_log` → **`audit_profile_log`**
- **`moderators`** → DROPPED (replaced by role tables + `profiles.is_admin`)
- New: **`role_game_moderators`**, **`role_game_verifiers`** (role assignment tables)

### `profiles` (approved profiles — single source of truth)
| Column | Type | Notes |
|-|-|-|
| id | uuid | PK |
| user_id | uuid | FK to auth.users |
| runner_id | text | Unique slug, e.g. "gary-asher" |
| display_name | text | |
| pronouns | text | |
| location | text | |
| bio | text | |
| avatar_url | text | |
| socials | jsonb | `{ twitch, youtube, twitter, bluesky, instagram, other[] }` |
| games | ARRAY | |
| featured_runs | jsonb | |
| badges | jsonb | |
| is_public | boolean | |
| is_admin | boolean | **Admin flag** |
| is_super_admin | boolean | **Super admin flag** |
| role | text | |
| verified_games | ARRAY | |
| theme_settings | jsonb | Custom theme data |
| contributions | jsonb | |
| personal_goals | jsonb | |
| banner_url | text | |
| status | text | 'approved', 'pending', etc. |
| created_at / updated_at / approved_at | timestamptz | |

**Key insight:** `profiles` now has a `status` column. Row with `status = 'approved'` means the profile is live.

### `pending_profiles` (awaiting approval)
| Column | Type |
|-|-|
| id | uuid |
| user_id | uuid |
| requested_runner_id | text |
| display_name | text |
| has_profile | boolean |
| status | enum (pending/approved/rejected) |
| submitted_at / reviewed_at | timestamptz |

**Note:** `user_id` has a UNIQUE constraint (`pending_profiles_user_id_key`). This is required for the `.upsert({ onConflict: 'user_id' })` pattern used in profile/create and profile/setup.

### `pending_runs` (submitted runs awaiting review)
Notable columns added Feb 28, 2026:
- `claimed_by` (uuid, FK to auth.users) — which verifier claimed the run
- `claimed_at` (timestamptz) — when they claimed it

The permissive INSERT policy (`pending_runs_insert`) was **dropped** Feb 28 — all run submissions now go through the Worker, which validates and inserts via service key.

### `runners` — DROPPED (Mar 2026)
The legacy `runners` table has been dropped from Supabase. All runner data now comes from the `profiles` table. The server-side function `getRunners()` (in `src/lib/server/supabase.ts`) queries `profiles` where `status = 'approved'` and maps rows to the `Runner` TypeScript interface via `profileToRunner()`. The `Runner` type is kept as a domain-level interface — it represents a runner in the UI, not a database table.

### `role_game_verifiers` / `role_game_moderators`
Per-game role assignments. Each row grants a user a role for a specific game.
| Column | Type |
|-|-|
| id | uuid |
| user_id | uuid |
| game_id | text |
| assigned_by | uuid |
| assigned_at | timestamptz |

### Admin/Verifier Detection Pattern
```typescript
// Check profiles for admin
const { data: profile } = await supabase
  .from('profiles')
  .select('is_admin, is_super_admin')
  .eq('user_id', userId)
  .maybeSingle();

// Check role_game_verifiers for verifier
const { data: verifier } = await supabase
  .from('role_game_verifiers')
  .select('id')
  .eq('user_id', userId)
  .limit(1)
  .maybeSingle();
```

---

## 3. Auth Architecture — What Actually Works

### Server Side (reliable)
- `hooks.server.ts` reads httpOnly cookies → creates Supabase server client → sets `locals.session`
- `+layout.server.ts` passes session to client
- Server-side queries via `locals.supabase` always have auth

### Client Side (nuances)
- `src/lib/supabase.ts` creates a `createBrowserClient`
- The `$user` store (from `$stores/auth`) is hydrated from server session data
- **Working pattern for writes:** `admin.ts` uses `supabase.auth.getSession()` to get the access token, then raw `fetch()` with explicit `Authorization: Bearer ${token}` header

### Auth Callback (`auth/callback/+server.ts`)
After exchanging the OAuth code for a session, the callback checks if the user has a profile:
1. Queries **`profiles`** (not `runner_profiles` — that was a bug fixed Feb 28)
2. If no profile, checks `pending_profiles` for `has_profile`
3. If neither exists → redirects to `/profile/create`

### Profile State Logic (Header.svelte)
1. Query `profiles` for `runner_id, is_admin, is_super_admin, status` where `user_id = current user`
2. If row with `runner_id` + `status = 'approved'` → **active**
3. If row with `runner_id` but not approved → **pending**
4. If no row → query `pending_profiles` for `has_profile`
5. If `has_profile = true` → **pending**. Otherwise → **none** (needs setup)

### New User Flow
1. User signs in via OAuth (Discord/Twitch)
2. Auth callback checks for existing profile
3. If none → redirects to `/profile/create`
4. Profile create uses `.upsert({ onConflict: 'user_id' })` on `pending_profiles` (not `.update()`)
5. If pre-approved: profile row created immediately
6. If not: waits for admin approval
7. User can skip setup and explore, but can't submit runs without a runner_id

---

## 4. Svelte 5 Conventions

The project uses Svelte 5 runes. Common mistakes to avoid:

| Wrong (Svelte 4) | Right (Svelte 5) |
|-|-|
| `export let prop` | `let { prop } = $props()` |
| `$: derived = x + y` | `let derived = $derived(x + y)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `on:click={handler}` | `onclick={handler}` |
| `on:click\|preventDefault` | `onclick={(e) => { e.preventDefault(); handler() }}` |
| `<slot />` | `{@render children()}` with `let { children } = $props()` |

**Event modifier syntax doesn't exist in Svelte 5.**

**Variable ordering matters for `svelte-check`:** If a `$derived` references a `$state` variable, the `$state` must be declared first in the file. Even though `$derived` is lazy at runtime, the static analyzer flags it as "used before declaration."

---

## 5. Styling System

### Global SCSS (`src/styles/`)
- CSS custom properties: `--accent`, `--bg`, `--fg`, `--border`, `--panel`, `--surface`, `--muted`
- Radius tokens: `--radius-sm`, `--radius-md`, `--radius-lg`
- Tab styles in `_tabs.scss` are global and apply to `.runner-tabs .tab`, `.game-tabs .game-tab`, and `.edit-tabs .edit-tab` — all use a pill/rounded-rect appearance with surface background, border, and rounded top corners. Active tab blends into content below with `border-bottom-color: var(--bg)`.
- Footer grid in `_footer.scss` uses 4-column layout (brand + Explore + Resources + Legal)

### Import Path Aliases
- `$lib` → `src/lib`
- `$stores` → `src/lib/stores`
- `$components` → `src/lib/components`
- `$types` → `src/lib/types`
- `$data` → `src/data`

---

## 6. i18n / Internationalization

The site supports English and Spanish via Paraglide JS v2. Full details in `REMINDERS-i18n.md`.

### Key Facts
- **1,810 translation keys** across 81 component files
- English at `/`, Spanish at `/es/` prefix
- All UI chrome is translated; user-generated content (game names, bios, run notes) stays in original language
- URL slugs are NOT translated (`/es/games/dark-souls`, not `/es/juegos/dark-souls`)

### For New Code
Every new component needs two imports and keys in both JSON files:
```svelte
<script>
  import { localizeHref } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';
</script>
<a href={localizeHref('/games')}>{m.nav_games()}</a>
```

### Common i18n Gotchas
- Don't use `{m.key()}` inside a ternary that's already in `{}` — use `m.key()` without inner braces
- `src/hooks.js` (not `.ts`) must exist with a `reroute` function or `/es/` routes 404
- After adding keys, if you get "X is not a function": `rm -rf src/lib/paraglide && pnpm dev`
- The Paraglide Vite plugin must be listed **before** `sveltekit()` in `vite.config.ts`

---

## 7. File Locations

| What | Where |
|-|-|
| Auth store | `src/lib/stores/auth.ts` — exports `session`, `user`, `isLoading` |
| Admin utilities | `src/lib/admin.ts` — `checkAdminRole()`, `fetchPending()`, `adminAction()` |
| Browser Supabase | `src/lib/supabase.ts` |
| Server Supabase | `src/lib/server/supabase.ts` — query helpers |
| TypeScript types | `src/lib/types/index.ts` — all interfaces |
| Utility functions | `src/lib/utils/index.ts` — `isValidVideoUrl()`, `formatDate()`, etc. |
| Header | `src/lib/components/layout/Header.svelte` |
| Footer | `src/lib/components/layout/Footer.svelte` |
| A-Z nav | `src/lib/components/AzNav.svelte` |
| Profile setup | `src/routes/profile/setup/+page.svelte` (lightweight onboarding) |
| Profile create | `src/routes/profile/create/+page.svelte` (full form) |
| Game editor | `src/routes/admin/game-editor/[game_id]/+page.svelte` |
| Run submit | `src/routes/games/[game_id]/submit/+page.svelte` |
| Suggest update | `src/routes/games/[game_id]/suggest/+page.svelte` |
| Game editor list | `src/routes/admin/game-editor/+page.svelte` (freeze-all, AzNav, show limit) |
| CSP headers | `_headers` (Cloudflare Pages custom headers) |
| Worker | `worker/src/index.js` (Cloudflare Worker for admin actions) |
| i18n messages | `messages/en.json`, `messages/es.json` |
| i18n runtime | `src/lib/paraglide/` (generated — don't edit) |
| i18n docs | `REMINDERS-i18n.md` |

---

## 8. Content Security Policy

CSP is defined in `_headers` at the repo root. Key `connect-src` entries:
- `'self'` — same origin
- `https://*.supabase.co` — Supabase API
- `https://crc-run-submissions.280sauce.workers.dev` — Worker
- `https://challenges.cloudflare.com` — Turnstile
- `https://noembed.com` — Video URL metadata lookup

If a new external API is added, its domain must be added to `connect-src` or client-side fetches will be blocked.

---

## 9. Allowed Video URLs

Defined in `src/lib/utils/index.ts` → `isValidVideoUrl()`:
- YouTube (youtube.com, m.youtube.com, youtu.be)
- Twitch (twitch.tv, m.twitch.tv, player.twitch.tv)
- Bilibili (bilibili.com)

**Nicovideo was removed** per user request. HTTPS only.

---

## 10. Runner Profile Page Structure

The runner profile at `/runners/[runner_id]` has 4 tabs:
- **Overview** (default): About/bio, Highlights, Contributions, Game Credits, In-Progress Goals
- **Run Statistics**: Stats cards, fun stats, game grid with detail drill-down
- **Achievements**: Community achievements, Completed personal goals
- **Activity**: Timeline of recent runs and achievements

Game cards throughout the profile use a zoom-in hover effect on background images.

---

## 11. Fixed Loadout System (Added Feb 28, 2026)

Game categories can define a `fixed_loadout` object that locks certain fields when a runner selects that category on the submit form.

### Schema (stored in game JSONB columns — `full_runs`, `mini_challenges`, `player_made`):
```json
{
  "slug": "trial-of-moon",
  "label": "Trial of Moon",
  "fixed_loadout": {
    "enabled": true,
    "character": "moonstone-axe-charon",
    "challenge": "hitless",
    "restriction": null
  }
}
```

### How it works:
- **Game editor:** Each category item (full runs, mini-challenge children, player-made) has a "Fixed Loadout" toggle. When enabled, dropdowns appear for Character, Challenge, and Restriction — populated from the game's data.
- **Submit form:** When a runner selects a fixed-loadout category, locked fields auto-fill and become disabled with 🔒 indicators.
- **No DB migration needed** — uses existing JSONB columns.
- **TypeScript:** `FixedLoadout` interface in `src/lib/types/index.ts`, added to `FullRunCategory`, `MiniChallengeChild`, `MiniChallengeGroup`, and `PlayerMadeChallenge`.

---

## 12. Current State & Recent Work

### Completed March 12, 2026 — i18n + Security
- [x] **Full i18n implementation:** 1,810 translation keys, 81 components, 17 batches — every page and component translated for Spanish
- [x] **Security audit fixes:** `hooks.server.ts` hardened with `getUser()` for protected routes, messages layout auth guard added, Worker wildcard escaping + token fix, Supabase query limits, CSP nonces in `svelte.config.js`
- [x] **Auth popup system:** `AuthPopup.svelte` component, `set-redirect` server endpoint, Header integration
- [x] **Supabase RLS fixes:** Self-join bugs in messages policies, `(select auth.uid())` optimization, fixed `is_admin()` / `is_moderator()` / `is_super_admin()` functions, tightened role scopes
- [x] **TypeScript fixes:** Added `InboxThread`, `MessageWithSender`, `ThreadParticipant` types, fixed implicit `any` and `string | undefined` errors in messages pages
- [x] **Pending Postgres RPC:** `get_run_counts_by_runner()` function (SQL provided, needs to be created in Supabase dashboard)

### Completed March 2, 2026
- [x] Build fix: added `description?: string` to `MiniChallengeChild` type
- [x] Rules tab: blockquote/exception callout styling
- [x] Header: moderator detection queries `role_game_moderators` table
- [x] Game editor: `canEditMeta` restricts name/status to admins
- [x] Game editor: 3-second save rate limiting + admin-only field stripping
- [x] Profiles RLS: hardened UPDATE policy to block admin flag changes
- [x] `admin.ts`: refactored from raw fetch to Supabase client
- [x] Worker: `additional_runners` sanitized, duplicate `profiles` query removed, KV-backed rate limiting

### Known Pending Tasks
All pending tasks are tracked in `REMINDERS.md`. Do not duplicate them here.

---

## 13. Working With the User — Methodology & Communication

### How to Approach Tasks

**1. Read before you write.** Before editing any file, read the actual current content. Don't assume you know what's there from a previous session.

**2. Read all relevant files upfront.** When a task touches multiple files, read them all at the start — don't interleave reading and editing.

**3. Understand the blast radius.** Before making a change, trace where the affected code is used. Grep first, then plan.

**4. Make targeted surgical edits.** The user prefers small, precise changes over sweeping refactors.

**5. Verify after editing.** After making string replacements, read back the edited area to confirm correctness.

### How to Deliver Files

**Always mirror the repo structure.** Output files at their exact repo paths. The user drags files directly into the repo.

**Provide complete files, not patches.** The user replaces entire files.

**NEW files need explicit callouts.** Make it clear when a file is new and needs a new directory.

### Communication Style

**Be direct.** Don't narrate thought process. Just do the work and present results.

**Be concise.** Scale explanation to complexity.

**Ask before guessing.** Database schemas, column names, API shapes — always ask.

**Own mistakes.** Say what went wrong, why, and how to fix it.

### Common Gotchas

1. **Svelte template nesting:** Every `{#if}` needs `{/if}`, every `<div>` needs `</div>`. Count opening and closing tags when removing sections.

2. **Scoped vs global styles:** When switching from local classes to global classes, remove conflicting local styles.

3. **String replacement precision:** `str_replace` requires exact matches including whitespace. Use `cat -A` to check tabs vs spaces.

4. **Cloudflare adapter:** No `node:fs` or `node:path`. No `process.env` (use `$env/static/public` or `$env/static/private`).

5. **i18n ternaries:** `{condition ? m.key() : 'fallback'}` — NOT `{condition ? {m.key()} : 'fallback'}`. Double braces cause parse errors.

6. **The `game_name_aliases` field:** Game search should check aliases too. It's an array on the `games` table.

---

## 14. Architecture Decisions Log

| Decision | Why | Date |
|-|-|-|
| Cookies over localStorage for auth | Cloudflare Workers can't access localStorage; httpOnly cookies work server-side | Feb 2026 |
| JSONB for socials/theme/loadout | Flexible schema, no migrations needed for adding fields | Feb 2026 |
| Suggest Update as separate tab route | Keeps overview page focused; form logic is complex enough to warrant isolation | Mar 2026 |
| Pill-style tabs over underline tabs | User wanted "distinguishable distance between tabs" — pill shape provides visual separation | Mar 2026 |
| `$derived` over `$effect` for data | Derived values are declarative and don't cause extra re-renders | Feb 2026 |
| Moderator access to game editor | Per-game moderators can edit content but not meta (name, status). RLS policy gates writes. | Mar 2026 |
| Profiles RLS column restriction | Admin flags (`is_admin`, `is_super_admin`, `role`, `status`) blocked at database level. | Mar 2026 |
| KV-backed rate limiting | In-memory `Map` was per-isolate. Moved to Cloudflare KV for global persistence. | Mar 2026 |
| Paraglide JS for i18n | URL-based locale strategy (`/es/` prefix), SSR-compatible, generates type-safe message functions, works on Cloudflare Pages | Mar 2026 |
| Legal prose not translated | Legal text requires professional translation for accuracy; structural chrome (headings/TOC) translated, body prose deferred | Mar 2026 |

---

## 15. Accessibility (a11y) Build Warnings

`svelte-check` reports ~241 a11y warnings. **These are non-blocking and should be ignored during development.** They will be addressed in a dedicated accessibility pass tracked in `REMINDERS.md`.

The three warning categories:
- **`a11y_label_has_associated_control`** (~150+): Form `<label>` elements not linked to inputs via `for`/`id`. Affects screen readers only.
- **`a11y_click_events_have_key_events`** (~30): Modal backdrop `<div onclick>` without keyboard equivalents. Affects keyboard-only users.
- **`css_unused_selector`** (~15): Dead CSS from i18n string replacements that changed element structures. Can be cleaned up.
