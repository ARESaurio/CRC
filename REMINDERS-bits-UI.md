# bits-UI Component Migration — REMINDERS

This file tracks the migration from custom/native HTML elements to the `$lib/components/ui` component library (bits-ui wrappers). Drop this file in `C:\Dev\CRC-main\` so Claude can reference it.

---

## Available UI Components

Located at `src/lib/components/ui/`. All wrap [bits-ui](https://bits-ui.com) primitives with project styling.

| Component | Import | Key Props | Notes |
|-|-|-|-|
| Button | `* as Button from 'ui/button'` | `variant`: default/accent/outline/ghost/danger · `size`: default/sm/lg/icon | Replaces `<button class="btn btn--accent">` etc |
| Dialog | `* as Dialog from 'ui/dialog'` | Root(`open`), Overlay, Content, Header, Title, Description, Close, Footer | Already used in admin modals |
| AlertDialog | `* as AlertDialog from 'ui/alert-dialog'` | Root(`open`), Overlay, Content, Title, Description, Action, Cancel | Replaces native `confirm()` |
| Tabs | `* as Tabs from 'ui/tabs'` | Root(`value`), List(`variant`/`flush`), Trigger(`value`/`variant`), Content(`value`) | Replaces `game-tab`/`tab-btn` patterns |
| Select | `* as Select from 'ui/select'` | Root(`value`), Trigger, Content, Item(`value`/`label`) | Replaces native `<select>` |
| Checkbox | `* as Checkbox from 'ui/checkbox'` | Root(`checked`) | Replaces `<input type="checkbox">` for multi-select |
| Switch | `* as Switch from 'ui/switch'` | Root(`checked`) | Replaces boolean toggle checkboxes |
| RadioGroup | `* as RadioGroup from 'ui/radio-group'` | Root(`value`), Item(`value`) | Replaces `<input type="radio">` with visible dots |
| ToggleGroup | `* as ToggleGroup from 'ui/toggle-group'` | Root(`value`, `type`), Item(`value`) | Replaces hidden-radio + styled-button patterns, segmented filters |
| Popover | `* as Popover from 'ui/popover'` | Root(`open`), Trigger, Content(`sideOffset`/`align`) | Header "More" menu, NotificationBell |
| DropdownMenu | `* as DropdownMenu from 'ui/dropdown-menu'` | Root(`open`), Trigger, Content, Item | LanguageSwitcher |
| Combobox | `* as Combobox from 'ui/combobox'` | Root, Input, Content, Item | Typeahead/autocomplete patterns |
| Accordion | `* as Accordion from 'ui/accordion'` | Already used in 4 files | |
| Collapsible | `* as Collapsible from 'ui/collapsible'` | Already used in 7 files | |
| Separator | `* as Separator from 'ui/separator'` | Root(`class`, `orientation`) | Replaces `<hr>` dividers |
| Progress | `* as Progress from 'ui/progress'` | Already used in 1 file | |
| Tooltip | `* as Tooltip from 'ui/tooltip'` | Root, Trigger, Content | Not yet used — skip (see Batch 14) |
| Pagination | `* as Pagination from 'ui/pagination'` | Root(`page`, `count`, `perPage`), PrevButton, NextButton, Page | Used in 2 files |
| Slider | `* as Slider from 'ui/slider'` | Root(`value`, `min`, `max`, `step`, `onValueChange`) | Used in 5 files — `value` is `number[]` |
| Meter | `* as Meter from 'ui/meter'` | Root(`value`, `max`) | Used in 2 files — replaces progress bars |

---

## Conversion Patterns

### Tabs
```svelte
<!-- BEFORE -->
<nav class="game-tabs tabs--flush">
  <button class="game-tab" class:game-tab--active={activeTab === 'general'}
    onclick={() => activeTab = 'general'}>General</button>
  <button class="game-tab" class:game-tab--active={activeTab === 'rules'}
    onclick={() => activeTab = 'rules'}>Rules</button>
