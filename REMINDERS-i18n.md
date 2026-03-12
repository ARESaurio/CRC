# i18n — Spanish Language Support (Paraglide JS)

**Status:** Phase 2 complete — Phase 3 (community translation review) next
**Added:** March 2026
**Last updated:** March 12, 2026

---

## Stats

| Metric | Count |
|-|-|
| Translation keys | 1,810 |
| JSON file lines (each) | ~1,870 |
| Section headers in JSON | 55 |
| Component files with paraglide | 81 |
| Batches delivered | 17 + hotfix + 2 typecheck fixes |

---

## What's Done

### Phase 1 — Wire In ✅
- [x] Paraglide JS v2 installed (`pnpm add -D @inlang/paraglide-js -w`)
- [x] Inlang project config (`project.inlang/settings.json`) — `en` base, `es` secondary
- [x] URL strategy: English at `/` (no prefix), Spanish at `/es/` prefix
- [x] `disableAsyncLocalStorage: true` for Cloudflare Pages compatibility
- [x] Vite plugin wired up in `vite.config.ts` (must be listed **before** `sveltekit()`)
- [x] `app.html` uses `lang="en"` (Paraglide handles locale detection at runtime)
- [x] Translation files (`messages/en.json`, `messages/es.json`)
- [x] `LanguageSwitcher.svelte` component (dropdown with 🌐 toggle)
- [x] `HrefLang.svelte` component (SEO `<link rel="alternate" hreflang="...">` tags)
- [x] `src/hooks.js` created with `reroute` function (required for `/es/` URL routing)
- [x] `src/lib/paraglide/` added to `.gitignore`

### Phase 2 — Extract Strings ✅

Every page and component in the site now has paraglide imported and strings translated. The full list of what was translated in each batch:

**Global Chrome (prior sessions):** Header nav, Footer, DebugBar, Sign-in page, Error page, Admin layout, Admin dashboard, Header sidebar

**Batches 1–9 (public pages):** Games/Runners/Teams/News listing pages, Submit hub, Rules page, CookieConsent, AuthGuard, ReportModal, Game overview/history/resources/runs pages, Game rules (Rule Builder + all accordions), Category runs (tier tabs/filters/table/pagination), Runner detail (all 5 tabs), Profile status/settings/link-callback/setup/create/theme/edit pages, Game suggest, Support page (FAQ/staff/privacy/contact), Guidelines page (all 9 sections)

**Batch 10 (legal pages):** Privacy/Terms/Cookies — page titles, TOC entries, all section headings, table headers, internal links localized. Body prose remains in English awaiting legal translator.

**Batch 11 (profile deep content):** Profile edit field labels/placeholders/hints, upload strings, Customize section, submissions update/game headings

**Batches 12–14 (admin pages):** All 12 admin page titles/headings, all modal headings, all filter/status labels, all table headers, all form fields, all rejection/revoke reasons, all descriptions and empty states across runs/games/profiles/game-updates/users/reports/news/health/financials/debug/staff-guides

**Batch 15 (game editor):** All 11 game editor sub-tab components (GeneralTab, CategoriesTab, ChallengesTab, RestrictionsTab, CustomTabsSettings, HistoryTab, DifficultiesTab, CharactersTab, RulesTab, AdditionalContentTab) + admin game review page

**Batch 16 (partial files):** Profile edit deep content (goals/highlights/banner/social links), submit-game form hints, submissions update/game form labels, runner detail tab descriptions/empty states, submissions type labels

**Batch 17 (feature pages):** Forum page, Guides page, Messages inbox/new/thread pages, NotificationBell component

**Bug fixes:** Fixed syntax bugs in profile/create and category runs pages. Added missing `InboxThread`/`MessageWithSender`/`ThreadParticipant` types. Fixed implicit `any` and `string | undefined` TS errors in messages pages.

---

## What's Left

### Not translated (by design)
- **Legal page body prose** (~150 strings across privacy/terms/cookies) — headings/TOC/tables done, body paragraphs await legal translator
- **Brand/platform names** (YouTube, Twitch, Discord, Steam, etc.) — proper nouns, same in every language
- **Theme preview mock text** (Deathless, No Hit, etc.) — display-only preview content
- **~15 strings with complex inline HTML** (sentences split by `<strong>`/`<a>` tags mid-word) — would need `{@html}` treatment

