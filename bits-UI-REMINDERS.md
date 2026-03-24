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

**Variant mapping:** `btn--accent` → `variant="accent"`, `btn--outline` → `variant="outline"`, `btn--ghost` → `variant="ghost"`, `btn--danger` → `variant="danger"`, plain `btn` → no variant (default).

**Size mapping:** `btn--small` → `size="sm"`, `btn--large` → `size="lg"`, `btn--icon` → `size="icon"`.

**Do NOT convert:** Special-purpose buttons like `.game-tab`, `.mobile-toggle`, `.admin-toggle`, `.nav-user__avatar-btn`, `.profile-panel__item` — these have unique layout/styling that doesn't map to Button variants.

---

## Batch Tracker

| # | Component | Files | Status |
|-|-|-|-|
| 1 | Dialog + AlertDialog | 15 files | ✅ Done |
| 2 | Tabs | 6 files (skip games layout — route nav) | ✅ Done |
| 3 | Select | 26 files | ✅ Done |
| 4 | Checkbox + Switch | ~20 files | ⬜ Pending |
| 5 | Remaining inline `confirm()` | ~8 files (29 calls) | ⬜ Pending |
| 6 | Button — admin pages | ~25 files | ⬜ Pending |
| 7 | Button — profile + game pages | ~35 files | ⬜ Pending |
| 8 | Button — shared components | ~14 files | ⬜ Pending |

---

## Rules

1. **Never guess component APIs.** Read the actual `.svelte` file in `src/lib/components/ui/` before using.
2. **Surgical edits.** Only change what's needed. Don't rewrite surrounding code.
3. **Import path:** Always `'$lib/components/ui/{component}/index.js'` (with `.js`).
4. **Preserve behavior.** If a tab triggers a side effect on click (e.g., loading data), keep that logic — add it to the Tabs.Root `onValueChange` callback or keep it inline.
5. **Test variants.** `game` variant is most common. `edit` is used in profile editor. `runner` is used in runner profile.
6. **Don't convert navigation tabs.** Route-based `<a href>` tabs stay as-is.
