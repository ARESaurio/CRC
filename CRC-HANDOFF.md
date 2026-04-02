# CRC Development Handoff — Context for AI Assistants

**Last updated:** 2026-03-25
**Purpose:** This document supplements `CLAUDE.md` (in the repo root) with lessons learned from active development. Read `CLAUDE.md` first for architecture and conventions, then this document for current project state and patterns.

---

## 1. Critical Rule: Never Guess Schemas

The single most important lesson from development:

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

### Table Renames (Feb 24, 2026)
- `runner_profiles` → **`profiles`** (canonical user data table)
- `achievements` → **`game_achievements`**
- `ticket_messages` → **`support_messages`**
- `profile_audit_log` → **`audit_profile_log`**
- **`moderators`** → DROPPED (replaced by role tables + `profiles.is_admin`)
- New: **`role_game_moderators`**, **`role_game_verifiers`**

### `profiles` (single source of truth for user data)
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
| is_admin | boolean | Admin flag |
| is_super_admin | boolean | Super admin flag |
| role | text | |
| verified_games | ARRAY | |
| theme_settings | jsonb | Custom theme data |
| contributions | jsonb | |
| personal_goals | jsonb | |
| banner_url | text | |
| status | text | 'approved', 'pending', etc. |
| created_at / updated_at / approved_at | timestamptz | |

**Key insight:** `profiles` has a `status` column. `status = 'approved'` means the profile is live.

### `pending_profiles` (awaiting approval)
| Column | Type |
|-|-|
| id | uuid |
| user_id | uuid (UNIQUE constraint) |
| requested_runner_id | text |
| display_name | text |
| has_profile | boolean |
| status | enum (pending/approved/rejected) |
| submitted_at / reviewed_at | timestamptz |

The UNIQUE constraint on `user_id` is required for the `.upsert({ onConflict: 'user_id' })` pattern used in profile/create and profile/setup.

### `pending_runs` (submitted runs awaiting review)
Notable columns added Feb 28, 2026:
- `claimed_by` (uuid, FK to auth.users) — which verifier claimed the run
- `claimed_at` (timestamptz) — when they claimed it
- `submitter_notes` (text) — also used for write-in metadata (see Section 12)

The permissive INSERT policy was dropped Feb 28 — all run submissions go through the Worker.

### `pending_games` (game submissions awaiting approval)
Contains `game_data` JSONB column with all structured submission data (categories, challenges, characters, difficulties, etc.). The approval handler reads this JSONB to build the live `games` row.

### `runners` (legacy — still used by /runners page)
This table still exists and powers `getRunners()` in `src/lib/server/supabase.ts`. It will eventually be replaced by `profiles`, but that migration hasn't happened yet. Do NOT drop it.

### `role_game_verifiers` / `role_game_moderators`
Per-game role assignments.
| Column | Type |
|-|-|
| id | uuid |
| user_id | uuid |
| game_id | text |
| assigned_by | uuid |
| assigned_at | timestamptz |

### Admin/Verifier Detection Pattern
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('is_admin, is_super_admin')
  .eq('user_id', userId)
  .maybeSingle();

const { data: verifier } = await supabase
  .from('role_game_verifiers')
  .select('id')
  .eq('user_id', userId)
  .limit(1)
  .maybeSingle();
