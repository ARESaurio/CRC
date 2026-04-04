// =============================================================================
// Report Store
// =============================================================================
// Shared state for the ReportModal. Any page can open the report modal by
// setting reportOpen to true — the modal lives in Header.svelte and reads
// from this store.

import { writable } from 'svelte/store';

export const reportOpen = writable(false);

export function openReport() {
	reportOpen.set(true);
}