### Phase 3 — Community Translation
- [ ] Share `messages/es.json` with Spanish-speaking community members for review
- [ ] Set up Fink (inlang's translation editor) or share JSON directly
- [ ] Add translation contribution guide to repo or Discord
- [ ] Get legal page body prose professionally translated

### Phase 4 — Additional Languages
Adding a new language (e.g. Russian) requires only:

1. Add `"ru"` to `languageTags` in `project.inlang/settings.json`
2. Create `messages/ru.json` (copy `en.json`, translate values)
3. Add `"language_russian": "Русский"` to **all existing** message files
4. Add `ru` entries to the two maps in `LanguageSwitcher.svelte`

No routing changes, no link changes, no new imports. All existing `localizeHref()` calls automatically handle the new `/ru/` prefix.

See `docs/ADDING-LANGUAGES.md` for the full step-by-step guide.

---

## Going Forward — i18n for New Code

All new components and pages should include i18n from the start:

```svelte
<script>
  import { localizeHref } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';
</script>

<!-- Use m.key_name() for all visible text -->
<h1>{m.my_heading()}</h1>

<!-- Use localizeHref() for all internal links -->
<a href={localizeHref('/games')}>Games</a>
```

Add keys to both `messages/en.json` and `messages/es.json` simultaneously. Paraglide gives you autocomplete and type errors if you miss a parameter.

---

## Critical Setup Details

These caused bugs during setup. Future assistants: read carefully.

### 1. The message format plugin is required
`project.inlang/settings.json` **must** include the message format plugin or generated files will be empty:
```
"https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@latest/dist/index.js"
```

### 2. `src/hooks.js` is required for URL routing
Paraglide v2 does **not** export a `reroute` hook. You must write it manually:
```js
// src/hooks.js
import { deLocalizeHref } from '$lib/paraglide/runtime';

/** @type {import('@sveltejs/kit').Reroute} */
export function reroute({ url }) {
    return deLocalizeHref(url.pathname);
}
```

### 3. `HrefLang` goes outside `<svelte:head>`
`HrefLang.svelte` has its own `<svelte:head>` block. Nesting it inside another `<svelte:head>` breaks all styles.

### 4. Paraglide Vite plugin goes before sveltekit()
In `vite.config.ts`, `paraglideVitePlugin()` must be listed **before** `sveltekit()` in the plugins array.

### 5. Stale generated files
If you add new message keys and get "X is not a function" errors:
```
rm -rf src/lib/paraglide
pnpm dev
```

### 6. Ternary expressions inside Svelte template blocks
When using `m.*()` inside a ternary that's already inside `{}`, do NOT add inner braces:
```svelte
<!-- WRONG — double braces causes parse error -->
{condition ? {m.my_key()} : 'fallback'}

<!-- CORRECT — m.* is already inside a {} block -->
{condition ? m.my_key() : 'fallback'}
```

### 7. sed replacements with special characters
When using `sed` to replace strings containing `|` (pipe), use `#` as the delimiter instead of `|`. Strings containing `&` also need escaping or use `str_replace` instead.

---

## Important Notes
- **Don't translate URL slugs.** `/es/games/dark-souls` is correct. `/es/juegos/dark-souls` is not.
- **Dynamic content from Supabase stays in its original language.** Game names, runner bios, run notes — these are user-generated and not translated.
- **The `$lib/paraglide/` directory is generated.** Don't edit files in it. Edit `messages/*.json` instead.
- **Cloudflare Pages:** The `disableAsyncLocalStorage: true` flag is required.
- **Save translation files as UTF-8.**
- **Section header keys** (`__SECTION_NAME`) in the JSON files are organizational markers — they generate harmless no-op Paraglide functions and are never called in components.
- **Pluralization pattern:** `m.key().split(' | ')[count !== 1 ? 1 : 0]` — store both forms separated by ` | ` in the value.
- **Interpolated HTML:** Use `{@html m.key({ link_start: '<a href="...">', link_end: '</a>' })}` for strings containing links.

## File Locations

| What | Where |
|-|-|
| Inlang config | `project.inlang/settings.json` |
| English messages | `messages/en.json` |
| Spanish messages | `messages/es.json` |
| Generated runtime (don't edit) | `src/lib/paraglide/` |
| Language switcher | `src/lib/components/LanguageSwitcher.svelte` |
| SEO hreflang tags | `src/lib/components/HrefLang.svelte` |
| Vite plugin config | `vite.config.ts` |
| URL reroute hook | `src/hooks.js` |
| Adding languages guide | `docs/ADDING-LANGUAGES.md` |
