<script lang="ts">
	import { Bell, Construction, Lock, ClipboardList, FileText, CheckCircle, XCircle, Zap, ThumbsUp, ThumbsDown, AlertTriangle, Pencil, ArrowRight, ChevronRight, Send, ScrollText, Shield, Rocket, Users, Check } from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { getAccessToken } from '$lib/admin';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { SECTIONS, groupLabel, type SectionId } from './consensus';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { stripTooltipSyntax, stripTooltipSyntaxDeep } from '$lib/utils/markdown';
	import ProposalEditor from './ProposalEditor.svelte';

	let {
		game,
		roughDraft,
		proposals: initialProposals,
		proposalVotes: initialVotes,
		volunteers: initialVolunteers,
		draftHistory,
		userId,
		isAdmin,
	}: {
		game: any;
		roughDraft: any;
		proposals: any[];
		proposalVotes: any[];
		volunteers: any[];
		draftHistory: any[];
		userId: string | null;
		isAdmin: boolean;
	} = $props();

	let proposals = $state(initialProposals);
	let volunteers = $state(initialVolunteers);
	$effect(() => { proposals = initialProposals; volunteers = initialVolunteers; });
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 4000);
	}

	// ── Confirm dialog ────────────────────────────────────────────────────
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

	// ── Eligibility check ────────────────────────────────────────────────
	let eligible = $state<boolean | null>(null);
	let eligibilityReason = $state('');

	$effect(() => {
		const u = $user;
		if (u && game?.game_id) {
			checkEligibility();
		} else {
			eligible = null;
		}
	});

	async function checkEligibility() {
		if (!$user) return;
		try {
			const token = await getAccessToken();
			if (!token) { eligible = false; return; }
			const res = await fetch(`${PUBLIC_WORKER_URL}/game-init/check-eligibility`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ game_id: game.game_id }),
			});
			const data = await res.json();
			eligible = data.eligible ?? false;
			eligibilityReason = data.reason || '';
		} catch { eligible = false; }
	}

	// ── Derived state ────────────────────────────────────────────────────
	const dd = $derived(roughDraft?.draft_data || {});
	const version = $derived(roughDraft?.version || 1);
	const approvalRequested = $derived(roughDraft?.approval_requested || false);
	const openProposals = $derived(proposals.filter((p: any) => p.status === 'open'));
	const acceptedProposals = $derived(proposals.filter((p: any) => p.status === 'accepted'));
	const hasMod = $derived(volunteers.some((v: any) => v.role === 'moderator'));
	const hasVerifier = $derived(volunteers.some((v: any) => v.role === 'verifier'));
	const userVolunteeredMod = $derived(!!$user && volunteers.some((v: any) => v.user_id === $user?.id && v.role === 'moderator'));
	const userVolunteeredVerifier = $derived(!!$user && volunteers.some((v: any) => v.user_id === $user?.id && v.role === 'verifier'));

	// ── Proposal form state ──────────────────────────────────────────────
	let showProposalForm = $state(false);
	let propSection = $state<SectionId>('rules');
	let propSubmitting = $state(false);

	function openProposalForm(section: SectionId) {
		propSection = section;
		showProposalForm = true;
	}

	// ── History diff state ────────────────────────────────────────────────
	let showHistoryDiff = $state(false);
	let diffEntry = $state<any>(null);

	// ═════════════════════════════════════════════════════════════════════
	// API CALLS
	// ═════════════════════════════════════════════════════════════════════

	async function workerCall(endpoint: string, payload: any): Promise<any> {
		const token = await getAccessToken();
		if (!token) throw new Error('Not authenticated');
		const res = await fetch(`${PUBLIC_WORKER_URL}${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify(payload),
		});
		const data = await res.json();
		if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
		return data;
	}

	async function submitProposal(proposedData: any, propTitle: string, propNotes: string) {
		if (!$user || !propTitle.trim()) return;
		propSubmitting = true;
		try {
			const cleanData = stripTooltipSyntaxDeep(proposedData);
			const result = await workerCall('/game-init/propose', {
				game_id: game.game_id,
				section: propSection,
				proposed_data: cleanData,
				title: stripTooltipSyntax(propTitle.trim()).slice(0, 200),
				notes: propNotes.trim() ? stripTooltipSyntax(propNotes.trim()).slice(0, 2000) : null,
			});
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id, avatar_url').eq('user_id', $user.id).maybeSingle();
			proposals = [{
				...result.proposal,
				...(profile || { display_name: 'You', runner_id: null, avatar_url: null }),
				accept_count: 1, reject_count: 0,
			}, ...proposals];
			showProposalForm = false;
			showToast('success', 'Proposal submitted!');
		} catch (err: any) {
			showToast('error', err.message);
		}
		propSubmitting = false;
	}

	async function voteOnProposal(proposalId: string, vote: 'accept' | 'reject') {
		try {
			const result = await workerCall('/game-init/vote', {
				game_id: game.game_id,
				proposal_id: proposalId,
				vote,
			});
			if (result.merged) {
				showToast('success', 'Proposal accepted and merged into the rough draft! Refresh to see changes.');
				// Reload after merge
				setTimeout(() => window.location.reload(), 1500);
			} else {
				// Update local vote counts
				proposals = proposals.map((p: any) => {
					if (p.id === proposalId) {
						return { ...p, accept_count: result.accept_count, reject_count: result.reject_count };
					}
					return p;
				});
				showToast('success', result.action === 'removed' ? 'Vote removed' : `Voted ${vote}`);
			}
		} catch (err: any) {
			showToast('error', err.message);
		}
	}

	async function withdrawProposal(proposalId: string) {
		openConfirm('Withdraw Proposal', 'Withdraw this proposal? This cannot be undone.', async () => {
			try {
				await workerCall('/game-init/withdraw-proposal', { proposal_id: proposalId });
				proposals = proposals.filter((p: any) => p.id !== proposalId);
				showToast('success', 'Proposal withdrawn.');
			} catch (err: any) { showToast('error', err.message); }
		});
	}

	async function volunteer(role: 'moderator' | 'verifier') {
		try {
			await workerCall('/game-init/volunteer', { game_id: game.game_id, role });
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id').eq('user_id', $user!.id).maybeSingle();
			volunteers = [...volunteers, { game_id: game.game_id, user_id: $user!.id, role, ...(profile || { display_name: 'You', runner_id: null }) }];
			showToast('success', `Volunteered as ${role === 'moderator' ? 'Game Moderator' : 'Game Verifier'}!`);
		} catch (err: any) { showToast('error', err.message); }
	}

	async function unvolunteer(role: 'moderator' | 'verifier') {
		try {
			await workerCall('/game-init/unvolunteer', { game_id: game.game_id, role });
			volunteers = volunteers.filter((v: any) => !(v.user_id === $user?.id && v.role === role));
			showToast('success', 'Volunteer signup removed.');
		} catch (err: any) { showToast('error', err.message); }
	}

	async function requestApproval() {
		openConfirm('Request Approval', 'Submit this game for final admin approval? Make sure the rules are complete.', async () => {
			try {
				await workerCall('/game-init/request-approval', { game_id: game.game_id });
				showToast('success', 'Approval requested! An admin will review the game.');
				// Update local state
				if (roughDraft) roughDraft.approval_requested = true;
			} catch (err: any) { showToast('error', err.message); }
		});
	}

	async function finalize() {
		openConfirm('Finalize Game', 'Apply the rough draft rules to the live game and set status to Active? Volunteers will be assigned their roles.', async () => {
			try {
				await workerCall('/game-init/finalize', { game_id: game.game_id });
				showToast('success', 'Game finalized! Reloading...');
				setTimeout(() => window.location.reload(), 1500);
			} catch (err: any) { showToast('error', err.message); }
		});
	}

	// ── Helpers ───────────────────────────────────────────────────────────
	function sectionLabel(id: string): string {
		return SECTIONS.find(s => s.id === id)?.label || id;
	}
	function sectionIcon(id: string): string {
		return SECTIONS.find(s => s.id === id)?.icon || 'file-text';
	}
	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		if (days < 30) return `${days}d ago`;
		return formatDate(dateStr);
	}
	function renderRules(text: string): string {
		if (!text?.trim()) return '<p class="muted">Empty</p>';
		return renderMarkdown(text);
	}

	/**
	 * Get the "after" section data for a history diff.
	 * Looks for the next history entry (version+1). If this is the latest version,
	 * falls back to the current rough draft data.
	 */
	function getAfterSection(entry: any): any {
		const section = entry.section_changed;
		const nextVersion = entry.version + 1;

		// History is sorted descending by version — find the entry with version = nextVersion
		const nextEntry = draftHistory.find((h: any) => h.version === nextVersion);
		if (nextEntry) {
			return nextEntry.draft_data?.[section] || {};
		}

		// No next history entry means this was the last change before current state
		return dd[section] || {};
	}

	function countItems(sectionData: any): number {
		if (!sectionData) return 0;
		let count = 0;
		for (const val of Object.values(sectionData)) {
			if (Array.isArray(val)) count += val.length;
			else if (typeof val === 'string' && val.trim()) count += 1;
		}
		return count;
	}

	function extractAllItems(sectionData: any): { label: string; slug?: string; description?: string; exceptions?: string; children?: any[]; group?: string; fixed_loadout?: any; difficulty?: string; icon?: string; total_required?: number; requirements?: string[]; child_select?: string }[] {
		if (!sectionData) return [];
		const items: any[] = [];
		for (const [key, val] of Object.entries(sectionData)) {
			if (Array.isArray(val)) {
				for (const item of val) {
					if (item && typeof item === 'object' && item.label) {
						items.push({ ...item, group: key });
					}
				}
			}
		}
		return items;
	}

	/** Group items by their group key, preserving order */
	function groupItems(items: any[]): { group: string; items: any[] }[] {
		const map = new Map<string, any[]>();
		for (const item of items) {
			const g = item.group || '_default';
			if (!map.has(g)) map.set(g, []);
			map.get(g)!.push(item);
		}
		return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
	}

	/** Compute diff between base (rough draft) and proposed items for a section */
	function diffItems(baseData: any, proposedData: any): { item: any; baseItem?: any; status: 'new' | 'removed' | 'updated' | 'unchanged'; changedFields?: string[] }[] {
		const baseItems = extractAllItems(baseData);
		const propItems = extractAllItems(proposedData);
		const baseMap = new Map(baseItems.map(i => [i.slug, i]));
		const propMap = new Map(propItems.map(i => [i.slug, i]));
		const result: any[] = [];

		// Items in proposal
		for (const item of propItems) {
			const base = baseMap.get(item.slug);
			if (!base) {
				result.push({ item, status: 'new' });
			} else {
				const changed = findChangedFields(base, item);
				if (changed.length > 0) {
					result.push({ item, baseItem: base, status: 'updated', changedFields: changed });
				} else {
					result.push({ item, status: 'unchanged' });
				}
			}
		}

		// Items removed (in base but not proposal)
		for (const base of baseItems) {
			if (!propMap.has(base.slug)) {
				result.push({ item: base, status: 'removed' });
			}
		}

		return result;
	}

	/** Compare two items and return names of fields that differ */
	function findChangedFields(base: any, proposed: any): string[] {
		const fields = ['label', 'description', 'exceptions', 'difficulty', 'child_select', 'creator'];
		const changed: string[] = [];
		for (const f of fields) {
			if ((base[f] || '') !== (proposed[f] || '')) changed.push(f);
		}
		// Compare children count/slugs
		const baseChildren = (base.children || []).map((c: any) => c.slug).sort().join(',');
		const propChildren = (proposed.children || []).map((c: any) => c.slug).sort().join(',');
		if (baseChildren !== propChildren) changed.push('children');
		return changed;
	}

	/** Get proposals that update or remove a specific draft item */
	function getItemProposals(slug: string, section: string): { proposal: any; status: 'updated' | 'removed'; before: any; after: any | null; changedFields?: string[] }[] {
		const result: any[] = [];
		const draftItems = extractAllItems(dd[section]);
		const draftItem = draftItems.find((i: any) => i.slug === slug);
		if (!draftItem) return [];

		for (const prop of openProposals.filter((p: any) => p.section === section)) {
			const propItems = extractAllItems(prop.proposed_data);
			const propItem = propItems.find((i: any) => i.slug === slug);

			if (!propItem) {
				result.push({ proposal: prop, status: 'removed', before: draftItem, after: null });
			} else {
				const changed = findChangedFields(draftItem, propItem);
				if (changed.length > 0) {
					result.push({ proposal: prop, status: 'updated', before: draftItem, after: propItem, changedFields: changed });
				}
			}
		}
		return result;
	}

	/** Get items proposed as new additions for a section */
	function getNewItemProposals(section: string): { proposal: any; item: any }[] {
		const draftItems = extractAllItems(dd[section]);
		const draftSlugs = new Set(draftItems.map((i: any) => i.slug));
		const result: any[] = [];

		for (const prop of openProposals.filter((p: any) => p.section === section)) {
			const propItems = extractAllItems(prop.proposed_data);
			for (const item of propItems) {
				if (item.slug && !draftSlugs.has(item.slug)) {
					result.push({ proposal: prop, item });
				}
			}
		}
		return result;
	}

	/** Readable label for a field name */
	function fieldLabel(field: string): string {
		return ({ label: 'Label', description: 'Description', exceptions: 'Exceptions', difficulty: 'Difficulty', child_select: 'Child Selection', creator: 'Creator', children: 'Sub-items' } as Record<string, string>)[field] || field;
	}
</script>

{#if toast}
	<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
{/if}

{#if !roughDraft}
	<div class="cr-empty">
		<p class="muted">No rough draft found. This game may need to be re-approved as Community Review to generate one.</p>
	</div>
{:else}

<!-- ═══ Status Banner ════════════════════════════════════════════════════ -->
<div class="cr-status-banner" class:cr-status-banner--requested={approvalRequested}>
	{#if approvalRequested}
		<span class="cr-status-banner__icon"><Bell size={16} /></span>
		<div class="cr-status-banner__text">
			<strong>Approval requested</strong> — waiting for an admin to finalize this game.
			{#if isAdmin}
				<Button.Root variant="accent" size="sm" onclick={finalize} style="margin-top: 0.5rem;">Finalize Game <ArrowRight size={14} /> Active</Button.Root>
			{/if}
		</div>
	{:else}
		<span class="cr-status-banner__icon"><Construction size={16} /></span>
		<div class="cr-status-banner__text">
			<strong>Community Review</strong> — this game's rules are being built by the community. Propose changes, vote, and help shape the game page.
			<span class="cr-status-banner__version">Rough Draft v{version}</span>
		</div>
	{/if}
</div>

{#if eligible === false && $user}
	<div class="cr-eligibility-notice">
		<span><Lock size={14} /></span> <span>{eligibilityReason || 'You need at least 1 published run for this game to participate.'}</span>
	</div>
{/if}

<!-- ═══ Rough Draft Sections ═════════════════════════════════════════════ -->
<section class="forum-block">
	<div class="forum-block__header">
		<h2><ClipboardList size={14} /> Rough Draft (v{version})</h2>
	</div>

	<Accordion.Root type="multiple">
		{#each SECTIONS as sec}
			{@const sectionData = dd[sec.id]}
			{@const itemCount = countItems(sectionData)}
			{@const sectionProposals = openProposals.filter((p: any) => p.section === sec.id)}
			<Accordion.Item value={sec.id}>
				<Accordion.Trigger>
					<span class="thread-row">
						<span class="thread-row__icon"><Icon name={sec.icon} size={14} /></span>
						<span class="thread-row__label">{sec.label}</span>
						<span class="thread-row__meta">{itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'empty'}</span>
						{#if sectionProposals.length > 0}
							<span class="thread-row__proposals">{sectionProposals.length} open proposal{sectionProposals.length !== 1 ? 's' : ''}</span>
						{/if}
					</span>
				</Accordion.Trigger>
				<Accordion.Content>
					<div class="cr-section-body">
						<!-- Current rough draft data for this section -->
						{#if sec.id === 'rules'}
							<div class="cr-section-preview markdown-body">{@html renderRules(sectionData?.general_rules || '')}</div>
						{:else if sec.id === 'overview'}
							<div class="cr-section-preview markdown-body">{@html renderRules(sectionData?.content || '')}</div>
						{:else}
							{@const items = extractAllItems(sectionData)}
							{#if items.length > 0}
								{@const groups = groupItems(items)}
								<div class="cr-item-list">
									{#each groups as grp}
										{#if groups.length > 1}
											<h4 class="cr-group-header">{groupLabel(grp.group)}</h4>
										{/if}
										{#each grp.items as item}
											{@const itemProps = getItemProposals(item.slug || '', sec.id)}
											<Collapsible.Root class="cr-item">
												<Collapsible.Trigger class="cr-item__trigger">
													<span class="cr-item__header">
														<span class="cr-item__label">{item.label}</span>
														{#if item.slug}<code class="cr-item__slug">{item.slug}</code>{/if}
														{#if item.children?.length}
															<span class="cr-item__children">{item.children.length} sub-item{item.children.length !== 1 ? 's' : ''}</span>
														{/if}
														{#if itemProps.length > 0}
															<span class="cr-item__proposal-badge"><Send size={14} /> {itemProps.length}</span>
														{/if}
													</span>
													<span class="cr-item__chevron"><ChevronRight size={12} /></span>
												</Collapsible.Trigger>
												<Collapsible.Content>
													<div class="cr-item__details">
														{#if item.description}
															<div class="cr-item__detail-row">
																<span class="cr-item__detail-label">Description</span>
																<div class="cr-item__detail-body markdown-body">{@html renderMarkdown(item.description)}</div>
															</div>
														{/if}
														{#if item.exceptions}
															<div class="cr-item__detail-row">
																<span class="cr-item__detail-label">Exceptions</span>
																<div class="cr-item__detail-body markdown-body">{@html renderMarkdown(item.exceptions)}</div>
															</div>
														{/if}
														{#if item.difficulty}
															<div class="cr-item__detail-row">
																<span class="cr-item__detail-label">Difficulty</span>
																<span class="cr-item__detail-value">{item.difficulty}</span>
															</div>
														{/if}
														{#if item.requirements?.length}
															<div class="cr-item__detail-row">
																<span class="cr-item__detail-label">Requirements</span>
																<ul class="cr-item__req-list">{#each item.requirements as req}<li>{req}</li>{/each}</ul>
															</div>
														{/if}
														{#if item.children?.length}
															<div class="cr-item__detail-row">
																<span class="cr-item__detail-label">Sub-items</span>
																<div class="cr-item__child-list">
																	{#each item.children as child}
																		<Collapsible.Root class="cr-item__child-collapsible">
																			<Collapsible.Trigger class="cr-item__child-trigger">
																				<span class="cr-item__child-header">
																					<strong>{child.label}</strong>
																					{#if child.slug}<code class="cr-item__slug">{child.slug}</code>{/if}
																				</span>
																				{#if child.description || child.exceptions}
																					<span class="cr-item__chevron"><ChevronRight size={12} /></span>
																				{/if}
																			</Collapsible.Trigger>
																			{#if child.description || child.exceptions}
																				<Collapsible.Content>
																					<div class="cr-item__child-details">
																						{#if child.description}<div class="cr-item__child-desc markdown-body">{@html renderMarkdown(child.description)}</div>{/if}
																						{#if child.exceptions}<div class="cr-item__child-exc"><span class="cr-item__detail-label">Exceptions</span> {@html renderMarkdown(child.exceptions)}</div>{/if}
																					</div>
																				</Collapsible.Content>
																			{/if}
																		</Collapsible.Root>
																	{/each}
																</div>
															</div>
														{/if}

														<!-- Inline proposals for this item -->
														{#if itemProps.length > 0}
															<div class="cr-inline-proposals">
																<span class="cr-inline-proposals__header"><Send size={14} /> {itemProps.length} proposal{itemProps.length !== 1 ? 's' : ''} for this item</span>
																{#each itemProps as ip}
																	<div class="cr-inline-proposal cr-inline-proposal--{ip.status}">
																		<div class="cr-inline-proposal__top">
																			<span class="cr-item__diff-badge cr-item__diff-badge--{ip.status}">
																				{#if ip.status === 'updated'}✎ Updated{:else}<X size={12} /> Removed{/if}
																			</span>
																			<span class="cr-inline-proposal__by">by {ip.proposal.display_name || 'Anonymous'}</span>
																			{#if ip.proposal.title}
																				<span class="cr-inline-proposal__title">— {ip.proposal.title}</span>
																			{/if}
																		</div>
																		{#if ip.status === 'updated' && ip.changedFields}
																			<div class="cr-inline-proposal__diffs">
																				{#each ip.changedFields as field}
																					{#if field !== 'children'}
																						<div class="cr-inline-proposal__field">
																							<span class="cr-inline-proposal__field-name">{fieldLabel(field)}</span>
																							<div class="cr-inline-proposal__before">
																								<span class="cr-inline-proposal__tag cr-inline-proposal__tag--before">Before</span>
																								{#if field === 'description' || field === 'exceptions'}
																									<div class="markdown-body cr-inline-proposal__text">{@html renderMarkdown(ip.before[field] || '(empty)')}</div>
																								{:else}
																									<span class="cr-inline-proposal__text">{ip.before[field] || '(empty)'}</span>
																								{/if}
																							</div>
																							<div class="cr-inline-proposal__after">
																								<span class="cr-inline-proposal__tag cr-inline-proposal__tag--after">After</span>
																								{#if field === 'description' || field === 'exceptions'}
																									<div class="markdown-body cr-inline-proposal__text">{@html renderMarkdown(ip.after[field] || '(empty)')}</div>
																								{:else}
																									<span class="cr-inline-proposal__text">{ip.after[field] || '(empty)'}</span>
																								{/if}
																							</div>
																						</div>
																					{/if}
																				{/each}
																			</div>
																		{/if}
																	</div>
																{/each}
															</div>
														{/if}
													</div>
												</Collapsible.Content>
											</Collapsible.Root>
										{/each}

										<!-- Proposed additions for this group -->
										{@const additions = getNewItemProposals(sec.id).filter(a => a.item.group === grp.group)}
										{#each additions as add}
											<div class="cr-item cr-item--new">
												<div class="cr-item__static-row">
													<span class="cr-item__diff-badge cr-item__diff-badge--new">✚ New</span>
													<span class="cr-item__label">{add.item.label}</span>
													{#if add.item.slug}<code class="cr-item__slug">{add.item.slug}</code>{/if}
													<span class="cr-inline-proposal__by">by {add.proposal.display_name || 'Anonymous'}</span>
												</div>
												{#if add.item.description}
													<div class="cr-item__details cr-item__details--open">
														<div class="cr-item__detail-row">
															<span class="cr-item__detail-label">Description</span>
															<div class="cr-item__detail-body markdown-body">{@html renderMarkdown(add.item.description)}</div>
														</div>
													</div>
												{/if}
											</div>
										{/each}
									{/each}
								</div>
							{:else}
								<p class="muted">No items defined yet. Submit a proposal to add content.</p>
							{/if}
						{/if}

						{#if eligible}
							<div class="cr-section-actions">
								<Button.Root variant="accent" size="sm" onclick={() => openProposalForm(sec.id)}>
									+ Propose Change
								</Button.Root>
							</div>
						{/if}
					</div>
				</Accordion.Content>
			</Accordion.Item>
		{/each}
	</Accordion.Root>
</section>

<!-- ═══ Open Proposals ═══════════════════════════════════════════════════ -->
<section class="forum-block">
	<div class="forum-block__header">
		<h2><Send size={14} /> Open Proposals ({openProposals.length})</h2>
	</div>

	{#if openProposals.length === 0}
		<p class="muted cr-empty-hint">No open proposals. {eligible ? 'Be the first to suggest a change!' : ''}</p>
	{:else}
		<Accordion.Root type="multiple">
			{#each openProposals as prop}
				{@const isOwn = prop.user_id === userId}
				<Accordion.Item value={prop.id}>
					<Accordion.Trigger>
						<span class="proposal-trigger">
							<span class="proposal-trigger__section"><Icon name={sectionIcon(prop.section)} size={14} /> {sectionLabel(prop.section)}</span>
							<span class="proposal-trigger__title">{prop.title}</span>
							<span class="proposal-trigger__meta">
								by {prop.display_name}
								{#if isOwn}<span class="badge badge--you">You</span>{/if}
								· <ThumbsUp size={14} /> {prop.accept_count} · <ThumbsDown size={14} /> {prop.reject_count}
								· {timeAgo(prop.created_at)}
							</span>
						</span>
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="proposal-body">
							{#if prop.notes}
								<p class="proposal-body__notes">{prop.notes}</p>
							{/if}

							<!-- Proposed data preview (diff-aware) -->
							<div class="proposal-body__preview">
								{#if prop.section === 'rules'}
									<div class="cr-section-preview markdown-body">{@html renderRules(prop.proposed_data?.general_rules || '')}</div>
								{:else if prop.section === 'overview'}
									<div class="cr-section-preview markdown-body">{@html renderRules(prop.proposed_data?.content || '')}</div>
								{:else}
									{@const diffs = diffItems(dd[prop.section], prop.proposed_data)}
									{@const visibleDiffs = diffs.filter(d => d.status !== 'unchanged')}
									{#if visibleDiffs.length > 0 || diffs.length === 0}
										{@const diffGroups = groupItems(visibleDiffs.map(d => d.item))}
										<div class="cr-item-list">
											{#each diffGroups as grp}
												{#if diffGroups.length > 1}
													<h4 class="cr-group-header">{groupLabel(grp.group)}</h4>
												{/if}
												{#each grp.items as gItem}
													{@const d = visibleDiffs.find(v => v.item.slug === gItem.slug && v.item.group === gItem.group)}
													{#if d}
														<div class="cr-item cr-item--{d.status}">
															<div class="cr-item__static-row">
																<span class="cr-item__diff-badge cr-item__diff-badge--{d.status}">
																	{#if d.status === 'new'}✚ New{:else if d.status === 'removed'}<X size={12} /> Removed{:else}✎ Updated{/if}
																</span>
																<span class="cr-item__label">{d.item.label}</span>
																{#if d.item.slug}<code class="cr-item__slug">{d.item.slug}</code>{/if}
															</div>
															{#if d.status !== 'removed'}
																<div class="cr-item__details cr-item__details--open">
																	{#if d.status === 'new'}
																		<!-- New item: just show the values -->
																		{#if d.item.description}
																			<div class="cr-item__detail-row">
																				<span class="cr-item__detail-label">Description</span>
																				<div class="cr-item__detail-body markdown-body">{@html renderMarkdown(d.item.description)}</div>
																			</div>
																		{/if}
																		{#if d.item.exceptions}
																			<div class="cr-item__detail-row">
																				<span class="cr-item__detail-label">Exceptions</span>
																				<div class="cr-item__detail-body markdown-body">{@html renderMarkdown(d.item.exceptions)}</div>
																			</div>
																		{/if}
																	{:else if d.status === 'updated' && d.changedFields}
																		<!-- Updated item: before/after per changed field -->
																		<div class="cr-inline-proposal__diffs">
																			{#each d.changedFields as field}
																				{#if field !== 'children'}
																					<div class="cr-inline-proposal__field">
																						<span class="cr-inline-proposal__field-name">{fieldLabel(field)}</span>
																						<div class="cr-inline-proposal__before">
																							<span class="cr-inline-proposal__tag cr-inline-proposal__tag--before">Before</span>
																							{#if field === 'description' || field === 'exceptions'}
																								<div class="markdown-body cr-inline-proposal__text">{@html renderMarkdown(d.baseItem?.[field] || '(empty)')}</div>
																							{:else}
																								<span class="cr-inline-proposal__text">{d.baseItem?.[field] || '(empty)'}</span>
																							{/if}
																						</div>
																						<div class="cr-inline-proposal__after">
																							<span class="cr-inline-proposal__tag cr-inline-proposal__tag--after">After</span>
																							{#if field === 'description' || field === 'exceptions'}
																								<div class="markdown-body cr-inline-proposal__text">{@html renderMarkdown(d.item[field] || '(empty)')}</div>
																							{:else}
																								<span class="cr-inline-proposal__text">{d.item[field] || '(empty)'}</span>
																							{/if}
																						</div>
																					</div>
																				{/if}
																			{/each}
																		</div>
																	{/if}
																	{#if d.item.children?.length && (d.status === 'new' || d.changedFields?.includes('children'))}
																		<div class="cr-item__detail-row">
																			<span class="cr-item__detail-label">Sub-items</span>
																			<div class="cr-item__child-list">
																				{#each d.item.children as child}
																					<Collapsible.Root class="cr-item__child-collapsible">
																						<Collapsible.Trigger class="cr-item__child-trigger">
																							<span class="cr-item__child-header">
																								<strong>{child.label}</strong>
																								{#if child.slug}<code class="cr-item__slug">{child.slug}</code>{/if}
																							</span>
																							{#if child.description || child.exceptions}
																								<span class="cr-item__chevron"><ChevronRight size={12} /></span>
																							{/if}
																						</Collapsible.Trigger>
																						{#if child.description || child.exceptions}
																							<Collapsible.Content>
																								<div class="cr-item__child-details">
																									{#if child.description}<div class="cr-item__child-desc markdown-body">{@html renderMarkdown(child.description)}</div>{/if}
																									{#if child.exceptions}<div class="cr-item__child-exc"><span class="cr-item__detail-label">Exceptions</span> {@html renderMarkdown(child.exceptions)}</div>{/if}
																								</div>
																							</Collapsible.Content>
																						{/if}
																					</Collapsible.Root>
																				{/each}
																			</div>
																		</div>
																	{/if}
																</div>
															{/if}
														</div>
													{/if}
												{/each}
											{/each}
										</div>
										{@const unchangedCount = diffs.filter(d => d.status === 'unchanged').length}
										{#if unchangedCount > 0}
											<p class="cr-unchanged-note">{unchangedCount} unchanged item{unchangedCount !== 1 ? 's' : ''} not shown</p>
										{/if}
									{:else}
										<p class="muted">No changes from the current rough draft.</p>
									{/if}
								{/if}
							</div>

							<!-- Voting + actions -->
							<div class="proposal-body__actions">
								{#if eligible && !isOwn}
									<Button.Root variant="accent" size="sm" onclick={() => voteOnProposal(prop.id, 'accept')}>
										<ThumbsUp size={14} /> Accept ({prop.accept_count})
									</Button.Root>
									<Button.Root variant="outline" size="sm" onclick={() => voteOnProposal(prop.id, 'reject')}>
										<ThumbsDown size={14} /> Reject ({prop.reject_count})
									</Button.Root>
								{:else if isOwn}
									<span class="muted small">Your proposal (counts as 1 accept)</span>
									<Button.Root variant="outline" size="sm" onclick={() => withdrawProposal(prop.id)}>Withdraw</Button.Root>
								{:else if !$user}
									<span class="muted small">Sign in to vote</span>
								{:else}
									<span class="muted small"><ThumbsUp size={14} /> {prop.accept_count} · <ThumbsDown size={14} /> {prop.reject_count}</span>
								{/if}
							</div>
						</div>
					</Accordion.Content>
				</Accordion.Item>
			{/each}
		</Accordion.Root>
	{/if}
</section>

<!-- ═══ Version History ══════════════════════════════════════════════════ -->
{#if draftHistory.length > 0}
	<section class="forum-block">
		<div class="forum-block__header">
			<h2><ScrollText size={14} /> Version History</h2>
		</div>
		<div class="cr-history">
			{#each draftHistory as entry}
				<div class="cr-history__entry">
					<span class="cr-history__version">v{entry.version}</span>
					<span class="cr-history__section"><Icon name={sectionIcon(entry.section_changed)} size={14} /> {sectionLabel(entry.section_changed)}</span>
					<span class="cr-history__summary">{entry.change_summary || 'Updated'}</span>
					<span class="cr-history__date">{timeAgo(entry.created_at)}</span>
					<button class="cr-history__diff-btn" onclick={() => { diffEntry = entry; showHistoryDiff = true; }}>
						View diff
					</button>
				</div>
			{/each}
		</div>
	</section>
{/if}

<!-- ═══ Volunteers & Approval ════════════════════════════════════════════ -->
<section class="forum-block">
	<div class="forum-block__header">
		<h2><Users size={16} /> Volunteers & Approval</h2>
	</div>

	<div class="cr-volunteers">
		<!-- Moderator -->
		<div class="cr-vol-role">
			<div class="cr-vol-role__header">
				<span class="cr-vol-role__title"><Shield size={14} /> Game Moderator</span>
				{#if hasMod}
					<span class="cr-vol-role__check"><Check size={12} /> Filled</span>
				{:else}
					<span class="cr-vol-role__needed">Needed</span>
				{/if}
			</div>
			<div class="cr-vol-role__people">
				{#each volunteers.filter((v: any) => v.role === 'moderator') as vol}
					<span class="cr-vol-chip">{vol.display_name}</span>
				{/each}
			</div>
			{#if eligible && !userVolunteeredMod}
				<Button.Root variant="outline" size="sm" onclick={() => volunteer('moderator')}>Volunteer as Moderator</Button.Root>
			{:else if userVolunteeredMod}
				<Button.Root variant="outline" size="sm" onclick={() => unvolunteer('moderator')}>Withdraw Moderator Signup</Button.Root>
			{/if}
		</div>

		<!-- Verifier -->
		<div class="cr-vol-role">
			<div class="cr-vol-role__header">
				<span class="cr-vol-role__title"><CheckCircle size={14} /> Game Verifier</span>
				{#if hasVerifier}
					<span class="cr-vol-role__check"><Check size={12} /> Filled</span>
				{:else}
					<span class="cr-vol-role__needed">Needed</span>
				{/if}
			</div>
			<div class="cr-vol-role__people">
				{#each volunteers.filter((v: any) => v.role === 'verifier') as vol}
					<span class="cr-vol-chip">{vol.display_name}</span>
				{/each}
			</div>
			{#if eligible && !userVolunteeredVerifier}
				<Button.Root variant="outline" size="sm" onclick={() => volunteer('verifier')}>Volunteer as Verifier</Button.Root>
			{:else if userVolunteeredVerifier}
				<Button.Root variant="outline" size="sm" onclick={() => unvolunteer('verifier')}>Withdraw Verifier Signup</Button.Root>
			{/if}
		</div>
	</div>

	<!-- Request Approval Button -->
	{#if !approvalRequested && eligible && hasMod && hasVerifier}
		<div class="cr-approval-action">
			<Button.Root variant="accent" size="lg" onclick={requestApproval}>
				<Rocket size={14} /> Request Final Approval
			</Button.Root>
			<p class="muted small">An admin will review and finalize the game.</p>
		</div>
	{:else if !approvalRequested && (!hasMod || !hasVerifier)}
		<div class="cr-approval-action cr-approval-action--locked">
			<p class="muted small"><Lock size={14} /> To request approval, the game needs at least 1 moderator volunteer and 1 verifier volunteer.</p>
		</div>
	{/if}

	{#if approvalRequested && isAdmin}
		<div class="cr-approval-action">
			<Button.Root variant="accent" size="lg" onclick={finalize}>
				Finalize Game → Active
			</Button.Root>
		</div>
	{/if}
</section>

{/if}

<!-- ═══ Proposal Editor ═══════════════════════════════════════════════════ -->
{#if showProposalForm}
	<ProposalEditor
		section={propSection}
		initialData={dd[propSection] || {}}
		onSubmit={submitProposal}
		onClose={() => { showProposalForm = false; }}
		submitting={propSubmitting}
	/>
{/if}

<!-- ═══ History Diff Modal ═══════════════════════════════════════════════ -->
{#if showHistoryDiff && diffEntry}
	{@const afterSection = getAfterSection(diffEntry)}
	{@const oldSection = diffEntry.draft_data?.[diffEntry.section_changed]}
	<Dialog.Root open={showHistoryDiff} onOpenChange={(o: boolean) => { if (!o) showHistoryDiff = false; }}>
		<Dialog.Overlay />
		<Dialog.Content class="cr-diff-dialog">
			<Dialog.Header>
				<Dialog.Title>Diff — v{diffEntry.version} → v{diffEntry.version + 1} ({sectionLabel(diffEntry.section_changed)})</Dialog.Title>
				<Dialog.Close>&times;</Dialog.Close>
			</Dialog.Header>
			<div class="cr-modal__body">
				<div class="cr-diff">
					<div class="cr-diff__side cr-diff__side--before">
						<h4 class="cr-diff__label">Before (v{diffEntry.version})</h4>
						<div class="cr-diff__content">
							{#if diffEntry.section_changed === 'rules'}
								<div class="markdown-body">{@html renderRules(oldSection?.general_rules || '')}</div>
							{:else if diffEntry.section_changed === 'overview'}
								<div class="markdown-body">{@html renderRules(oldSection?.content || '')}</div>
							{:else}
								<pre class="cr-diff__json">{JSON.stringify(oldSection, null, 2)}</pre>
							{/if}
						</div>
					</div>
					<div class="cr-diff__side cr-diff__side--after">
						<h4 class="cr-diff__label">After (v{diffEntry.version + 1})</h4>
						<div class="cr-diff__content">
							{#if diffEntry.section_changed === 'rules'}
								<div class="markdown-body">{@html renderRules(afterSection?.general_rules || '')}</div>
							{:else if diffEntry.section_changed === 'overview'}
								<div class="markdown-body">{@html renderRules(afterSection?.content || '')}</div>
							{:else}
								<pre class="cr-diff__json">{JSON.stringify(afterSection, null, 2)}</pre>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}

<!-- ═══ Confirm Dialog ═══════════════════════════════════════════════════ -->
<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleConfirmAction}>Confirm</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	/* Status banner */
	.cr-status-banner { display: flex; align-items: flex-start; gap: 0.75rem; padding: 1rem 1.25rem; background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 10px; margin-bottom: 1rem; }
	.cr-status-banner--requested { background: rgba(234, 179, 8, 0.06); border-color: rgba(234, 179, 8, 0.25); }
	.cr-status-banner__icon { font-size: 1.3rem; flex-shrink: 0; }
	.cr-status-banner__text { font-size: 0.9rem; line-height: 1.55; }
	.cr-status-banner__version { display: inline-block; margin-left: 0.5rem; font-size: 0.78rem; padding: 0.1rem 0.4rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; }

	.cr-eligibility-notice { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.85rem; background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; margin-bottom: 1rem; font-size: 0.88rem; }

	/* Section body */
	.cr-section-body { padding-top: 0.5rem; }
	.cr-section-preview { font-size: 0.9rem; max-height: 300px; overflow-y: auto; padding: 0.75rem; background: var(--bg); border-radius: 6px; }
	.cr-section-actions { margin-top: 0.75rem; }

	/* Item list */
	.cr-item-list { display: flex; flex-direction: column; gap: 0.35rem; }
	.cr-group-header { font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 0.75rem 0 0.35rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--border); }
	.cr-group-header:first-child { margin-top: 0; }
	:global(.cr-item) { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
	:global(.cr-item__trigger) { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0.5rem 0.65rem; background: none; border: none; color: var(--fg); font-family: inherit; cursor: pointer; text-align: left; }
	:global(.cr-item__trigger:hover) { background: rgba(255,255,255,0.02); }
	.cr-item__header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; min-width: 0; }
	.cr-item__label { font-weight: 600; font-size: 0.88rem; }
	.cr-item__slug { font-size: 0.72rem; color: var(--muted); background: var(--surface); padding: 0.1rem 0.35rem; border-radius: 3px; font-family: monospace; }
	.cr-item__children { font-size: 0.78rem; color: var(--muted); }
	:global(.cr-item__chevron) { font-size: 0.65rem; color: var(--muted); transition: transform 0.15s; flex-shrink: 0; }
	:global(.cr-item__trigger[data-state="open"] .cr-item__chevron),
	:global(.cr-item__child-trigger[data-state="open"] .cr-item__chevron) { transform: rotate(90deg); }
	.cr-item__details { padding: 0 0.75rem 0.75rem; border-top: 1px solid var(--border); }
	.cr-item__details--open { padding: 0.5rem 0.75rem 0.75rem; border-top: 1px solid var(--border); }
	.cr-item__detail-row { padding: 0.5rem 0 0; }
	.cr-item__detail-row + .cr-item__detail-row { border-top: 1px dashed var(--border); }
	.cr-item__detail-label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 0.2rem; }
	.cr-item__detail-body { font-size: 0.85rem; line-height: 1.5; }
	.cr-item__detail-value { font-size: 0.85rem; }
	.cr-item__req-list { padding-left: 1.25rem; margin: 0; font-size: 0.85rem; }
	.cr-item__req-list li { margin-bottom: 0.2rem; }
	.cr-item__child-list { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.25rem; }
	.cr-item__child { padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; }
	.cr-item__child strong { font-size: 0.85rem; }
	.cr-item__child-desc { font-size: 0.82rem; margin-top: 0.15rem; }
	.cr-item__child-exc { font-size: 0.78rem; color: var(--muted); margin-top: 0.15rem; }

	/* Expandable children (Collapsible) */
	:global(.cr-item__child-collapsible) { padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; }
	:global(.cr-item__child-trigger) { display: flex; justify-content: space-between; align-items: center; width: 100%; background: none; border: none; color: var(--fg); cursor: pointer; text-align: left; font-family: inherit; padding: 0; }
	:global(.cr-item__child-trigger:hover) { opacity: 0.85; }
	.cr-item__child-header { display: flex; align-items: center; gap: 0.5rem; }
	.cr-item__child-details { padding-top: 0.4rem; margin-top: 0.3rem; border-top: 1px dashed var(--border); }

	/* Diff badges for proposals */
	.cr-item--new { border-left: 3px solid #22c55e; }
	.cr-item--removed { border-left: 3px solid #ef4444; opacity: 0.65; }
	.cr-item--updated { border-left: 3px solid #f59e0b; }
	.cr-item__static-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.5rem 0.65rem; }
	.cr-item__diff-badge { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; padding: 0.12rem 0.45rem; border-radius: 3px; white-space: nowrap; }
	.cr-item__diff-badge--new { background: rgba(34,197,94,0.15); color: #22c55e; }
	.cr-item__diff-badge--removed { background: rgba(239,68,68,0.15); color: #ef4444; }
	.cr-item__diff-badge--updated { background: rgba(245,158,11,0.15); color: #f59e0b; }
	.cr-unchanged-note { font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem; font-style: italic; }

	/* Inline proposal indicators on draft items */
	.cr-item__proposal-badge { font-size: 0.72rem; color: var(--accent); background: rgba(99,102,241,0.1); padding: 0.1rem 0.4rem; border-radius: 3px; white-space: nowrap; }
	.cr-inline-proposals { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 2px solid var(--accent); }
	.cr-inline-proposals__header { display: block; font-size: 0.78rem; font-weight: 600; color: var(--accent); margin-bottom: 0.5rem; }
	.cr-inline-proposal { padding: 0.6rem 0.7rem; background: rgba(99,102,241,0.04); border: 1px solid rgba(99,102,241,0.15); border-radius: 6px; margin-bottom: 0.4rem; }
	.cr-inline-proposal--removed { background: rgba(239,68,68,0.04); border-color: rgba(239,68,68,0.15); }
	.cr-inline-proposal--updated { background: rgba(245,158,11,0.04); border-color: rgba(245,158,11,0.15); }
	.cr-inline-proposal__top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.cr-inline-proposal__by { font-size: 0.78rem; color: var(--muted); }
	.cr-inline-proposal__title { font-size: 0.78rem; color: var(--muted); font-style: italic; }
	.cr-inline-proposal__diffs { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.cr-inline-proposal__field { padding: 0.4rem 0; }
	.cr-inline-proposal__field + .cr-inline-proposal__field { border-top: 1px dashed var(--border); }
	.cr-inline-proposal__field-name { display: block; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 0.3rem; }
	.cr-inline-proposal__before, .cr-inline-proposal__after { display: flex; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.2rem; }
	.cr-inline-proposal__tag { flex-shrink: 0; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 0.1rem 0.35rem; border-radius: 3px; margin-top: 0.1rem; }
	.cr-inline-proposal__tag--before { background: rgba(239,68,68,0.12); color: #ef4444; }
	.cr-inline-proposal__tag--after { background: rgba(34,197,94,0.12); color: #22c55e; }
	.cr-inline-proposal__text { font-size: 0.82rem; line-height: 1.45; }

	/* Proposal trigger */
	.proposal-trigger { display: flex; flex-direction: column; gap: 0.2rem; }
	.proposal-trigger__section { font-size: 0.78rem; color: var(--muted); }
	.proposal-trigger__title { font-weight: 600; font-size: 0.92rem; }
	.proposal-trigger__meta { font-size: 0.8rem; color: var(--muted); }

	/* Proposal body */
	.proposal-body { display: flex; flex-direction: column; gap: 0.6rem; padding-top: 0.5rem; }
	.proposal-body__notes { font-size: 0.85rem; color: var(--muted); margin: 0; font-style: italic; }
	.proposal-body__preview { border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem; max-height: 250px; overflow-y: auto; }
	.proposal-body__actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

	/* Badge */
	.badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px; }
	.badge--you { background: rgba(59, 195, 110, 0.15); color: var(--accent); }

	/* History */
	.cr-history { display: flex; flex-direction: column; gap: 0.35rem; }
	.cr-history__entry { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.65rem; background: var(--bg); border-radius: 6px; font-size: 0.85rem; flex-wrap: wrap; }
	.cr-history__version { font-weight: 600; min-width: 30px; }
	.cr-history__section { font-size: 0.82rem; color: var(--muted); min-width: 120px; }
	.cr-history__summary { flex: 1; min-width: 100px; }
	.cr-history__date { font-size: 0.78rem; color: var(--muted); }
	.cr-history__diff-btn { background: none; border: 1px solid var(--border); border-radius: 4px; font-size: 0.78rem; padding: 0.15rem 0.4rem; cursor: pointer; color: var(--accent); font-family: inherit; }
	.cr-history__diff-btn:hover { border-color: var(--accent); }

	/* Volunteers */
	.cr-volunteers { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	@media (max-width: 600px) { .cr-volunteers { grid-template-columns: 1fr; } }
	.cr-vol-role { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.cr-vol-role__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
	.cr-vol-role__title { font-weight: 600; font-size: 0.92rem; }
	.cr-vol-role__check { font-size: 0.78rem; color: var(--status-verified); }
	.cr-vol-role__needed { font-size: 0.78rem; color: var(--status-rejected); font-weight: 600; }
	.cr-vol-role__people { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.5rem; min-height: 24px; }
	.cr-vol-chip { padding: 0.15rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 0.82rem; }

	/* Approval action */
	.cr-approval-action { margin-top: 1rem; text-align: center; }
	.cr-approval-action--locked { opacity: 0.7; }

	/* Modal */
	:global(.cr-diff-dialog) { max-width: 900px; width: 100%; }
	.cr-modal__body { padding: 1.25rem; }

	/* Diff view */
	.cr-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	@media (max-width: 600px) { .cr-diff { grid-template-columns: 1fr; } }
	.cr-diff__side { min-width: 0; }
	.cr-diff__label { font-size: 0.85rem; font-weight: 600; margin: 0 0 0.5rem; color: var(--muted); }
	.cr-diff__content { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem; max-height: 400px; overflow-y: auto; font-size: 0.85rem; }
	.cr-diff__json { font-size: 0.78rem; white-space: pre-wrap; word-break: break-all; margin: 0; font-family: var(--font-mono, monospace); }

	/* Form elements */
	.fg { margin-bottom: 1rem; }
	.fl { display: block; margin-bottom: 0.3rem; font-size: 0.82rem; font-weight: 600; color: var(--muted); }
	.fi { width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 0.9rem; font-family: inherit; box-sizing: border-box; }
	.fi:focus { outline: none; border-color: var(--accent); }
	.fi--mono { font-family: var(--font-mono, monospace); font-size: 0.82rem; }
	.fh { font-size: 0.78rem; color: var(--muted); margin-top: 0.25rem; }

	.cr-empty { text-align: center; padding: 2rem; }
	.cr-empty-hint { font-size: 0.88rem; padding: 0.75rem 0; }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }

	/* Thread row overrides for proposals count */
	.thread-row__proposals { font-size: 0.78rem; padding: 0.1rem 0.4rem; background: rgba(99, 102, 241, 0.1); border-radius: 4px; color: rgba(99, 102, 241, 0.8); }

	/* Inline proposal indicators (under draft items) */
	.cr-item__proposal-badge { font-size: 0.72rem; padding: 0.1rem 0.35rem; background: rgba(99, 102, 241, 0.12); border-radius: 3px; color: rgba(99, 102, 241, 0.85); white-space: nowrap; }
	.cr-inline-proposals { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border); display: flex; flex-direction: column; gap: 0.5rem; }
	.cr-inline-proposals__header { font-size: 0.78rem; font-weight: 600; color: var(--muted); }
	.cr-inline-proposal { padding: 0.6rem 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
	.cr-inline-proposal--updated { border-left: 3px solid #f59e0b; }
	.cr-inline-proposal--removed { border-left: 3px solid #ef4444; }
	.cr-inline-proposal__top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.cr-inline-proposal__by { font-size: 0.78rem; color: var(--muted); }
	.cr-inline-proposal__title { font-size: 0.78rem; color: var(--muted); font-style: italic; }
	.cr-inline-proposal__diffs { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.cr-inline-proposal__field { background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 0.5rem; }
	.cr-inline-proposal__field-name { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 0.35rem; }
	.cr-inline-proposal__before, .cr-inline-proposal__after { display: flex; align-items: flex-start; gap: 0.5rem; margin-top: 0.25rem; }
	.cr-inline-proposal__tag { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; padding: 0.1rem 0.35rem; border-radius: 3px; flex-shrink: 0; margin-top: 0.1rem; }
	.cr-inline-proposal__tag--before { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
	.cr-inline-proposal__tag--after { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
	.cr-inline-proposal__text { font-size: 0.85rem; line-height: 1.5; min-width: 0; }
</style>
