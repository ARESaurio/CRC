<script lang="ts">
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { getAccessToken } from '$lib/admin';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { SECTIONS, type SectionId } from './consensus';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
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
		return SECTIONS.find(s => s.id === id)?.icon || '📄';
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

	function extractAllItems(sectionData: any): { label: string; description?: string; children?: any[] }[] {
		if (!sectionData) return [];
		const items: any[] = [];
		for (const [_key, val] of Object.entries(sectionData)) {
			if (Array.isArray(val)) {
				for (const item of val) {
					if (item && typeof item === 'object' && item.label) {
						items.push(item);
					}
				}
			}
		}
		return items;
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
		<span class="cr-status-banner__icon">🔔</span>
		<div class="cr-status-banner__text">
			<strong>Approval requested</strong> — waiting for an admin to finalize this game.
			{#if isAdmin}
				<Button.Root variant="accent" size="sm" onclick={finalize} style="margin-top: 0.5rem;">Finalize Game → Active</Button.Root>
			{/if}
		</div>
	{:else}
		<span class="cr-status-banner__icon">🏗️</span>
		<div class="cr-status-banner__text">
			<strong>Community Review</strong> — this game's rules are being built by the community. Propose changes, vote, and help shape the game page.
			<span class="cr-status-banner__version">Rough Draft v{version}</span>
		</div>
	{/if}
</div>

{#if eligible === false && $user}
	<div class="cr-eligibility-notice">
		<span>🔒</span> <span>{eligibilityReason || 'You need at least 1 published run for this game to participate.'}</span>
	</div>
{/if}

<!-- ═══ Rough Draft Sections ═════════════════════════════════════════════ -->
<section class="forum-block">
	<div class="forum-block__header">
		<h2>📋 Rough Draft (v{version})</h2>
	</div>

	<Accordion.Root type="multiple">
		{#each SECTIONS as sec}
			{@const sectionData = dd[sec.id]}
			{@const itemCount = countItems(sectionData)}
			{@const sectionProposals = openProposals.filter((p: any) => p.section === sec.id)}
			<Accordion.Item value={sec.id}>
				<Accordion.Trigger>
					<span class="thread-row">
						<span class="thread-row__icon">{sec.icon}</span>
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
								<div class="cr-item-list">
									{#each items as item}
										<div class="cr-item">
											<span class="cr-item__label">{item.label}</span>
											{#if item.description}
												<span class="cr-item__desc">{item.description}</span>
											{/if}
											{#if item.children?.length}
												<span class="cr-item__children">{item.children.length} sub-item{item.children.length !== 1 ? 's' : ''}</span>
											{/if}
										</div>
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
		<h2>📨 Open Proposals ({openProposals.length})</h2>
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
							<span class="proposal-trigger__section">{sectionIcon(prop.section)} {sectionLabel(prop.section)}</span>
							<span class="proposal-trigger__title">{prop.title}</span>
							<span class="proposal-trigger__meta">
								by {prop.display_name}
								{#if isOwn}<span class="badge badge--you">You</span>{/if}
								· 👍 {prop.accept_count} · 👎 {prop.reject_count}
								· {timeAgo(prop.created_at)}
							</span>
						</span>
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="proposal-body">
							{#if prop.notes}
								<p class="proposal-body__notes">{prop.notes}</p>
							{/if}

							<!-- Proposed data preview -->
							<div class="proposal-body__preview">
								{#if prop.section === 'rules'}
									<div class="cr-section-preview markdown-body">{@html renderRules(prop.proposed_data?.general_rules || '')}</div>
								{:else if prop.section === 'overview'}
									<div class="cr-section-preview markdown-body">{@html renderRules(prop.proposed_data?.content || '')}</div>
								{:else}
									{@const items = extractAllItems(prop.proposed_data)}
									{#if items.length > 0}
										<div class="cr-item-list">
											{#each items as item}
												<div class="cr-item">
													<span class="cr-item__label">{item.label}</span>
													{#if item.description}<span class="cr-item__desc">{item.description}</span>{/if}
												</div>
											{/each}
										</div>
									{:else}
										<p class="muted">Proposal clears this section.</p>
									{/if}
								{/if}
							</div>

							<!-- Voting + actions -->
							<div class="proposal-body__actions">
								{#if eligible && !isOwn}
									<Button.Root variant="accent" size="sm" onclick={() => voteOnProposal(prop.id, 'accept')}>
										👍 Accept ({prop.accept_count})
									</Button.Root>
									<Button.Root variant="outline" size="sm" onclick={() => voteOnProposal(prop.id, 'reject')}>
										👎 Reject ({prop.reject_count})
									</Button.Root>
								{:else if isOwn}
									<span class="muted small">Your proposal (counts as 1 accept)</span>
									<Button.Root variant="outline" size="sm" onclick={() => withdrawProposal(prop.id)}>Withdraw</Button.Root>
								{:else if !$user}
									<span class="muted small">Sign in to vote</span>
								{:else}
									<span class="muted small">👍 {prop.accept_count} · 👎 {prop.reject_count}</span>
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
			<h2>📜 Version History</h2>
		</div>
		<div class="cr-history">
			{#each draftHistory as entry}
				<div class="cr-history__entry">
					<span class="cr-history__version">v{entry.version}</span>
					<span class="cr-history__section">{sectionIcon(entry.section_changed)} {sectionLabel(entry.section_changed)}</span>
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
		<h2>🙋 Volunteers & Approval</h2>
	</div>

	<div class="cr-volunteers">
		<!-- Moderator -->
		<div class="cr-vol-role">
			<div class="cr-vol-role__header">
				<span class="cr-vol-role__title">🛡️ Game Moderator</span>
				{#if hasMod}
					<span class="cr-vol-role__check">✓ Filled</span>
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
				<span class="cr-vol-role__title">✅ Game Verifier</span>
				{#if hasVerifier}
					<span class="cr-vol-role__check">✓ Filled</span>
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
				🚀 Request Final Approval
			</Button.Root>
			<p class="muted small">An admin will review and finalize the game.</p>
		</div>
	{:else if !approvalRequested && (!hasMod || !hasVerifier)}
		<div class="cr-approval-action cr-approval-action--locked">
			<p class="muted small">🔒 To request approval, the game needs at least 1 moderator volunteer and 1 verifier volunteer.</p>
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
	<div class="cr-modal-overlay" role="dialog" onclick={(e) => { if (e.target === e.currentTarget) showHistoryDiff = false; }}>
		<div class="cr-modal cr-modal--wide">
			<div class="cr-modal__header">
				<h3>Diff — v{diffEntry.version} → v{diffEntry.version + 1} ({sectionLabel(diffEntry.section_changed)})</h3>
				<button class="cr-modal__close" onclick={() => { showHistoryDiff = false; }}>&times;</button>
			</div>
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
		</div>
	</div>
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
	.cr-item { padding: 0.4rem 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
	.cr-item__label { font-weight: 600; font-size: 0.88rem; }
	.cr-item__desc { display: block; font-size: 0.82rem; color: var(--muted); margin-top: 0.15rem; }
	.cr-item__children { font-size: 0.78rem; color: var(--muted); margin-left: 0.5rem; }

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
	.cr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1rem; }
	.cr-modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; }
	.cr-modal--wide { max-width: 900px; }
	.cr-modal__header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
	.cr-modal__header h3 { margin: 0; font-size: 1rem; }
	.cr-modal__close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--muted); font-family: inherit; padding: 0 0.25rem; }
	.cr-modal__close:hover { color: var(--fg); }
	.cr-modal__body { padding: 1.25rem; }
	.cr-modal__footer { display: flex; gap: 0.5rem; padding: 0 1.25rem 1.25rem; }

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
	textarea.fi { resize: vertical; }
	.fh { font-size: 0.78rem; color: var(--muted); margin-top: 0.25rem; }

	.cr-empty { text-align: center; padding: 2rem; }
	.cr-empty-hint { font-size: 0.88rem; padding: 0.75rem 0; }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }

	/* Thread row overrides for proposals count */
	.thread-row__proposals { font-size: 0.78rem; padding: 0.1rem 0.4rem; background: rgba(99, 102, 241, 0.1); border-radius: 4px; color: rgba(99, 102, 241, 0.8); }
</style>
