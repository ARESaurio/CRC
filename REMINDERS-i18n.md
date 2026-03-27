# i18n — Spanish Language Support (Paraglide JS)

**Status:** Phase 2 complete — Phase 3 (community translation review) next
**Last updated:** March 27, 2026

---

## What's Left

### Not translated (by design)
- **Legal page body prose** (~150 strings across privacy/terms/cookies) — headings/TOC/tables done, body paragraphs await legal translator
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

No routing changes, no link changes, no new imports. All existing `localizeHref()` calls automatically handle the new prefix.

See `docs/ADDING-LANGUAGES.md` for the full step-by-step guide.

---

## i18n for New Code

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

Add keys to both `messages/en.json` and `messages/es.json` simultaneously.

---

## Critical Setup Details

These caused bugs during setup. Future assistants: read carefully.

1. **Message format plugin is required** — `project.inlang/settings.json` must include `@inlang/plugin-message-format` or generated files will be empty.
2. **`src/hooks.js` is required for URL routing** — Paraglide v2 doesn't export a `reroute` hook. You must write it manually using `deLocalizeHref`.
3. **`HrefLang` goes outside `<svelte:head>`** — it has its own `<svelte:head>` block. Nesting it inside another breaks all styles.
4. **Paraglide Vite plugin goes before `sveltekit()`** in `vite.config.ts`.
5. **Stale generated files** — if new keys give "X is not a function" errors: `rm -rf src/lib/paraglide && pnpm dev`.
6. **Ternary expressions** — don't add inner braces: `{condition ? m.my_key() : 'fallback'}` (not `{condition ? {m.my_key()} : 'fallback'}`).
7. **`sed` with special characters** — use `#` as delimiter instead of `|`. Strings with `&` need escaping or use `str_replace`.

---

## Important Notes
- **Don't translate URL slugs.** `/es/games/dark-souls` is correct. `/es/juegos/dark-souls` is not.
- **Dynamic content from Supabase stays in its original language.** Game names, runner bios, run notes are user-generated.
- **`$lib/paraglide/` is generated.** Don't edit it — edit `messages/*.json` instead.
- **Cloudflare Pages:** `disableAsyncLocalStorage: true` is required.
- **Section header keys** (`__SECTION_NAME`) in JSON are organizational markers — they generate no-op functions and are never called.
- **Pluralization:** `m.key().split(' | ')[count !== 1 ? 1 : 0]`
- **Interpolated HTML:** `{@html m.key({ link_start: '<a href="...">', link_end: '</a>' })}`

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