</nav>
{#if activeTab === 'general'}<div class="tab-body">...</div>{/if}
{#if activeTab === 'rules'}<div class="tab-body">...</div>{/if}

<!-- AFTER -->
<Tabs.Root bind:value={activeTab}>
  <Tabs.List variant="game" flush>
    <Tabs.Trigger variant="game" value="general">General</Tabs.Trigger>
    <Tabs.Trigger variant="game" value="rules">Rules</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="general"><div class="tab-body">...</div></Tabs.Content>
  <Tabs.Content value="rules"><div class="tab-body">...</div></Tabs.Content>
</Tabs.Root>
```

**Variant prop:** Must be set on BOTH `Tabs.List` and `Tabs.Trigger` — List controls the container class, Trigger controls the individual tab class.

**`flush` prop:** Adds `tabs--flush` (removes margin-bottom). Used when a `.tab-body` panel sits directly below.

**CSS:** `_tabs.scss` already maps `data-state="active"` to project active styles. No CSS changes needed.

**Navigation tabs (anchor links):** Do NOT convert route-based tabs (like game `+layout.svelte`) to Tabs.Root. Those use `<a href>` for routing, not state-driven content switching.

### AlertDialog (replaces `confirm()`)
```svelte
<!-- Add reusable state -->
let confirmOpen = $state(false);
let confirmTitle = $state('');
let confirmDesc = $state('');
let confirmCallback = $state<(() => Promise<void>) | null>(null);
function openConfirm(title: string, desc: string, cb: () => Promise<void>) {
  confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
}
async function handleConfirmAction() {
  confirmOpen = false;
  if (confirmCallback) await confirmCallback();
  confirmCallback = null;
}

<!-- In template (once per page, at bottom) -->
<AlertDialog.Root bind:open={confirmOpen}>
  <AlertDialog.Overlay />
  <AlertDialog.Content>
    <AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
    <AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
    <div class="alert-dialog-actions">
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action class="btn btn--danger" onclick={handleConfirmAction}>
        Delete
      </AlertDialog.Action>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- Usage: replace if (!confirm('...')) return; -->
openConfirm('Title', 'Description', async () => { /* original body */ });
```

**Exception:** `beforeNavigate` confirm must stay native — `cancel()` requires synchronous execution.

### Select (replaces `<select>`)
```svelte
<!-- BEFORE -->
<select bind:value={filter}>
  <option value="all">All</option>
  <option value="pending">Pending</option>
</select>

<!-- AFTER -->
<Select.Root bind:value={filter}>
  <Select.Trigger>{filter || 'All'}</Select.Trigger>
  <Select.Content>
    <Select.Item value="all" label="All" />
    <Select.Item value="pending" label="Pending" />
  </Select.Content>
</Select.Root>
```

**Note:** Select.Trigger doesn't auto-display the selected label. You must render it yourself inside the trigger.

### Checkbox (replaces `<input type="checkbox">`)
```svelte
<!-- BEFORE -->
<label><input type="checkbox" bind:checked={val} /> Label text</label>

<!-- AFTER -->
<label class="toggle-row">
  <Checkbox.Root bind:checked={val} />
  <span>Label text</span>
</label>
```

### Switch (replaces boolean toggle checkboxes)
```svelte
<!-- BEFORE -->
<label class="toggle-row">
  <input type="checkbox" bind:checked={enabled} />
  <span>Enable feature</span>
</label>

<!-- AFTER -->
<label class="toggle-row">
  <Switch.Root bind:checked={enabled} />
  <span class="toggle-label">Enable feature</span>
</label>
```

**When to use Switch vs Checkbox:** Use Switch for on/off toggles (enable/disable). Use Checkbox for multi-select lists (pick genres, pick platforms).

### RadioGroup (replaces visible `<input type="radio">`)
```svelte
<!-- BEFORE -->
<div class="radio-group">
  {#each options as opt}
    <label class="radio-item">
      <input type="radio" name="timing" value={opt.value} bind:group={timingMethod} />
      <span>{opt.label}</span>
    </label>
  {/each}
</div>

<!-- AFTER -->
<RadioGroup.Root bind:value={timingMethod}>
  {#each options as opt}
    <RadioGroup.Item value={opt.value}>{opt.label}</RadioGroup.Item>
  {/each}
</RadioGroup.Root>
```

**Note:** `bind:group` → `bind:value` on Root. Remove `name` attr — bits-ui handles it.

### ToggleGroup (replaces hidden-radio + styled-button groups)
```svelte
<!-- BEFORE -->
<div class="toggle-row">
  <label class="toggle-opt"><input type="radio" name="et" value="income" bind:group={entryType} /><span class="toggle-btn">Income</span></label>
  <label class="toggle-opt"><input type="radio" name="et" value="expense" bind:group={entryType} /><span class="toggle-btn">Expense</span></label>
</div>

<!-- AFTER -->
<ToggleGroup.Root class="toggle-row" bind:value={entryType}>
  <ToggleGroup.Item value="income">Income</ToggleGroup.Item>
  <ToggleGroup.Item value="expense">Expense</ToggleGroup.Item>
</ToggleGroup.Root>
```

**CSS:** Replace `:has(input:checked)` selectors with `:global([data-state="on"])`. Override `.ui-toggle-group` defaults (border, overflow) when custom layout is needed.

**When to use RadioGroup vs ToggleGroup:** RadioGroup shows visible radio dots (standard form radios). ToggleGroup shows segmented buttons where radios are hidden (`.toggle-opt input { display: none; }`).

### Button (replaces `<button>`)
```svelte
<!-- BEFORE -->
<button class="btn btn--accent" onclick={save} disabled={saving}>Save</button>

<!-- AFTER -->
<Button.Root variant="accent" onclick={save} disabled={saving}>Save</Button.Root>
```

**Do NOT convert these special-purpose button classes:**
`btn--save`, `btn--reset`, `btn--add`, `btn--approve`, `btn--reject`, `btn--claim`, `btn--changes`, `btn--delete`, `btn--verify`, `btn--unverify`, `btn--freeze`, `btn--unfreeze`, `btn--draft`, `btn--rollback`, `btn--report`, `btn--discord`, `btn--twitch`, `btn--upload`, `btn--xs`, `btn-icon`, `btn-edit-tags`, `btn--filter-toggle`, `btn--danger-text`, `btn--acknowledge`, `btn--reopen`, `btn--noted`, `btn--review-approve`.

Also skip: buttons with `class:` conditional bindings, `<a>` tags styled as buttons, layout buttons (close, nav toggle, cookie consent, mobile-toggle, admin-toggle, nav-user, profile-panel).

### Separator (replaces `<hr>`)
```svelte
<!-- BEFORE -->
<hr class="divider" />

<!-- AFTER -->
<Separator.Root class="divider" />
```

**CSS:** Separator.Root renders as `height: 1px; background: var(--border)`. Remove `border` rules from divider CSS, keep only `margin`. Use `:global(.divider)` since it's a child component.

### Slider (replaces `<input type="range">`)
```svelte
<!-- BEFORE -->
<input type="range" min="0" max="50" bind:value={opacity} oninput={markUnsaved} class="form-range" />

<!-- AFTER -->
<Slider.Root value={[opacity]} min={0} max={50} step={1} onValueChange={(v: number[]) => { opacity = v[0]; markUnsaved(); }} class="form-range" />
```

**For handlers that used `(e: Event)`:**
```typescript
// BEFORE
function handleZoom(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  // ... use val
}

// AFTER
function handleZoom(vals: number[]) {
  const val = vals[0];
  // ... use val
}
```

**CSS:** Replace `accent-color` rules with `:global(.[class].ui-slider)`. The Slider component renders its own track, range, and thumb elements.

### Meter (replaces progress bars)
```svelte
<!-- BEFORE -->
<div class="progress-bar"><div class="progress-bar__fill" style="width: {pct}%"></div></div>

<!-- AFTER -->
<Meter.Root value={current} max={total} class="progress-bar" />
```

**CSS:** Remove `.progress-bar__fill` rules (Meter handles the indicator). Container styles move to `:global(.progress-bar.ui-meter)`. Override indicator color via `:global(.[class] [data-meter-indicator])`.

---

## Batch Tracker

| # | Component | Status | Details |
|-|-|-|-|
| 1 | Dialog + AlertDialog | ✅ Done | 15 files |
| 2 | Tabs | ✅ Done | 6 files (skip games layout — route nav) |
| 3 | Select | ✅ Done | 48 total (28 initial + 20 deferred) across 25 files |
| 4 | Checkbox + Switch | ✅ Done | 34 checkboxes across 8 files |
| 5 | confirm() | ✅ Done | 1 converted, 1 stays native (beforeNavigate) |
| 6 | Button — admin | ✅ Done | ~15 files |
| 7 | Button — profile + games | ✅ Done | ~20 files |
| 8 | Button — shared components | ✅ Done | ~5 files |
| 9 | RadioGroup + ToggleGroup | ✅ Done | 2 RadioGroup (submit-game) + 4 ToggleGroup (theme + financials) |
| 10 | ToggleGroup (filter-tabs) | ✅ Done | 7 admin files, ~54 buttons → `ToggleGroup.Root`/`ToggleGroup.Item` |
| 11 | Separator | ✅ Done | 10 `<hr>` across 2 files (DraftEditor + Header) |
| 12 | Pagination | ✅ Done | 2 files (`admin/users`, `games/.../category`) |
| 13 | Combobox (typeaheads) | 🔶 Partial | ~8 files — see Batch 23 |
| 14 | Tooltip (UI component) | ⬜ Skip | Decorative `title=` attrs — glossary tooltips use CSS-only auto-match instead (Batch 20) |
| 15 | Orphaned CSS | ✅ Done | Removed orphaned `.select`, `.filter-select`, `.filters__controls select` across 7 files |
| 16 | Slider | ✅ Done | 7 `<input type="range">` across 5 files (crop zoom ×3, bg opacity, avatar zoom, banner opacity ×2) |
| 17 | Meter | ✅ Done | 3 progress bars across 2 files (runner goals, game achievements) |
| 18 | Remaining UI conversions | ✅ Done | ToggleGroup (search + admin/news), Tabs (profile/edit), Collapsible (site-settings, profiles, users) |
| 19 | Import path standardization | ✅ Done | 38 files: `$components/ui/` → `$lib/components/ui/` |
| 20 | Glossary tooltips | ✅ Done | Auto-match + manual `{{tooltip:slug}}` wired into all 68 `renderMarkdown()` calls |
| 21 | Tooltip security | ✅ Done | `{{tooltip:` blocked via banned-terms + `stripTooltipSyntax()` on all user save points |
| 22 | Crop modals → Dialog | ✅ Done | 2 files — hand-rolled modal-backdrop → Dialog.Root |
| 23 | Typeaheads → Combobox | 🔶 Partial | 3/8 files done (simple); 5 complex files remain |
| 24 | Missed Button conversions | ✅ Done | 5 buttons across 4 files — most original targets only had special-purpose classes |

---

## Batch 10 — ToggleGroup (filter-tabs): Done

Converted ~54 `.filter-tab` buttons → `ToggleGroup.Root`/`ToggleGroup.Item` across 7 admin files: `profiles`, `users`, `games`, `runs`, `reports`, `game-updates`, `rule-suggestions`.

**CSS:** Overrides `.ui-toggle-group` defaults via `:global(.filter-tabs.ui-toggle-group)` to strip default border/overflow and restore pill-button visual style. Badge counts (`.filter-tab__count`) preserved inside items.

**Side effects:** `admin/users` uses `onValueChange={(v: string) => { currentPage = 1; }}` to reset pagination on filter change.

---

## Batch 12 — Pagination: Done

Replaced manual prev/next `Button.Root` with `Pagination.Root`/`Pagination.PrevButton`/`Pagination.NextButton` in 2 files:

| File | Notes |
|-|-|
| `admin/users/+page.svelte` | Kept "Page X of Y · N users" text between buttons |
| `games/[game_id]/runs/[tier]/[category]/+page.svelte` | Added `onclick` on nav buttons for `scrollIntoView` behavior |

**CSS:** Updated `.pagination` to `:global(.pagination.ui-pagination)` since the class is now on a child component.

---

## Batch 13 → 23 — Combobox (typeaheads): TODO

Superseded by Batch 23. Original scope was 10 files; re-audit found ~8 with active typeahead patterns.

---

## Batch 22 — Crop Modals → Dialog: Done

Replaced hand-rolled `modal-backdrop` + `crop-modal` with `Dialog.Root`/`Dialog.Overlay`/`Dialog.Content` in 2 files. Gains: focus trapping, escape-to-close, scroll-lock, a11y attributes — all free from bits-ui.

| File | Changes |
|-|-|
| `src/routes/submit-game/+page.svelte` | Added Dialog import. Replaced `{#if cropModalOpen}` block with `Dialog.Root`. Removed `.modal-backdrop`, `.crop-modal`, `.crop-modal__header`, `.crop-modal__close` CSS. Added `:global(.crop-dialog)` width override + `.crop-dialog__body` padding. |
| `src/routes/admin/game-editor/[game_id]/GeneralTab.svelte` | Added Dialog import. Same template swap. No CSS changes — uses shared `_game-editor.scss` which already had `.crop-dialog` and `.crop-dialog__body` classes. |

**Pattern:** `Dialog.Root open={cropModalOpen} onOpenChange={(o: boolean) => { if (!o) closeCropModal(); }}` — binds open state and delegates cleanup to the existing `closeCropModal()` function (which resets cropImg, cropOriginalFile, etc.).

---

## Batch 23 — Typeaheads → Combobox: Partial (3/8 done)

Replacing custom typeahead implementations with `Combobox.Root`/`Combobox.Input`/`Combobox.Content`/`Combobox.Item`.

### Done (simple files):

| File | Typeaheads | Notes |
|-|-|-|
| `src/routes/submit/+page.svelte` | game search | Was already converted pre-batch |
| `src/routes/profile/create/+page.svelte` | country location, country representing | Removed `locationOpen`/`representingOpen` state, `setTimeout` blur handlers. Replaced `.typeahead__*` CSS with `.country-combobox-wrap`/`.combobox-clear`/`.combobox-empty`. |
| `src/routes/profile/edit/+page.svelte` | country location, country representing, goal game search | Same country pattern. Goal game uses `inputValue`/`onInputValueChange` (not `bind:inputValue`) because text is managed per-goal via `goalSearchText[]` array. Removed `goalDropdownOpen[]` state and `handleGoalSearchBlur`. |

**Pattern used:** `Combobox.Root` with `bind:inputValue` for search text, `onValueChange` for selection. Clear button positioned absolutely over input via `.combobox-clear`. Items use `value` (code/id) + `label` (display text).

### Remaining (complex files — each has multiple typeaheads with unique patterns):

| File | Typeaheads | Complexity |
|-|-|-|
| `src/routes/profile/submissions/run/[id]/+page.svelte` | typeahead | Medium |
| `src/routes/games/[game_id]/submit/+page.svelte` | platform, character, difficulty, glitch | Complex (4 typeaheads) |
| `src/routes/games/[game_id]/rules/+page.svelte` | category, character, difficulty, challenge, restriction, glitch | Complex (6 typeaheads, includes add-to-list) |
| `src/routes/games/[game_id]/runs/[tier]/[category]/+page.svelte` | filter typeahead | Medium |
| `src/routes/admin/runs/+page.svelte` | typeahead | Medium |

---

## Batch 24 — Missed Button Conversions: Done

Re-audit of ~15 candidate files found only 5 convertible buttons across 4 files. The other 11 files (game editor tabs, rule-suggestions, staff-guides, sign-in, messages/thread) had *only* special-purpose classes (`btn--save`, `btn--reset`, `btn--add`, `btn--approve`, `btn--reject`, `btn--noted`, `btn--discord`, `btn--twitch`, `class:btn--active`) which are excluded per Rule 6.

| File | Button | Conversion |
|-|-|-|
| `admin/game-editor/[game_id]/GeneralTab.svelte` | Upload original (crop dialog) | `Button.Root` (default) |
| `admin/contributions/+page.svelte` | Search runners | `Button.Root` (default) |
| `admin/contributions/+page.svelte` | Back to search | `Button.Root size="sm"` |
| `admin/health/+page.svelte` | Refresh | `Button.Root size="sm"` |
| `messages/new/+page.svelte` | Send message | `Button.Root variant="accent"` (`btn--primary` is a legacy alias for `btn--accent`) |

---

## Batch 15 — Orphaned CSS Cleanup: Done

Removed CSS rules targeting native `<select>` that no longer exist after Select migration:

| File | Rule removed |
|-|-|
| `admin/runs/+page.svelte` | `.filters__controls select` |
| `admin/game-updates/+page.svelte` | `.filters__controls select` |
| `admin/rule-suggestions/+page.svelte` | `.filter-select` |
| `admin/profiles/+page.svelte` | `.filter-select` from comma-separated selectors |
| `news/+page.svelte` | `.filter-select` from comma-separated selectors (incl. media query) |
| `admin/game-editor/+page.svelte` | `.select` block |
| `_forms.scss` | `.select`, `.select:hover`, `.results-controls .select` |

---

## Batch 16 — Slider: Done

Converted 7 `<input type="range">` → `Slider.Root` across 5 files:

| File | Slider | Notes |
|-|-|-|
| `admin/game-editor/[game_id]/GeneralTab.svelte` | Crop zoom | `handleCropZoom` refactored: `(e: Event)` → `(vals: number[])` |
| `admin/games/[id]/review/+page.svelte` | Crop zoom | Same handler refactor |
| `submit-game/+page.svelte` | Crop zoom | Same handler refactor |
| `profile/theme/+page.svelte` | BG opacity | `onValueChange` with array unwrap |
| `profile/edit/+page.svelte` | Avatar zoom, banner opacity, container opacity | 3 sliders, all `onValueChange` |

**Key pattern:** Slider uses `value: number[]`, so single values need `value={[val]}` and `onValueChange={(v: number[]) => { val = v[0]; }}`.

**CSS:** Updated class selectors to `:global(.[class].ui-slider)`. Also updated `_game-editor.scss` shared partial.

---

## Batch 17 — Meter: Done

Converted 3 progress bars → `Meter.Root` across 2 files:

| File | Bars | Notes |
|-|-|-|
| `runners/[runner_id]/+page.svelte` | Goal progress | Removed `pct` const + `.progress-bar`/`.progress-bar__fill` CSS |
| `games/[game_id]/+page.svelte` | Completed + in-progress achievement bars | Removed `percent` const; green override via `:global(.progress-bar--full [data-meter-indicator])` |

---

## Batch 18 — Remaining UI Conversions: Done

6 component conversions across 6 files:

| File | From | To |
|-|-|-|
| `search/+page.svelte` | 5 `.filter` buttons | `ToggleGroup.Root` / `ToggleGroup.Item` |
| `admin/news/+page.svelte` | 2 `.image-tab` buttons | `ToggleGroup.Root` / `ToggleGroup.Item` |
| `profile/edit/+page.svelte` | `edit-tab` nav + 5 `{#if activeTab}` blocks | `Tabs.Root` / `Tabs.List` / `Tabs.Trigger` / `Tabs.Content` (variant `edit`) |
| `admin/site-settings/+page.svelte` | 3 manual accordion sections (Set + toggleSection) | 3 `Collapsible.Root` / `Collapsible.Trigger` / `Collapsible.Content` |
| `admin/profiles/+page.svelte` | Expandable profile cards (`expandedId`) | `Collapsible.Root` with `onOpenChange` for one-at-a-time |
| `admin/users/+page.svelte` | Expandable user cards (`expandedId` + `toggleUser`) | Same Collapsible pattern, reuses `toggleUser()` for side-effect reset |

**CSS:** All converted components use `:global()` selectors to reach child component elements. `data-state="active"` / `data-state="open"` attributes are used for active/open styling.

---

## Batch 19 — Import Path Standardization: Done

38 files changed: `$components/ui/` → `$lib/components/ui/` globally. Both aliases resolve to the same path, but the codebase now uses a single consistent convention.

Non-UI `$components/` imports (AuthGuard, Header, Footer, etc.) left as-is — different convention.

---

## Batch 20 — Glossary Tooltips Wired: Done

The tooltip system was fully built (DB table, admin CRUD page, CSS, markdown processor) but never connected. Three files wire it up:

| File | Change |
|-|-|
| `src/lib/utils/markdown.ts` | Module-level `_glossaryTerms` cache. `setGlossaryTerms()` populates it. `renderMarkdown()` now auto-uses cached terms when no explicit terms passed. Pipeline: manual `{{tooltip:slug}}` → marked → sanitize → auto-match. |
| `src/routes/+layout.server.ts` | Loads all `glossary_terms` from Supabase via `getGlossaryTerms()` on every request. |
| `src/routes/+layout.svelte` | Hydrates cache with eager `setGlossaryTerms()` call (runs during SSR) + `$effect` (handles client navigations). |

**Auto-match rules:** Whole-word, case-insensitive, longest-match-first, first occurrence per term only, skips `<code>`, `<pre>`, `<a>`, existing tooltip spans, minimum 2-char terms.

All 68 existing `renderMarkdown(content)` call sites get tooltips with zero code changes.

---

## Batch 21 — Tooltip Security: Done

Prevents users from injecting `{{tooltip:slug}}` syntax to create fake tooltips.

**Layer 1 — `checkBannedTerms()` (7 files already covered):**
Added `'{{tooltip:'` and `'{{ tooltip:'` to `MALICIOUS_TERMS` in `banned-terms.ts`. Blocks form submission with a user-visible warning in: profile/create, profile/edit, profile/setup, run submit, game suggest, submit-game, run edit.

**Layer 2 — `stripTooltipSyntax()` (7 additional files):**
Silently removes `{{tooltip:...}}` syntax, preserving the label text. Applied at save points not covered by `checkBannedTerms`: forum drafts (deep strip), forum comments, game suggestions, rule suggestions, messages, submission update details.

**Layer 3 — Worker `sanitizeInput()` (already existed):**
The Worker's `sanitizeInput()` already stripped `{{tooltip:...}}` on all server-side text fields. No changes needed.

---

## Build error fixes applied

| Fix | Files | Notes |
|-|-|-|
| UI wrapper `@ts-nocheck` | 5 wrappers | Discriminated union on `type` prop |
| `onValueChange` type annotations | game-editor, games, runners | `(v)` → `(v: string)` |
| `onOpenChange` type annotations | rule-suggestions + 12 Dialog/AlertDialog files | `(o)` → `(o: boolean)` |
| `messagesContainer` bind:this | MessagePanel, messages/[thread_id] | `$state<HTMLDivElement>()` |
| Duplicate Select import | GeneralTab.svelte | Removed duplicate line |
| TS index error | admin/runs/+page.svelte | Cast to `Record<string, string>` |
| Header closeMenus conflict | Header.svelte | Removed `<svelte:window onclick={closeMenus}>` — fought bits-ui native outside-click |

---

## Zip Deliveries

1. `crc-type-fixes.zip` — initial 42-error fix (UI wrappers + route callbacks)
2. `fix-9-errors.zip` — @ts-nocheck UI wrappers + rule-suggestions fix
3. `fix-last-4-errors.zip` — Select.Root onValueChange type annotations + rule-suggestions onOpenChange
4. `batch-6-7-8-button-migration.zip` — 32 files, all Button conversions
5. `batch-3-select-plus-button-fixes.zip` — 17 files (6 missed buttons + 28 Select conversions)
6. `batch-5-confirm-to-alertdialog.zip` — 1 file (game-editor freeze confirm)
7. `batch-3-4-combined.zip` — 11 files (deferred selects + all checkbox/switch)
8. `GeneralTab.svelte` — duplicate import fix
9. `admin/runs/+page.svelte` — TS index error fix
10. `Header.svelte` — closeMenus conflict fix
11. `batch-9-radiogroup.zip` — 3 files (RadioGroup + ToggleGroup for radios)
12. `batch-11-separator.zip` — 2 files (DraftEditor + Header separators)
13. `batch-10-12-15-slider-meter.zip` — 19 files (ToggleGroup filter-tabs, Pagination, orphaned CSS, Slider, Meter)
14. `ui-migration-batch-18.zip` — 39 files (ToggleGroup search/news, Tabs profile/edit, Collapsible site-settings/profiles/users, import path standardization)
15. `tooltip-complete.zip` — 10 files (glossary auto-match wiring + security: banned-terms, stripTooltipSyntax on all user save points)
16. `batch-22-crop-dialog.zip` — 2 files (crop modals → Dialog.Root in submit-game + GeneralTab)
17. `batch-24-button-conversions.zip` — 4 files (5 remaining standard-variant buttons → Button.Root)
18. `batch-23-combobox-simple.zip` — 2 files (profile/create + profile/edit typeaheads → Combobox)

---

## Rules

1. **Never guess component APIs.** Read the actual `.svelte` file in `src/lib/components/ui/` before using.
2. **Surgical edits.** Only change what's needed. Don't rewrite surrounding code.
3. **Import path:** Always `'$lib/components/ui/{component}/index.js'` (with `.js`). The `$components/ui/` alias was standardized to `$lib/components/ui/` in Batch 19 — do not reintroduce the old path.
4. **Preserve behavior.** If a tab triggers a side effect on click (e.g., loading data), keep that logic — add it to the Root `onValueChange` callback.
5. **Test variants.** `game` variant is most common. `edit` is used in profile editor. `runner` is used in runner profile.
6. **Don't convert navigation tabs.** Route-based `<a href>` tabs stay as-is.
7. **Select.Trigger must render label manually.** Use a lookup object or `.find()` to display the selected option's label text.
8. **Type your callbacks.** All `onValueChange` and `onOpenChange` callbacks need explicit parameter types: `(v: string)`, `(o: boolean)`.
9. **Watch for duplicate imports.** When adding a new UI import, check if the file already imports that component (has caused build failures twice).
10. **bits-ui handles outside-click.** Do NOT add `<svelte:window onclick>` handlers to close Popover/DropdownMenu/Dialog — bits-ui does this natively.
11. **Scoped CSS doesn't reach child components.** When Separator/RadioGroup/ToggleGroup replace native elements, their CSS classes need `:global()` to apply.
12. **RadioGroup vs ToggleGroup:** If the native radio `input` was `display: none` with styled button labels → use ToggleGroup. If the radio dot was visible → use RadioGroup.
13. **Slider uses `number[]`.** Single-value sliders need `value={[val]}` and `onValueChange={(v: number[]) => { val = v[0]; }}`. For handlers that used `(e: Event)` with `e.target.value`, refactor to `(vals: number[])` with `vals[0]`.
14. **Meter replaces progress bars.** `<div class="bar"><div class="fill" style="width: {pct}%"></div></div>` → `<Meter.Root value={current} max={total} class="bar" />`. Remove the inner fill div and its CSS. Override indicator color via `:global(.[class] [data-meter-indicator])`.
15. **ToggleGroup filter-tabs CSS override.** Use `:global(.filter-tabs.ui-toggle-group)` to strip default border/overflow and restore pill-button style. Badge counts render inside `ToggleGroup.Item` children.
16. **Pagination CSS needs `:global()`.** Since `Pagination.Root` is a child component, `.pagination` class selectors must be `:global(.pagination.ui-pagination)`.
17. **Tooltip syntax is admin-only.** Users cannot inject `{{tooltip:slug}}` — it's blocked by `checkBannedTerms`, stripped by `stripTooltipSyntax()`, and sanitized by the Worker. Only admins can create terms via `/admin/tooltips`. Auto-matching handles display automatically.
18. **Collapsible for expandable cards.** When cards use an `expandedId` pattern (one open at a time), use `Collapsible.Root` with `open={expandedId === item.id}` and `onOpenChange` to toggle `expandedId`. CSS for the trigger and body classes needs `:global()` since they're child components.
19. **Combobox replaces typeaheads.** Use `Combobox.Root` with `bind:inputValue` for search text and `onValueChange` for selection. Items need both `value` (internal id/code) and `label` (display text). For array-indexed typeaheads (e.g., goals[i]), use `inputValue`/`onInputValueChange` instead of `bind:inputValue`. Clear button uses `.combobox-clear` positioned absolutely inside `.country-combobox-wrap`. Remove all `*Open` state, `setTimeout` blur handlers, and `.typeahead__*` / `.ta__*` CSS — bits-ui handles open/close natively.

## Audit: Components NOT worth converting

| Component | Why |
|-|-|
| Avatar | 52 patterns, wildly different sizes/contexts. High effort, low payoff. |
| Label | 407 native `<label>` elements. No a11y or behavior gain. |
| DatePicker/DateField | ~10 date inputs. Would change UX to calendar popups — UX decision, not migration. |
| ScrollArea | 34 overflow containers. Just standard CSS — cosmetic scrollbar styling. |
| Toggle | No pressed-state toggle buttons found in codebase. |
| Tooltip (UI component) | Not used as a UI component. Glossary tooltips use CSS-only `_glossary-tip.scss` with auto-match in `renderMarkdown()` (Batch 20). Decorative `title=` attrs stay native. |
| ContextMenu, NavigationMenu, PinInput, RatingGroup, etc. | No matching patterns in codebase. |