```

---

## 3. Auth Architecture

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
1. Queries **`profiles`** (not `runner_profiles`)
2. If no profile, checks `pending_profiles` for `has_profile`
3. If neither exists → redirects to `/profile/create`

### New User Flow
1. User signs in via OAuth (Discord/Twitch)
2. Auth callback checks for existing profile
3. If none → redirects to `/profile/create`
4. Profile create uses `.upsert({ onConflict: 'user_id' })` on `pending_profiles`
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

**Variable ordering matters for `svelte-check`:** If a `$derived` references a `$state` variable, the `$state` must be declared first in the file.

---

## 5. Styling System

### Global SCSS (`src/styles/`)
- CSS custom properties: `--accent`, `--bg`, `--fg`, `--border`, `--panel`, `--surface`, `--muted`
- Radius tokens: `--radius-sm`, `--radius-md`, `--radius-lg`
- Tab styles in `_tabs.scss` — pill/rounded-rect appearance with `data-state="active"` for active styling
- Footer grid in `_footer.scss` uses 4-column layout (brand + Explore + Resources + Legal)
- Unified button system in `_buttons.scss`

### Import Path Aliases
- `$lib` → `src/lib`
- `$stores` → `src/lib/stores`
- `$components` → `src/lib/components`
- `$types` → `src/lib/types`
- `$data` → `src/data`

---

## 6. File Locations

| What | Where |
|-|-|
| Auth store | `src/lib/stores/auth.ts` — exports `session`, `user`, `isLoading` |
| Admin utilities | `src/lib/admin.ts` — `checkAdminRole()`, `fetchPending()`, `adminAction()` |
| Browser Supabase | `src/lib/supabase.ts` |
| Server Supabase | `src/lib/server/supabase.ts` — query helpers |
| TypeScript types | `src/lib/types/index.ts` — all interfaces |
| Utility functions | `src/lib/utils/index.ts` — `isValidVideoUrl()`, `formatDate()`, etc. |
| Banned terms | `src/lib/utils/banned-terms.ts` — `checkBannedTerms()`, `MALICIOUS_TERMS` |
| Markdown renderer | `src/lib/utils/markdown.ts` — `renderMarkdown()`, `setGlossaryTerms()` |
| Header | `src/lib/components/layout/Header.svelte` |
| Footer | `src/lib/components/layout/Footer.svelte` |
| A-Z nav | `src/lib/components/AzNav.svelte` |
| Profile setup | `src/routes/profile/setup/+page.svelte` (lightweight onboarding) |
| Profile create | `src/routes/profile/create/+page.svelte` (full form) |
| Profile edit | `src/routes/profile/edit/+page.svelte` (tabbed editor with Tabs.Root) |
| Game editor | `src/routes/admin/game-editor/[game_id]/+page.svelte` |
| Run submit | `src/routes/games/[game_id]/submit/+page.svelte` |
| Suggest update | `src/routes/games/[game_id]/suggest/+page.svelte` |
| Game editor list | `src/routes/admin/game-editor/+page.svelte` (freeze-all, AzNav, show limit) |
| Forum | `src/routes/games/[game_id]/forum/+page.svelte` (Community Review) |
| Proposal editor | `src/routes/games/[game_id]/forum/ProposalEditor.svelte` |
| CSP headers | `svelte.config.js` (nonce-based CSP via SvelteKit, NOT `_headers`) |
| Security headers | `_headers` (HSTS, X-Frame-Options, X-Content-Type-Options, etc.) |
| Worker entry | `worker/src/index.ts` (Cloudflare Worker — TypeScript) |
| Worker handlers | `worker/src/handlers/*.ts` (10 handler files) |
| Worker lib | `worker/src/lib/*.ts` (8 utility modules) |
| Worker types | `worker/src/types/index.ts` (shared type definitions) |
| i18n messages | `messages/en.json`, `messages/es.json` (~1900 keys each) |
| i18n config | `project.inlang/settings.json` |
| UI components | `src/lib/components/ui/` (bits-ui wrappers — see Section 10) |

### Stores (`src/lib/stores/`)
| Store | Purpose |
|-|-|
| `auth.ts` | Session, user, isLoading — hydrated from server |
| `theme.ts` | Dark/light theme |
| `consent.ts` | Cookie consent state |
| `toast.ts` | Toast notifications (`showToast()`) |
| `notifications.ts` | In-app notification bell |
| `messages.ts` | Messaging/thread state |
| `scroll.ts` | Scroll position tracking |
| `debug.ts` | Debug/role simulation state |

---

## 7. Worker API (TypeScript)

The Worker was converted from JavaScript to TypeScript in March 2026. All files are `.ts`. It deploys separately via `wrangler deploy` — not through GitHub Actions CI.

### Structure
```
worker/
  src/
    index.ts              — route matching + dispatch
    handlers/             — 10 handler files
      runs.ts             — /submit, /approve-run, /reject-run, /verify-run, etc.
      games.ts            — /submit-game, /approve-game, /reject-game, etc.
      game-editor.ts      — /game-editor/save, /freeze, /delete, /rollback, /reimport
      game-init.ts        — /game-init/propose, /vote, /finalize, etc.
      profiles.ts         — /approve-profile, /reject-profile, etc.
      notifications.ts    — /notify, /notify-profile-submitted
      messages.ts         — /messages/create-thread
      reports.ts          — /report
      users.ts            — /export-data, /delete-account
      export.ts           — dead code (duplicate of handleDataExport in users.ts)
    lib/
      auth.ts             — JWT verification, authenticateAdmin, authenticateUser
      cors.ts             — CORS headers, jsonResponse helper
      supabase.ts         — supabaseQuery helper, insertNotification
      discord.ts          — webhook helpers, SITE_URL
      turnstile.ts        — captcha verification
      game-helpers.ts     — shared game editor utilities, GAME_ALLOWED_FIELDS
      rate-limit.ts       — rate limiting
      utils.ts            — sanitizeInput, sanitizeArray, isValidId, slugify
    types/
      index.ts            — Env, RoleInfo, and other shared types
  wrangler.toml           — main = "src/index.ts"
  tsconfig.json
  package.json
```

### All Routes (43 endpoints)
| Route | Handler | Purpose |
|-|-|-|
| `/` | index.ts | Health check |
| `/submit` | runs.ts | Run submission |
| `/approve` | runs.ts | Legacy approve alias |
| `/approve-run` | runs.ts | Approve pending run |
| `/reject-run` | runs.ts | Reject pending run |
| `/request-changes` | runs.ts | Request changes on run |
| `/edit-approved-run` | runs.ts | Edit an approved run |
| `/staff-edit-pending-run` | runs.ts | Staff edit pending run |
| `/verify-run` | runs.ts | Verify approved run |
| `/unverify-run` | runs.ts | Unverify a run |
| `/edit-pending-run` | runs.ts | Runner edits own pending run |
| `/withdraw-pending-run` | runs.ts | Runner withdraws submission |
| `/submit-game` | games.ts | Game submission |
| `/check-game-exists` | games.ts | Duplicate game check |
| `/support-game` | games.ts | Upvote pending game |
| `/approve-game` | games.ts | Approve game → creates `games` row |
| `/reject-game` | games.ts | Reject game submission |
| `/request-game-changes` | games.ts | Request changes on game |
| `/edit-pending-game` | games.ts | Edit pending game |
| `/withdraw-pending-game` | games.ts | Withdraw game submission |
| `/game-editor/save` | game-editor.ts | Save game editor changes |
| `/game-editor/freeze` | game-editor.ts | Freeze/unfreeze game |
| `/game-editor/delete` | game-editor.ts | Delete game |
| `/game-editor/rollback` | game-editor.ts | Rollback to snapshot |
| `/game-editor/reimport` | game-editor.ts | Re-import from pending submission |
| `/game-init/propose` | game-init.ts | Propose rule change (forum) |
| `/game-init/vote` | game-init.ts | Vote on proposal |
| `/game-init/withdraw-proposal` | game-init.ts | Withdraw proposal |
| `/game-init/volunteer` | game-init.ts | Volunteer as game mod |
| `/game-init/unvolunteer` | game-init.ts | Remove volunteer |
| `/game-init/request-approval` | game-init.ts | Request approval for finalization |
| `/game-init/finalize` | game-init.ts | Finalize forum section |
| `/game-init/check-eligibility` | game-init.ts | Check eligibility |
| `/approve-profile` | profiles.ts | Approve pending profile |
| `/reject-profile` | profiles.ts | Reject pending profile |
| `/request-profile-changes` | profiles.ts | Request profile changes |
| `/update-contributions` | profiles.ts | Update runner contributions |
| `/notify` | notifications.ts | Send notification |
| `/notify-profile-submitted` | notifications.ts | Notify admins of new profile |
| `/review-rule-suggestion` | notifications.ts | Review rule suggestion |
| `/assign-role` | users.ts | Assign verifier/moderator role |
| `/export-data` | users.ts | Export user data (GDPR) |
| `/delete-account` | users.ts | Delete user account |
| `/messages/create-thread` | messages.ts | Create message thread |
| `/report` | reports.ts | Submit report |

---

## 8. Game Statuses & Community Review

Games have four statuses: `'Active'`, `'Inactive'`, `'Coming Soon'`, `'Community Review'`.

### Community Review Flow
When a game is approved as "Community Review" (rather than "Active"), it gets a forum where the community builds out its rules, categories, and data collaboratively.

Key files:
- `src/routes/games/[game_id]/forum/` — forum pages
- `src/routes/games/[game_id]/forum/ProposalEditor.svelte` — propose changes to game sections
- `src/routes/games/[game_id]/forum/CommunityReview.svelte` — review status display
- `src/routes/games/[game_id]/forum/consensus.ts` — section definitions (SECTIONS constant)
- `src/routes/games/[game_id]/forum/init/[section]/` — section initialization
- `worker/src/handlers/game-init.ts` — all forum/proposal Worker endpoints

### Re-import from Submission
The game editor has a "Re-import" button (admin-only) that re-reads the original `pending_games` submission and re-applies the approval merge logic. This is useful when a game was approved before code changes were in place, or when the submission was edited post-approval. Creates a backup snapshot first. Endpoint: `POST /game-editor/reimport`.

---

## 9. i18n (Internationalization)

The project uses **Paraglide** (from Inlang) for internationalization.

- **Config:** `project.inlang/settings.json` — source language `en`, target `es`
- **Message files:** `messages/en.json`, `messages/es.json` (~1900 keys each)
- **Vite plugin:** `@inlang/paraglide-js` in `vite.config.ts`, outputs to `src/lib/paraglide/` (gitignored, generated at build)
- **Usage in components:** `import * as m from '$lib/paraglide/messages'` then `{m.some_key()}`
- **Localized hrefs:** `import { localizeHref } from '$lib/paraglide/runtime'` then `href={localizeHref('/path')}`
- **~47 route files** currently import from paraglide

When adding new user-facing strings, add the key to both `messages/en.json` and `messages/es.json`.

---

## 10. bits-UI Component Library

The project wraps [bits-ui](https://bits-ui.com) primitives in `src/lib/components/ui/`. Migration progress is tracked in `REMINDERS-bits-UI.md` at the repo root — **always read that file before doing UI component work.**

### Available Components (in use)
| Component | Import | Replaces |
|-|-|-|
| Button | `* as Button from 'ui/button'` | `<button class="btn btn--accent">` |
| Dialog | `* as Dialog from 'ui/dialog'` | Hand-rolled modals |
| AlertDialog | `* as AlertDialog from 'ui/alert-dialog'` | Native `confirm()` |
| Tabs | `* as Tabs from 'ui/tabs'` | `.game-tab` / `.tab-btn` patterns |
| Select | `* as Select from 'ui/select'` | Native `<select>` |
| Checkbox | `* as Checkbox from 'ui/checkbox'` | `<input type="checkbox">` |
| Switch | `* as Switch from 'ui/switch'` | Boolean toggle checkboxes |
| RadioGroup | `* as RadioGroup from 'ui/radio-group'` | Visible radio buttons |
| ToggleGroup | `* as ToggleGroup from 'ui/toggle-group'` | Hidden-radio + styled-button patterns |
| Combobox | `* as Combobox from 'ui/combobox'` | Typeahead/autocomplete |
| Popover | `* as Popover from 'ui/popover'` | Dropdown menus |
| DropdownMenu | `* as DropdownMenu from 'ui/dropdown-menu'` | Language switcher |
| Accordion | `* as Accordion from 'ui/accordion'` | Collapsible sections |
| Collapsible | `* as Collapsible from 'ui/collapsible'` | Expandable cards |
| Separator | `* as Separator from 'ui/separator'` | `<hr>` dividers |
| Progress | `* as Progress from 'ui/progress'` | Progress bars |
| Pagination | `* as Pagination from 'ui/pagination'` | Prev/next buttons |
| Slider | `* as Slider from 'ui/slider'` | `<input type="range">` |
| Meter | `* as Meter from 'ui/meter'` | Progress bar fills |

### Key Rules
1. **Import path:** Always `'$lib/components/ui/{component}/index.js'` (with `.js`)
2. **Type callbacks:** `onValueChange={(v: string) => {}}`, `onOpenChange={(o: boolean) => {}}`
3. **Select.Trigger doesn't auto-display the selected label** — render it yourself
4. **Slider uses `number[]`** — single values need `value={[val]}` and `onValueChange={(v: number[]) => { val = v[0]; }}`
5. **Scoped CSS doesn't reach child components** — use `:global()` for Separator, RadioGroup, ToggleGroup, etc.
6. **bits-ui handles outside-click** — do NOT add `<svelte:window onclick>` handlers
7. **Don't convert navigation tabs** — route-based `<a href>` tabs stay as-is
8. **Don't convert special-purpose button classes** — `btn--save`, `btn--reset`, `btn--add`, `btn--approve`, `btn--reject`, `btn--claim`, `btn--delete`, `btn--verify`, `btn--freeze`, `btn--draft`, etc. See full list in `REMINDERS-bits-UI.md` Rule 6.

### Migration Status
All major batches are complete. The only open item is **Batch 23** — 5 complex typeahead files awaiting Combobox conversion (submit form, rules page, category page, admin runs, run edit). See `REMINDERS-bits-UI.md` for exact file list and patterns.

---

## 11. Glossary Tooltip System

Auto-matching tooltips are wired into all `renderMarkdown()` output.

- **DB table:** `glossary_terms` (admin CRUD at `/admin/tooltips`)
- **Hydration:** `+layout.server.ts` loads all terms → `+layout.svelte` calls `setGlossaryTerms()`
- **Pipeline:** manual `{{tooltip:slug}}` → marked → sanitize → auto-match
- **Auto-match rules:** whole-word, case-insensitive, longest-match-first, first occurrence per term, skips code/links/existing tooltips
- **Security:** `{{tooltip:` is blocked by `checkBannedTerms()` (7 files) and stripped by `stripTooltipSyntax()` (7 additional files). Only admins can create terms.

---

## 12. Write-in System (Community Review Games)

When a game is in `'Community Review'` status, the run submit form shows write-in fields for data that doesn't exist yet.

### How it works per field:
| Field | Max | Behavior |
|-|-|-|
| Category | 10 (via "Other" tier) | Text input replaces tier/category dropdowns |
| Character | 10 | Plain text input (no data) or typeahead with write-in fallback on blur |
| Difficulty | 5 | Same pattern as character |
| Glitch Category | 5 | Same pattern as character |
| Challenges | 5 | Existing chips + tag input for custom entries |
| Restrictions | 10 | Same tag input pattern as challenges |

### Storage
No DB migration needed. All write-in metadata is prepended to `submitter_notes` as `[Write-ins: Category: X | Challenges: Y, Z | ...]`. The admin runs page shows an amber "Write-in" badge on runs with `category === 'other'`.

### Active games
Write-in fields are **only visible** when `game.status === 'Community Review'`. Active games use the standard form.

---

## 13. Content Security Policy

**CSP is handled by SvelteKit** in `svelte.config.js` with per-request nonces for inline scripts. The `_headers` file at repo root explicitly says NOT to set CSP there.

The `_headers` file handles non-CSP security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

Key `connect-src` entries (in svelte.config.js):
- `'self'` — same origin
- `https://*.supabase.co` — Supabase API
- `https://crc-run-submissions.280sauce.workers.dev` — Worker
- `https://challenges.cloudflare.com` — Turnstile
- `https://noembed.com` — Video URL metadata lookup

If a new external API is added, its domain must be added to `connect-src` in `svelte.config.js`.

---

## 14. Fixed Loadout System

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

When a runner selects a fixed-loadout category, locked fields auto-fill and become disabled with 🔒 indicators. No DB migration needed — uses existing JSONB columns.

---

## 15. Current State & Known Issues

### Pending Tasks
All pending tasks are tracked in `REMINDERS.md`. Key items:
- Runners table migration (partially complete — `profiles` is primary, `runners` is fallback)
- Global search (searches games + runners, not yet runs/teams)
- Discord webhooks (profile approval + game submission — not working)
- Combobox migration for 5 complex typeahead files (Batch 23)
- Report buttons on runner profiles, game pages, runs
- Content moderation queue for uploaded avatars/banners

### Files that may be deletable
Per `REMINDERS.md`, these are flagged for review:
- `.docs/MIGRATION.md`
- `REMINDERS-i18n.md`
- `CRC-CHANGES-2026-03-20.md`
- `supabase/README.md`
- `worker/src/handlers/export.ts` (dead code — duplicate of `handleDataExport` in `users.ts`)

---

## 16. Working With the User — Methodology

### How to Approach Tasks

**1. Read before you write.** Before editing any file, read the actual current content. Files change between sessions.

**2. Read all relevant files upfront.** When a task touches multiple files, read them all at the start. For a typical multi-file task, expect to read 5-10 files before writing anything.

**3. Understand the blast radius.** Before making a change, trace where the affected code is used. Grep first, then plan.

**4. Make targeted surgical edits.** The user prefers small, precise changes over sweeping refactors. If the task is "change X to Y," change exactly that in the 2-3 files where it appears.

**5. Verify after editing.** After making string replacements, read back the edited area to confirm correctness. The Cloudflare build rejects malformed Svelte templates.

### How to Deliver Files

**Always mirror the repo structure.** Output files at their exact repo paths. The user drags files directly into the repo.

**Always include a destination table.** Every response that delivers files must end with:

| Output file | Repo destination |
|-|-|
| `src/routes/+layout.svelte` | `src/routes/+layout.svelte` |

**Provide complete files, not patches.** The user replaces entire files.

**NEW files need explicit callouts.** If creating a brand-new route, make it clear.

### Communication Style

**Be direct.** Don't narrate thought process. Do the work and present results.

**Be concise.** Scale explanation to complexity.

**Ask before guessing.** Database schemas, column names, API shapes — always ask.

**Own mistakes.** Say what went wrong, why, and how to fix it.

**Changelog-style summaries** when presenting results:
> **Tab redesign** — `_tabs.scss`: Tabs now use rounded-rect style. Active tab blends into content below.
>
> **Runner page** — `[runner_id]/+page.svelte`: "Representing" → "Ally of"

**Don't echo file contents.** The user can see the files.

### Common Gotchas

1. **Svelte template nesting:** Every `{#if}` needs `{/if}`, every `<div>` needs `</div>`. Count opening and closing tags when removing sections.

2. **Scoped vs global styles:** Styles in `<style>` blocks are scoped. If switching to global classes from `_tabs.scss`, remove conflicting local styles.

3. **String replacement precision:** `str_replace` requires exact matches including whitespace. Use `cat -A` to check tabs vs spaces.

4. **Cloudflare adapter:** No `node:fs` or `node:path`. No `process.env` (use `$env/static/public` or `$env/static/private`).

5. **The `game_name_aliases` field:** Game search should check aliases too. It's an array on the `games` table.

6. **Worker deploys separately.** `wrangler deploy` from the `worker/` directory. Not through GitHub Actions CI. There is no automated safety net — type-check with `pnpm check` before deploying.

---

## 17. Architecture Decisions Log

| Decision | Why | Date |
|-|-|-|
| Cookies over localStorage for auth | Cloudflare Workers can't access localStorage; httpOnly cookies work server-side | Feb 2026 |
| JSONB for socials/theme/loadout | Flexible schema, no migrations needed for adding fields | Feb 2026 |
| Suggest Update as separate tab route | Keeps overview page focused; form logic is complex enough to warrant isolation | Mar 2026 |
| Global freeze instead of per-game | Per-game freeze on list page was noisy; global freeze is the emergency use case | Mar 2026 |
| Pill-style tabs over underline tabs | User wanted "distinguishable distance between tabs" | Mar 2026 |
| `$derived` over `$effect` for data | Derived values are declarative and don't cause extra re-renders | Feb 2026 |
| Worker TypeScript conversion | ~4000 lines of JS with no type checking deploying outside CI. Found real bugs during conversion. | Mar 2026 |
| Write-in fields in submitter_notes | Avoids DB migration for Community Review feature; verifiers see the data immediately | Mar 2026 |
| Re-import from submission | Games approved before code changes need a way to refresh; avoids manual SQL | Mar 2026 |
| bits-ui over native elements | Gains: focus trapping, a11y, keyboard nav, consistent styling via data-state attrs | Feb 2026 |
| Paraglide for i18n | Compile-time, tree-shakeable, ~1900 keys across en/es | Mar 2026 |
| CSP via SvelteKit nonces (not _headers) | Per-request nonces for inline scripts; static headers can't do this | Mar 2026 |

---

## 18. Development Environment — Windows

The developer runs Windows (not macOS or Linux). Key implications:

### Running Scripts
- **No `bash`** available from CMD. Use PowerShell instead.
- Scripts are stored as `.ps1` files in `scripts/`.
- Run from repo root: `powershell -ExecutionPolicy Bypass -File scripts/your-script.ps1`
- If execution policy blocks it, the `-ExecutionPolicy Bypass` flag handles it for the current invocation.

### PowerShell Gotchas
- **`[brackets]` in file paths** — PowerShell treats `[` and `]` as wildcard characters. When accessing files like `src/routes/games/[game_id]/+page.svelte`, use `-LiteralPath` instead of `-Path`, or use backtick escaping: `` `[game_id`] ``.
- **Encoding** — `Set-Content -Encoding UTF8` adds a BOM by default in older PowerShell versions. Use `-Encoding UTF8NoBOM` if available (PS 6+), or verify files don't get BOM-prefixed.
- **No special characters in scripts** — Avoid `✓`, `→`, `✕` and other non-ASCII characters in `.ps1` files. Stick to plain ASCII. PowerShell's parser chokes on mangled UTF-8 in string literals.
- **Regex `^\t` doesn't match** — Source files use spaces for indentation, not tabs. Use `^\s+` in regex patterns.
- **`Get-Content -Raw` vs `Get-Content`** — `-Raw` reads the whole file as one string (so `^` only matches the file start). Without `-Raw`, you get an array of lines where `^` matches each line start. For line-matching scripts, use the array form.

### Git / Node / Build
- Standard `npm` / `pnpm` workflow works. No WSL required.
- Cloudflare Pages deploys from the GitHub repo, not from local builds.

---

## 19. Shared Utility Components

### `<AccessDenied>` — `src/lib/components/AccessDenied.svelte`

Replaces the ~15 copy-pasted access-denied blocks across admin pages.

```svelte
<script>
  import AccessDenied from '$lib/components/AccessDenied.svelte';
</script>

<!-- Basic (defaults to backHref="/" and backLabel from m.error_go_home()) -->
<AccessDenied message={m.admin_super_required()} />

<!-- Custom back link -->
<AccessDenied
  message={m.admin_access_required()}
  backHref="/admin"
  backLabel={m.admin_back_to_dashboard()}
/>
```

**Props:**
| Prop | Type | Default | Notes |
|-|-|-|-|
| message | string | `''` | Muted text below "Access Denied" heading |
| backHref | string | `'/'` | Where the back button navigates |
| backLabel | string | `m.error_go_home()` | Button text |

### `<LoadingState>` — `src/lib/components/LoadingState.svelte`

Replaces the ~20 copy-pasted spinner + message blocks.

```svelte
<script>
  import LoadingState from '$lib/components/LoadingState.svelte';
</script>

<!-- Full page loading (uses .center with 4rem padding) -->
<LoadingState message={m.admin_loading_runs()} />

<!-- In-card compact loading (uses .center-sm with 2rem padding) -->
<div class="card">
  <LoadingState message={m.admin_loading_users()} compact />
</div>

<!-- Spinner only, no message -->
<LoadingState compact />
```

**Props:**
| Prop | Type | Default | Notes |
|-|-|-|-|
| message | string | `''` | Muted text below spinner. Omit for spinner-only. |
| compact | boolean | `false` | `true` = `.center-sm` (2rem), `false` = `.center` (4rem) |
