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
| Checkbox | `* as Checkbox from 'ui/checkbox'` | Root(`checked`) | Replaces `<input type="checkbox">` |
| Switch | `* as Switch from 'ui/switch'` | Root(`checked`) | Replaces boolean toggle checkboxes |
| Popover | `* as Popover from 'ui/popover'` | Root(`open`), Trigger, Content(`sideOffset`/`align`) | Already used in Header "More" menu |
| Accordion | `* as Accordion from 'ui/accordion'` | Already used in 4 files | |
| Collapsible | `* as Collapsible from 'ui/collapsible'` | Already used in 7 files | |
| Separator | `* as Separator from 'ui/separator'` | Already used in 2 files | |
| Progress | `* as Progress from 'ui/progress'` | Already used in 1 file | |
| DropdownMenu | `* as DropdownMenu from 'ui/dropdown-menu'` | Already used in 1 file | |
| Tooltip | `* as Tooltip from 'ui/tooltip'` | Root, Trigger, Content | Not yet used |
| Pagination | `* as Pagination from 'ui/pagination'` | Not yet used | |

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

### Button (replaces `<button>`)
```svelte
<!-- BEFORE -->
<button class="btn btn--accent" onclick={save} disabled={saving}>Save</button>
<button class="btn btn--danger" onclick={del}>Delete</button>
<button class="btn" onclick={cancel}>Cancel</button>

<!-- AFTER -->
<Button.Root variant="accent" onclick={save} disabled={saving}>Save</Button.Root>
<Button.Root variant="danger" onclick={del}>Delete</Button.Root>
<Button.Root onclick={cancel}>Cancel</Button.Root>
```

**Variant mapping:** `btn--accent` → `variant="accent"`, `btn--primary` → `variant="accent"` (legacy alias), `btn--outline` → `variant="outline"`, `btn--ghost` → `variant="ghost"`, `btn--danger` → `variant="danger"`, plain `btn` → no variant (default).

**Size mapping:** `btn--small`/`btn--sm` → `size="sm"`, `btn--lg` → `size="lg"`, `btn--icon` → `size="icon"`.

**Extra classes:** Pass via `class` prop: `<Button.Root variant="accent" class="mt-2">`.

**Do NOT convert these special-purpose button classes:**
`btn--save`, `btn--reset`, `btn--add`, `btn--approve`, `btn--reject`, `btn--claim`, `btn--changes`, `btn--delete`, `btn--verify`, `btn--unverify`, `btn--freeze`, `btn--unfreeze`, `btn--draft`, `btn--rollback`, `btn--report`, `btn--discord`, `btn--twitch`, `btn--upload`, `btn--xs`, `btn-icon`, `btn-edit-tags`, `btn--filter-toggle`, `btn--danger-text`, `btn--acknowledge`, `btn--reopen`, `btn--noted`, `btn--review-approve`.

Also skip: buttons with `class:` conditional bindings, `<a>` tags styled as buttons, layout buttons (close, nav toggle, cookie consent, mobile-toggle, admin-toggle, nav-user, profile-panel).

---

## Batch Tracker

| # | Component | Status | Details |
|-|-|-|-|
| 1 | Dialog + AlertDialog | ✅ Done | 15 files |
| 2 | Tabs | ✅ Done | 6 files (skip games layout — route nav) |
| 3 | Select | ✅ 28 converted / 20 deferred | See deferred list below |
| 4 | Checkbox + Switch | ⬜ Pending | 34 native checkboxes across 8 files |
| 5 | confirm() | ✅ Done | 1 converted, 1 stays native (beforeNavigate) |
| 6 | Button — admin | ✅ Done | ~15 files |
| 7 | Button — profile + games | ✅ Done | ~20 files |
| 8 | Button — shared components | ✅ Done | ~5 files |

### Batch 3 — Select: Files converted (28 selects)

| File | Selects | Notes |
|-|-|-|
| `ReportModal.svelte` | 1 | Report reason |
| `profile/theme` | 1 | Font family |
| `news/+page` | 3 | Year + month + sort; refactored `handleYearChange` to accept string |
| `admin/financials` | 1 | Year filter |
| `admin/profiles` | 2 | Profile filter + reject reason |
| `admin/runs` | 6 | Game filter, reject, unverify, tier, category, platform |
| `admin/games` | 1 | Reject reason |
| `admin/game-updates` | 1 | Game filter |
| `admin/contributions` | 1 | Contribution type |
| `admin/game-editor/GeneralTab` | 1 | Game status |
| `profile/submissions/run/[id]` | 2 | Tier + category |
| `profile/submissions/update/[id]` | 2 | Section + update type |
| `games/[game_id]/suggest` | 2 | Area + type |
| `games/[game_id]/submit` | 2 | Tier + category |
| `games/[game_id]/rules` | 1 | Restriction child picker |

