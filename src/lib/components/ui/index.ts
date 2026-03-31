// ============================================================
// CRC UI Component Library (bits-ui wrappers)
// ============================================================
// Each component is a thin wrapper around bits-ui primitives
// styled with the project's CSS custom properties.
//
// Usage:
//   import * as Dialog from '$lib/components/ui/dialog/index.js';
//   import * as Select from '$lib/components/ui/select/index.js';
//   import * as Tooltip from '$lib/components/ui/tooltip/index.js';
//
// All components follow the same pattern:
//   <Component.Root>
//     <Component.Trigger>...</Component.Trigger>
//     <Component.Content>...</Component.Content>
//   </Component.Root>
// ============================================================

// NOTE: Import individual component sets directly from their
// index.js files rather than from this barrel to enable
// tree-shaking. This file exists as documentation.

export const UI_COMPONENTS = [
	'accordion',
	'alert-dialog',
	'aspect-ratio',
	'avatar',
	'button',
	'calendar',
	'checkbox',
	'collapsible',
	'combobox',
	'command',
	'context-menu',
	'date-field',
	'date-picker',
	'date-range-field',
	'date-range-picker',
	'dialog',
	'dropdown-menu',
	'label',
	'link-preview',
	'menubar',
	'meter',
	'navigation-menu',
	'pagination',
	'pin-input',
	'popover',
	'progress',
	'radio-group',
	'range-calendar',
	'rating-group',
	'scroll-area',
	'select',
	'separator',
	'sheet',
	'slider',
	'switch',
	'tabs',
	'time-field',
	'time-range-field',
	'toggle',
	'toggle-group',
	'toolbar',
	'tooltip',
] as const;
