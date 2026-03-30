# bits-UI Component Migration — REMINDERS

**Status:** Migration ~99% complete (30 of 30 original batches done)
**Last updated:** March 30, 2026

---

## Available UI Components

Located at `src/lib/components/ui/`. All wrap [bits-ui](https://bits-ui.com) primitives with project styling.

| Component | Import | Key Props |
|-|-|-|
| Button | `* as Button from 'ui/button'` | `variant`: default/accent/outline/ghost/danger · `size`: default/sm/lg/icon |
| Dialog | `* as Dialog from 'ui/dialog'` | Root(`open`), Overlay, Content, Header, Title, Description, Close, Footer |
| AlertDialog | `* as AlertDialog from 'ui/alert-dialog'` | Root(`open`), Overlay, Content, Title, Description, Action, Cancel |
| Tabs | `* as Tabs from 'ui/tabs'` | Root(`value`), List(`variant`/`flush`), Trigger(`value`/`variant`), Content(`value`) |
| Select | `* as Select from 'ui/select'` | Root(`value`), Trigger, Content, Item(`value`/`label`) |
| Checkbox | `* as Checkbox from 'ui/checkbox'` | Root(`checked`) |
| Switch | `* as Switch from 'ui/switch'` | Root(`checked`) |
| RadioGroup | `* as RadioGroup from 'ui/radio-group'` | Root(`value`), Item(`value`) |
| ToggleGroup | `* as ToggleGroup from 'ui/toggle-group'` | Root(`value`, `type`), Item(`value`) |
| Popover | `* as Popover from 'ui/popover'` | Root(`open`), Trigger, Content(`sideOffset`/`align`) |
| DropdownMenu | `* as DropdownMenu from 'ui/dropdown-menu'` | Root(`open`), Trigger, Content, Item |
| Combobox | `* as Combobox from 'ui/combobox'` | Root, Input, Content, Item |
| Accordion | `* as Accordion from 'ui/accordion'` | Already used in 4 files |
| Collapsible | `* as Collapsible from 'ui/collapsible'` | Root(`open`), Trigger, Content |
| Separator | `* as Separator from 'ui/separator'` | Root(`class`, `orientation`) |
| Progress | `* as Progress from 'ui/progress'` | Root(`value`, `max`) |
| Pagination | `* as Pagination from 'ui/pagination'` | Root(`page`, `count`, `perPage`), PrevButton, NextButton, Page |
| Slider | `* as Slider from 'ui/slider'` | Root(`value`, `min`, `max`, `step`, `onValueChange`) — `value` is `number[]` |
| Meter | `* as Meter from 'ui/meter'` | Root(`value`, `max`) |

---

## Pending Work

### Original Batches — COMPLETE ✅

All 30 original migration batches are done. The items previously listed here have been verified:

- ~~**Batch 30 — ProposalEditor Modal → Dialog**~~ — Already uses `Dialog.Root`.
- ~~**`admin/games/+page.svelte` Collapsible**~~ — Already uses `Collapsible.Root` with correct `onOpenChange`.
- ~~**`submit-game/+page.svelte` ToggleGroup**~~ — Already uses `ToggleGroup` for simple/advanced + `Tabs.Root` for tab nav.
- **Remaining emoji in `Button.Root`** — `↻`, `✕`, `←` in admin buttons. Low priority — these are Unicode symbols, not colorful emoji. Leaving as-is.

### Consistency Audit (March 30, 2026)

Full codebase scan found 5 remaining inconsistencies where manual implementations should use bits-ui components:

#### Priority 1 — Consistency (same pattern implemented two different ways)

**1. `src/lib/components/AchievementCard.svelte` — Progress → Meter**
Uses `Progress.Root` for achievement progress bars, but `games/[game_id]/+page.svelte` and `runners/[runner_id]/+page.svelte` already use `Meter.Root` for the same visual pattern. Should standardize on Meter.
- Change: Replace `Progress.Root` import/usage with `Meter.Root`
- Effort: Small (single file, ~3 lines)

**2. `src/lib/components/StatusFilterTabs.svelte` — Manual pagination → Pagination**
Has fully manual pagination (prev/next buttons, page number buttons, page size selector with `pagination__btn`, `pagination__size-btn` classes). The admin `users/+page.svelte` uses `Pagination.Root` for the same purpose. This component is used in 3 admin pages:
- `admin/runs/+page.svelte`
- `admin/games/+page.svelte`
- `admin/profiles/+page.svelte`
- Change: Refactor `StatusFilterTabs` to use `Pagination.Root` internally. All 3 consumers benefit automatically.
- Effort: Medium (pagination logic + page size selector to preserve)

**3. `src/routes/profile/edit/+page.svelte` — opt-btn → ToggleGroup**
Has 3 sets of `opt-btn` / `opt-btn--active` segmented buttons for banner customization:
- Banner mode: "Above" / "Background"
- Banner size: "Cover" / "Fill"
- Banner position: "Top" / "Center" / "Bottom" / "Custom"
These are the exact ToggleGroup pattern. No ToggleGroup import in this file currently.
- Change: Replace each `opt-btn` group with `ToggleGroup.Root` + `ToggleGroup.Item`
- Effort: Small (3 groups, ~15 lines each, straightforward swap)

#### Priority 2 — Manual implementations with bits-ui equivalents

**4. `src/routes/admin/news/+page.svelte` — Manual tag typeahead → Combobox**
Has a manual tag input with custom `tagInput` state, `tagSuggestions` derived, keyboard handlers (`Enter`/`Backspace`), and a custom `.tag-input-wrapper` dropdown. The multi-select Combobox chip pattern is already used in `submit/+page.svelte` and `admin/runs/+page.svelte` for the same kind of interaction.
- Change: Replace manual tag input with `Combobox.Root` multi-select pattern
- Effort: Medium (keyboard handling and chip display to rewire)

**5. `src/routes/admin/users/+page.svelte` — Collapsible onOpenChange pattern**
Uses `onOpenChange={() => toggleUser(id)}` which causes a double-click bug (feedback loop: click → state changes → `open` prop updates → `onOpenChange` fires again → toggles back). Other admin pages (`runs`, `games`) use the correct pattern: `onOpenChange={(o: boolean) => { expandedId = o ? id : null; }}`.
- Change: Replace toggle callback with boolean-based pattern
- Effort: Tiny (1 line)
- **NOTE:** This was fixed in the March 30 update to the users page but should be verified in the repo.

---

## Verified — No Conversion Needed

These patterns were checked during the March 30 audit and are correct as-is:

| Pattern | File(s) | Why it stays |
|-|-|-|
| Route-based `<a href>` tabs | `games/[game_id]/+layout.svelte` | Navigation tabs, not state tabs |
| Chip expand (challenges/restrictions) | `submit/+page.svelte`, `profile/submissions/run/[id]/+page.svelte` | Inline child-chip toggle, not a card collapse |
| Vote buttons (agree/disagree) | `forum/suggestions/[id]/+page.svelte`, `forum/init/[section]/SectionView.svelte` | Server actions, not segmented selection |
| Collapsible as accordion | `admin/site-settings/+page.svelte` | Multi-open is intentional; Collapsible is correct (not Accordion) |
| All admin modals | `runs`, `games`, `profiles`, `reports`, `rule-suggestions`, `financials` | Already use `Dialog.Root` |
| All native `<select>` | None found | Fully converted to `Select.Root` |
| All native `<input type=checkbox>` | None found | Fully converted to `Checkbox.Root` / `Switch.Root` |
| All native `<input type=radio>` | None found | Fully converted to `RadioGroup` / `ToggleGroup` |
| All native `<input type=range>` | None found | Fully converted to `Slider.Root` |
| All `confirm()` calls | None found | Fully converted to `AlertDialog` |
| All `<hr>` elements | None found | Fully converted to `Separator.Root` |

---

## Conversion Patterns

### Tabs
```svelte
<Tabs.Root bind:value={activeTab}>
  <Tabs.List variant="game" flush>
    <Tabs.Trigger variant="game" value="general">General</Tabs.Trigger>
    <Tabs.Trigger variant="game" value="rules">Rules</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="general"><div class="tab-body">...</div></Tabs.Content>
  <Tabs.Content value="rules"><div class="tab-body">...</div></Tabs.Content>
</Tabs.Root>
```
- Set `variant` on BOTH `Tabs.List` and `Tabs.Trigger`
- `flush` prop adds `tabs--flush` (removes margin-bottom)
- Do NOT convert route-based `<a href>` tabs (like game `+layout.svelte`)

### AlertDialog (replaces `confirm()`)
```svelte
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
```
**Exception:** `beforeNavigate` confirm must stay native — `cancel()` requires synchronous execution.

### Select (replaces `<select>`)
```svelte
<Select.Root bind:value={filter}>
  <Select.Trigger>{filter || 'All'}</Select.Trigger>
  <Select.Content>
    <Select.Item value="all" label="All" />
    <Select.Item value="pending" label="Pending" />
  </Select.Content>
</Select.Root>
```
Select.Trigger doesn't auto-display the selected label — render it yourself.

### Checkbox vs Switch
- **Switch** for on/off toggles (enable/disable)
- **Checkbox** for multi-select lists (pick genres, pick platforms)

### RadioGroup vs ToggleGroup
- **RadioGroup** — visible radio dots (standard form radios)
- **ToggleGroup** — segmented buttons where radios were hidden (`input { display: none; }`)

### Slider
```svelte
<Slider.Root value={[opacity]} min={0} max={50} step={1}
  onValueChange={(v: number[]) => { opacity = v[0]; markUnsaved(); }} />
```
Single values need `value={[val]}` and unwrap with `v[0]`.

### Meter (replaces progress bars)
```svelte
<Meter.Root value={current} max={total} class="progress-bar" />
```
Remove inner fill div. Override indicator color via `:global(.[class] [data-meter-indicator])`.

### Combobox (replaces typeaheads)
**Single-select:** Click → shows first 20 items → type to filter → pick fills input → X clears. Use `*FilterText` state (separate from `inputValue`) so clicking shows items immediately.

**Multi-select with chips:** Click → shows 20 items (excluding selected) → pick adds chip + clears input → chip X removes. `onValueChange` appends to array/Map and clears `inputValue`.

Remove all `*Open` state, `setTimeout` blur handlers, and `.ta__*` CSS — bits-ui handles open/close natively.

### Collapsible (expandable cards)
For one-open-at-a-time cards: `Collapsible.Root` with `open={expandedId === item.id}` and `onOpenChange` to toggle `expandedId`. CSS needs `:global()`.

**Correct `onOpenChange` pattern** (prevents double-click bug):
```svelte
<!-- ✅ CORRECT — uses the boolean value -->
<Collapsible.Root
  open={expandedId === item.id}
  onOpenChange={(o: boolean) => { expandedId = o ? item.id : null; }}
>

<!-- ❌ WRONG — creates feedback loop -->
<Collapsible.Root
  open={expandedId === item.id}
  onOpenChange={() => toggleExpand(item.id)}
>
```

---

## Rules

1. **Never guess component APIs.** Read the actual `.svelte` file in `src/lib/components/ui/` before using.
2. **Surgical edits.** Only change what's needed. Don't rewrite surrounding code.
3. **Import path:** Always `'$lib/components/ui/{component}/index.js'` (with `.js`). Do not use the old `$components/ui/` alias.
4. **Preserve behavior.** If a tab triggers a side effect on click, keep it in `onValueChange`.
5. **Tab variants:** `game` (most common), `edit` (profile editor), `runner` (runner profile).
6. **Don't convert navigation tabs.** Route-based `<a href>` tabs stay as-is.
7. **Select.Trigger must render label manually.** Use a lookup or `.find()`.
8. **Type your callbacks.** `onValueChange`: `(v: string)`, `onOpenChange`: `(o: boolean)`.
9. **Watch for duplicate imports.** Check if the file already imports that component.
10. **bits-ui handles outside-click.** Do NOT add `<svelte:window onclick>` handlers.
11. **Scoped CSS doesn't reach child components.** Use `:global()` for Separator/RadioGroup/ToggleGroup.
12. **Tooltip syntax is admin-only.** Users can't inject `{{tooltip:slug}}` — blocked by `checkBannedTerms`, stripped by `stripTooltipSyntax()`, sanitized by Worker.

---

## Components NOT Worth Converting

| Component | Why |
|-|-|
| Avatar | 52 patterns, wildly different sizes/contexts. High effort, low payoff. |
| Label | 407 native `<label>` elements. No a11y or behavior gain. |
| DatePicker/DateField | ~10 date inputs. Would change UX — decision, not migration. |
| ScrollArea | 34 overflow containers. Just cosmetic scrollbar styling. |
| Tooltip (UI component) | Glossary tooltips use CSS-only `_glossary-tip.scss` with auto-match in `renderMarkdown()`. |
| Toggle, ContextMenu, NavigationMenu, PinInput, RatingGroup | No matching patterns in codebase. |

---

## Special-Purpose Button Classes (DO NOT convert)

These use custom styling beyond what `Button.Root` variants cover:

`btn--save`, `btn--reset`, `btn--add`, `btn--approve`, `btn--reject`, `btn--claim`, `btn--changes`, `btn--delete`, `btn--verify`, `btn--unverify`, `btn--freeze`, `btn--unfreeze`, `btn--draft`, `btn--rollback`, `btn--report`, `btn--discord`, `btn--twitch`, `btn--upload`, `btn--xs`, `btn-icon`, `btn-edit-tags`, `btn--filter-toggle`, `btn--danger-text`, `btn--acknowledge`, `btn--reopen`, `btn--noted`, `btn--review-approve`.

Also skip: buttons with `class:` conditional bindings, `<a>` tags styled as buttons, layout buttons (close, nav toggle, cookie consent, mobile-toggle, admin-toggle, nav-user, profile-panel).