### Batch 3 — Select: Deferred (20 selects, complex inline handlers)

| File | Count | Why deferred |
|-|-|-|
| `admin/game-editor/CategoriesTab` | 10 | Inline `fixed_loadout.character/challenge/restriction` mutations + `child_select` mode across 3 tiers |
| `admin/game-editor/ChallengesTab` | 2 | Inline `onchange` with array spread reassignment |
| `admin/game-editor/RestrictionsTab` | 1 | `child_select` mode picker |
| `profile/edit` | 3 | Boolean value select, game/run pickers with `HTMLSelectElement` casts |
| `submit-game` | 4 | Complex nested group state with inline mutations |

### Batch 4 — Checkbox + Switch: Pending (34 checkboxes across 8 files)

~24 are **toggle/on-off** patterns (inside `<label class="toggle-row">`) → should become **Switch.Root**.
~10 are **multi-select** patterns (platform/challenge/genre pickers with `includes()`/`toggle*()`) → should become **Checkbox.Root**.

| File | Count | Type |
|-|-|-|
| `submit-game/+page.svelte` | 15 | Mixed (toggles + multi-select) |
| `admin/game-editor/CategoriesTab` | 6 | Toggles (Has Exceptions, Fixed Loadout) |
| `admin/game-editor/ChallengesTab` | 4 | Toggles (game_specific, Has Exceptions) |
| `admin/game-editor/RestrictionsTab` | 2 | Toggles (Has Exceptions) |
| `admin/news/+page.svelte` | 2 | Toggles (featured/published) |
| `forum/init/[section]/DraftEditor` | 2 | Toggles (column enabled) |
| `admin/users/+page.svelte` | 1 | Multi-select (game assignment) |
| `runs/[tier]/[category]` | 1 | Toggle (verified only) |

### Batch 5 — confirm(): Complete

| File | Status | Notes |
|-|-|-|
| `admin/game-editor/+page.svelte` | ✅ Converted | `toggleFreezeAll` → `promptFreezeAll` + `executeFreezeAll` + AlertDialog |
| `profile/edit/+page.svelte:239` | ⛔ Stays native | Inside `beforeNavigate`, `cancel()` requires sync |

### Batch 6/7/8 — Button: Complete

**0 remaining** standard-variant `<button class="btn btn--accent/primary/outline/ghost/danger">`. 170+ `Button.Root` usages across 34 files.

### Build error fixes applied

| Fix | Files | Notes |
|-|-|-|
| UI wrapper `@ts-nocheck` | 5 wrappers (AccordionRoot, CalendarRoot, ComboboxRoot, SelectRoot, ToggleGroupRoot) | Discriminated union on `type` prop can't be satisfied by generic wrapper |
| `onValueChange` type annotations | game-editor, games, runners | `(v)` → `(v: string)` |
| `onOpenChange` type annotations | rule-suggestions + 12 Dialog/AlertDialog files | `(o)` → `(o: boolean)` |
| `messagesContainer` bind:this | MessagePanel, messages/[thread_id] | `$state<HTMLDivElement>()` for reactivity |

---

## Zip Deliveries

1. `crc-type-fixes.zip` — initial 42-error fix (UI wrappers + route callbacks)
2. `fix-9-errors.zip` — @ts-nocheck UI wrappers + rule-suggestions fix
3. `fix-last-4-errors.zip` — Select.Root onValueChange type annotations (3 files) + rule-suggestions onOpenChange
4. `batch-6-7-8-button-migration.zip` — 32 files, all Button conversions
5. `batch-3-select-plus-button-fixes.zip` — 17 files (6 missed buttons + 28 Select conversions)
6. `batch-5-confirm-to-alertdialog.zip` — 1 file (game-editor freeze confirm)

---

## Rules

1. **Never guess component APIs.** Read the actual `.svelte` file in `src/lib/components/ui/` before using.
2. **Surgical edits.** Only change what's needed. Don't rewrite surrounding code.
3. **Import path:** Always `'$lib/components/ui/{component}/index.js'` (with `.js`) or `'$components/ui/{component}/index.js'`.
4. **Preserve behavior.** If a tab triggers a side effect on click (e.g., loading data), keep that logic — add it to the Tabs.Root `onValueChange` callback or keep it inline.
5. **Test variants.** `game` variant is most common. `edit` is used in profile editor. `runner` is used in runner profile.
6. **Don't convert navigation tabs.** Route-based `<a href>` tabs stay as-is.
7. **Select.Trigger must render label manually.** Use a lookup object or `.find()` to display the selected option's label text.
8. **Type your callbacks.** All `onValueChange` and `onOpenChange` callbacks need explicit parameter types: `(v: string)`, `(o: boolean)`.
