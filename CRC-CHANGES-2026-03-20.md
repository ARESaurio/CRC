# CRC Cleanup & Roadmap — March 20, 2026

Session summary: reviewed the tech stack (JavaScript vs TypeScript), identified dead code from the completed Supabase migration, and planned the Worker TypeScript conversion.

---

## Understanding Gained

- **JavaScript** is the runtime language — it's what actually executes in browsers and on Cloudflare Workers.
- **TypeScript** is a safety layer on top of JavaScript. It adds type annotations that catch bugs at build time, then compiles down to identical JavaScript. There is no performance difference.
- The SvelteKit frontend already uses TypeScript. The Worker API (~4,000 lines) and CI scripts (~2,000 lines) are plain JavaScript.
- The Worker deploys **separately** from the site via `wrangler deploy` — it does NOT go through GitHub Actions CI. This means Worker bugs have no automated safety net right now.

---

## Cleanup: Files to Delete

The Supabase migration is complete. The old markdown directories (`_games/`, `_runs/`, `_runners/`) are gone. The CI validation scripts validate data that no longer exists — they pass silently because there's nothing to check.

### Delete these files:

```
scripts/validate-schema.js        — validated _games/_runs/_runners markdown
scripts/validate-runs.js          — validated queued run markdown
scripts/check-banned-terms.js     — scanned markdown dirs for banned terms
scripts/seed-supabase.cjs         — one-time migration script (already run)
scripts/lib/                      — entire directory (shared lib for validation scripts)
  scripts/lib/index.js
  scripts/lib/parsers/front-matter.js
  scripts/lib/utils/file-utils.js
  scripts/lib/validators/constants.js
  scripts/lib/validators/field-validators.js
scripts/package.json              — set commonjs type for validation scripts
scripts/README.md                 — documents scripts that are mostly deleted

src/data/templates/               — entire directory (old markdown templates)
  src/data/templates/README.md
  src/data/templates/game-template.md
  src/data/templates/run-template.md
  src/data/templates/runner-template.md

src/data/achievements/hades-2__gary-asher__all-aspects-clear.md  — test seed data
```

### Keep these files in `scripts/`:

```
scripts/download-fonts.ps1   — still needed for re-downloading self-hosted fonts
scripts/download-fonts.sh    — same script, Linux/Mac version
```

### Edit these files:

**`package.json`** — remove the four validate script entries. Updated file provided.

**`.github/workflows/ci.yml`** — remove the `Validate config` step. Updated file provided.

---

## Cleanup: Updated Files

Updated versions of `package.json` and `.github/workflows/ci.yml` are provided alongside this document. Replace the originals with these.

---

## Next Priority: Worker TypeScript Conversion

### Why this matters

The Worker (`worker/src/`) is the entire API backend — run submissions, approvals, game management, notifications, messaging, reports, profiles, and auth. It's ~4,000 lines of plain JavaScript that deploys outside of CI with zero automated type checking. A typo in a column name or a missing null check goes straight to production.

### What the conversion involves

1. **Rename `.js` files to `.ts`** in `worker/src/`
2. **Add type annotations** to function parameters, return types, and request/response shapes
3. **Define interfaces** for Supabase table rows, API request bodies, and API responses
4. **Add a `tsconfig.json`** to `worker/` for the Worker's TypeScript config
5. **Update `wrangler.toml`** — Wrangler natively supports TypeScript entry points
6. **Add a build check** before deploy (either a script or a CI step)

### Structure after conversion

```
worker/
  src/
    index.ts                 — entry point (route matching + dispatch)
    handlers/
      runs.ts                — /runs endpoints
      games.ts               — /games endpoints
      game-editor.ts         — /game-editor endpoints
      profiles.ts            — /profiles endpoints
      notifications.ts       — /notifications endpoints
      messages.ts            — /messages endpoints
      reports.ts             — /reports endpoints
      users.ts               — /users endpoints
      export.ts              — /export endpoints
    lib/
      auth.ts                — token verification
      cors.ts                — CORS headers
      turnstile.ts           — captcha verification
      game-helpers.ts        — shared game utilities
      supabase.ts            — Supabase client factory
      discord.ts             — webhook helpers
      rate-limit.ts          — rate limiting
      utils.ts               — shared utilities
    types/
      index.ts               — all Worker type definitions
  tsconfig.json
  wrangler.toml
```

### Conversion — COMPLETED

All files have been converted. The full output is in `worker-ts.zip`.

**Bug found during conversion:** `handlers/users.js` used `authenticateUser()` for the
`/export-data` and `/delete-account` endpoints but never imported it. This means those
endpoints would throw a runtime `ReferenceError` in production. Fixed in `users.ts` by
adding `authenticateUser` to the import from `../lib/auth.js`.

**Dead code found:** `handlers/export.ts` is a standalone duplicate of `handleDataExport`
that also exists in `handlers/users.ts`. The router (`index.ts`) imports from `users.ts`,
so `export.ts` is never used. Consider deleting it in a follow-up.

### New files added

```
worker/package.json     — adds TypeScript + @cloudflare/workers-types dev deps
worker/tsconfig.json    — TypeScript config for the Worker
worker/src/types/index.ts — shared type definitions (Env, RoleInfo, etc.)
```

### Deployment steps

1. Replace the entire `worker/src/` directory with the new `.ts` files
2. Replace `worker/wrangler.toml` (now points to `src/index.ts`)
3. Add `worker/package.json` and `worker/tsconfig.json`
4. Delete all old `.js` files in `worker/src/`
5. From the `worker/` directory, run:
   ```
   pnpm install
   pnpm check        # verify types pass
   pnpm deploy       # deploy to Cloudflare
   ```
6. Verify the site works (submit a test, check admin panel)

---

## Already Done (confirmed this session)

- Security headers (`_headers`) — all present and correct
- `robots.txt` — blocks `/admin/`, `/profile/`, `/auth/`, `/api/`
- Supabase migration — complete, no markdown data files remain for games/runs/runners
- `data.ts` — no longer exports `getGames()`, `getRuns()`, `getRunners()`, etc.

---

## CLAUDE.md Updates Needed

After applying the cleanup, update the Development Checklist in CLAUDE.md:

- [x] Mark "Create `.github/workflows/ci.yml`" as done (it exists and works)
- [x] Mark "`static/_headers` file" as done (it's in the project root as `_headers`)
- [x] Mark "`static/robots.txt`" as done (exists at `static/robots.txt`)
- [ ] Remove references to `promote-runs.js` and `sync-runner-profiles.js` (already deleted)
- [ ] Remove Phase 1/Phase 4 seed/cleanup items that are complete
- [ ] Add Worker TypeScript conversion to the roadmap
