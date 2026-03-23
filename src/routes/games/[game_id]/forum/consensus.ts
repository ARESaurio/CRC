/**
 * Discussion System — Consensus Calculation
 *
 * Voting model:
 *   - Section-level vote: endorses an entire draft for that section
 *   - Item-level vote: endorses a specific item (by slug) from a draft, overrides section-level
 *   - Simple majority wins (>50% of votes cast for that scope)
 */

export const SECTIONS = [
	{ id: 'overview', label: 'Overview / Bio', icon: '📝' },
	{ id: 'categories', label: 'Categories', icon: '📂' },
	{ id: 'rules', label: 'Rules', icon: '📜' },
	{ id: 'challenges', label: 'Challenges & Glitches', icon: '⚡' },
	{ id: 'restrictions', label: 'Restrictions', icon: '🔒' },
	{ id: 'characters', label: 'Characters', icon: '🎭' },
	{ id: 'difficulties', label: 'Difficulties', icon: '📊' },
	{ id: 'achievements', label: 'Achievements', icon: '🏅' }
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/** Keys within draft.data that contain arrays of items with slugs */
const SECTION_ITEM_KEYS: Record<SectionId, string[]> = {
	overview: [],   // no items — section-level only (content text)
	categories: ['full_runs', 'mini_challenges', 'player_made'],
	rules: [],  // no items — section-level only
	challenges: ['challenges_data', 'glitches_data'],
	restrictions: ['restrictions_data'],
	characters: ['characters_data'],
	difficulties: ['difficulties_data'],
	achievements: ['community_achievements']
};

export interface ItemConsensus {
	slug: string;
	label: string;
	group: string;        // which array key (e.g. 'full_runs', 'challenges_data')
	parentSlug: string | null;  // null for top-level items, parent's slug for children
	isParent: boolean;     // true if this item has children
	childSlugs: string[];  // slugs of child items (empty for non-parents)
	status: 'agreed' | 'conflict' | 'single';
	winningDraftId: string | null;
	votes: Record<string, number>;  // draft_id → count (effective, after cascade)
	totalVotes: number;
}

export interface SectionConsensus {
	section: SectionId;
	status: 'consensus' | 'conflict' | 'no-drafts' | 'single-draft';
	items: ItemConsensus[];
	sectionVotes: Record<string, number>;  // draft_id → section-level vote count
	totalSectionVotes: number;
	winningDraftId: string | null;
	conflictCount: number;
	agreedCount: number;
}

interface Draft {
	id: string;
	section: string;
	data: any;
	user_id: string;
	[key: string]: any;
}

interface Vote {
	draft_id: string;
	section: string;
	scope: string;
	item_slug: string | null;
	user_id: string;
}

export interface ExtractedItem {
	slug: string;
	label: string;
	group: string;
	data: any;
	parentSlug: string | null;
	isParent: boolean;
	childSlugs: string[];
}

/**
 * Extract all items (with slugs) from a draft's data for a given section.
 * Tracks parent-child relationships for mini_challenges groups with children.
 */
export function extractItems(data: any, section: SectionId): ExtractedItem[] {
	const keys = SECTION_ITEM_KEYS[section];
	const items: ExtractedItem[] = [];

	for (const key of keys) {
		const arr = data?.[key];
		if (!Array.isArray(arr)) continue;
		for (const item of arr) {
			if (!item?.slug) continue;

			const hasChildren = Array.isArray(item.children) && item.children.length > 0;
			const childSlugs = hasChildren
				? item.children.filter((c: any) => c?.slug).map((c: any) => c.slug)
				: [];

			// Add the parent/item itself
			items.push({
				slug: item.slug,
				label: item.label || item.slug,
				group: key,
				data: item,
				parentSlug: null,
				isParent: hasChildren,
				childSlugs
			});

			// Add children
			if (hasChildren) {
				for (const child of item.children) {
					if (child?.slug) {
						items.push({
							slug: child.slug,
							label: child.label || child.slug,
							group: key,
							data: child,
							parentSlug: item.slug,
							isParent: false,
							childSlugs: []
						});
					}
				}
			}
		}
	}

	return items;
}

/**
 * Calculate consensus for a single section.
 */
export function calculateSectionConsensus(
	section: SectionId,
	drafts: Draft[],
	votes: Vote[]
): SectionConsensus {
	const sectionDrafts = drafts.filter(d => d.section === section);
	const sectionVotes = votes.filter(v => v.section === section);

	if (sectionDrafts.length === 0) {
		return { section, status: 'no-drafts', items: [], sectionVotes: {}, totalSectionVotes: 0, winningDraftId: null, conflictCount: 0, agreedCount: 0 };
	}

	if (sectionDrafts.length === 1) {
		const draft = sectionDrafts[0];
		const items = extractItems(draft.data, section).map(item => ({
			slug: item.slug,
			label: item.label,
			group: item.group,
			parentSlug: item.parentSlug,
			isParent: item.isParent,
			childSlugs: item.childSlugs,
			status: 'single' as const,
			winningDraftId: draft.id,
			votes: { [draft.id]: 1 },
			totalVotes: 1
		}));
		return {
			section,
			status: 'single-draft',
			items,
			sectionVotes: { [draft.id]: sectionVotes.filter(v => v.scope === 'section').length },
			totalSectionVotes: sectionVotes.filter(v => v.scope === 'section').length,
			winningDraftId: draft.id,
			conflictCount: 0,
			agreedCount: items.length
		};
	}

	// ── Multiple drafts: calculate per-item consensus ──────────────────

	// Section-level votes
	const sectionLevelVotes: Record<string, number> = {};
	for (const v of sectionVotes.filter(v => v.scope === 'section')) {
		sectionLevelVotes[v.draft_id] = (sectionLevelVotes[v.draft_id] || 0) + 1;
	}
	const totalSectionVotes = Object.values(sectionLevelVotes).reduce((a, b) => a + b, 0);

	// Item-level votes grouped by slug
	const itemLevelVotes: Record<string, Record<string, number>> = {};
	for (const v of sectionVotes.filter(v => v.scope === 'item' && v.item_slug)) {
		if (!itemLevelVotes[v.item_slug!]) itemLevelVotes[v.item_slug!] = {};
		itemLevelVotes[v.item_slug!][v.draft_id] = (itemLevelVotes[v.item_slug!][v.draft_id] || 0) + 1;
	}

	// Collect all unique items with parent-child info across all drafts
	const allItemsMap = new Map<string, { label: string; group: string; parentSlug: string | null; isParent: boolean; childSlugs: string[] }>();
	for (const draft of sectionDrafts) {
		for (const item of extractItems(draft.data, section)) {
			if (!allItemsMap.has(item.slug)) {
				allItemsMap.set(item.slug, {
					label: item.label,
					group: item.group,
					parentSlug: item.parentSlug,
					isParent: item.isParent,
					childSlugs: item.childSlugs
				});
			} else {
				// Merge child slugs from multiple drafts
				const existing = allItemsMap.get(item.slug)!;
				if (item.isParent) {
					existing.isParent = true;
					for (const cs of item.childSlugs) {
						if (!existing.childSlugs.includes(cs)) existing.childSlugs.push(cs);
					}
				}
			}
		}
	}

	// For section-level-only sections (no items), consensus is purely section-level
	if (section === 'rules' || section === 'overview') {
		const winner = getWinner(sectionLevelVotes, totalSectionVotes);
		return {
			section,
			status: winner ? 'consensus' : 'conflict',
			items: [],
			sectionVotes: sectionLevelVotes,
			totalSectionVotes,
			winningDraftId: winner,
			conflictCount: winner ? 0 : 1,
			agreedCount: winner ? 1 : 0
		};
	}

	// Calculate per-item consensus with parent-child cascading:
	// Child: child votes → parent votes → section votes
	// Parent: parent votes → section votes
	const items: ItemConsensus[] = [];
	let conflictCount = 0;
	let agreedCount = 0;

	for (const [slug, meta] of allItemsMap) {
		let votesForItem: Record<string, number>;

		if (meta.parentSlug) {
			// CHILD: check child votes → parent votes → section votes
			if (itemLevelVotes[slug] && Object.keys(itemLevelVotes[slug]).length > 0) {
				votesForItem = itemLevelVotes[slug];
			} else if (itemLevelVotes[meta.parentSlug] && Object.keys(itemLevelVotes[meta.parentSlug]).length > 0) {
				votesForItem = itemLevelVotes[meta.parentSlug];
			} else {
				votesForItem = sectionLevelVotes;
			}
		} else {
			// TOP-LEVEL or PARENT: item votes → section votes
			votesForItem = itemLevelVotes[slug] || sectionLevelVotes;
		}

		const totalForItem = Object.values(votesForItem).reduce((a, b) => a + b, 0);
		const winner = getWinner(votesForItem, totalForItem);

		if (winner) {
			agreedCount++;
		} else if (totalForItem > 0) {
			conflictCount++;
		}

		items.push({
			slug,
			label: meta.label,
			group: meta.group,
			parentSlug: meta.parentSlug,
			isParent: meta.isParent,
			childSlugs: meta.childSlugs,
			status: winner ? 'agreed' : (totalForItem > 0 ? 'conflict' : 'agreed'),
			winningDraftId: winner,
			votes: votesForItem,
			totalVotes: totalForItem
		});
	}

	// Overall section winner: only if ALL items agree on the same draft
	const allSameDraft = items.length > 0 && items.every(i => i.winningDraftId === items[0].winningDraftId && i.winningDraftId !== null);

	return {
		section,
		status: conflictCount === 0 ? 'consensus' : 'conflict',
		items,
		sectionVotes: sectionLevelVotes,
		totalSectionVotes,
		winningDraftId: allSameDraft ? items[0].winningDraftId : null,
		conflictCount,
		agreedCount
	};
}

/**
 * Simple majority: returns the draft_id with >50% of votes, or null if no majority.
 */
function getWinner(votes: Record<string, number>, total: number): string | null {
	if (total === 0) return null;
	for (const [draftId, count] of Object.entries(votes)) {
		if (count > total / 2) return draftId;
	}
	return null;
}

/**
 * Calculate consensus across all sections.
 */
export function calculateAllConsensus(drafts: Draft[], votes: Vote[]): Record<SectionId, SectionConsensus> {
	const result: Partial<Record<SectionId, SectionConsensus>> = {};
	for (const s of SECTIONS) {
		result[s.id] = calculateSectionConsensus(s.id, drafts, votes);
	}
	return result as Record<SectionId, SectionConsensus>;
}

/**
 * Get a human-readable label for a group key.
 */
export function groupLabel(group: string): string {
	const labels: Record<string, string> = {
		full_runs: 'Full Runs',
		mini_challenges: 'Mini Challenges',
		player_made: 'Player-Made',
		challenges_data: 'Challenges',
		glitches_data: 'Glitches',
		restrictions_data: 'Restrictions',
		characters_data: 'Characters',
		difficulties_data: 'Difficulties',
		community_achievements: 'Achievements'
	};
	return labels[group] || group;
}
