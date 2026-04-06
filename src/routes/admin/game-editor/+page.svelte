<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import AzNav from '$lib/components/AzNav.svelte';
	import { norm, expandRomanNumerals, matchesLetterFilter, getFirstLetter } from '$lib/utils/filters';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, LockOpen, Gamepad2, X, Search, ArrowLeft, Hourglass} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { showToast } from '$stores/toast';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(false);
	let games = $state<any[]>([]);
	let searchInput = $state('');
	let search = $state('');
	let activeLetter = $state('');
	let showLimit = $state(25);
	let userRole = $state<any>(null);
	let userId = $state('');
	let freezingAll = $state(false);
	let freezeConfirmOpen = $state(false);

	// Debounce search input (300ms)
	$effect(() => {
		const value = searchInput;
		if (!value) { search = ''; return; }
		const timer = setTimeout(() => { search = value; }, 300);
		return () => clearTimeout(timer);
	});

	const filtered = $derived.by(() => {
		return games.filter(g => {
			// A-Z filter
			const firstLetter = getFirstLetter(g.game_name || '');
			if (!matchesLetterFilter(firstLetter, activeLetter)) return false;

			// Text search
			if (search.trim()) {
				const q = search.toLowerCase();
				if (
					!g.game_name?.toLowerCase().includes(q) &&
					!g.game_id?.toLowerCase().includes(q) &&
					!g.game_name_aliases?.some((a: string) => a.toLowerCase().includes(q))
				) return false;
			}
			return true;
		});
	});

	const visible = $derived(showLimit === 0 ? filtered : filtered.slice(0, showLimit));

	const isSuperAdmin = $derived(userRole?.superAdmin === true);
	const isAdmin = $derived(userRole?.admin === true);
	const canFreeze = $derived(isAdmin);
	const allFrozen = $derived(games.length > 0 && games.every(g => g.frozen_at));
	const frozenCount = $derived(games.filter(g => g.frozen_at).length);

	async function loadGames() {
		loading = true;
		let query = supabase
			.from('games')
			.select('game_id, game_name, game_name_aliases, status, genres, platforms, cover, updated_at, frozen_at, frozen_by')
			.order('game_name');

		if (userRole?.moderator && !userRole?.admin) {
			const ids = userRole.gameIds || [];
			if (ids.length === 0) { games = []; loading = false; return; }
			query = query.in('game_id', ids);
		}

		const { data, error } = await query;
		if (!error && data) games = data;
		loading = false;
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/game-editor'); return; }
				userId = sess?.user?.id || '';
				const role = await checkAdminRole();
				userRole = role;
				authorized = !!(role?.admin || role?.moderator);
				checking = false;
				if (authorized) loadGames();
			}
		});
		return unsub;
	});

	function promptFreezeAll() {
		if (!canFreeze) return;
		freezeConfirmOpen = true;
	}

	async function executeFreezeAll() {
		freezeConfirmOpen = false;
		const shouldFreeze = !allFrozen;

		freezingAll = true;
		const updates = shouldFreeze
			? { frozen_at: new Date().toISOString(), frozen_by: userId }
			: { frozen_at: null, frozen_by: null };

		const ids = shouldFreeze ? games.map(g => g.game_id) : games.filter(g => g.frozen_at).map(g => g.game_id);
		const { error } = await supabase.from('games').update(updates).in('game_id', ids);

		if (error) {
			showToast('error', `Freeze failed: ${error.message}`);
			freezingAll = false;
			return;
		}

		try {
			await supabase.from('audit_log').insert({
				performed_by: userId,
				action: shouldFreeze ? 'all_games_frozen' : 'all_games_unfrozen',
				target_type: 'game',
				target_id: 'all',
			});
		} catch { /* best effort */ }

		games = games.map(g =>
			ids.includes(g.game_id)
				? { ...g, frozen_at: shouldFreeze ? updates.frozen_at : null, frozen_by: shouldFreeze ? userId : null }
				: g
		);
		freezingAll = false;
	}
</script>

<svelte:head><title>{m.admin_editor_title()}</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}><ArrowLeft size={14} /> {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_access_required()}</p><a href={localizeHref("/admin")} class="btn">{m.admin_back_to_dashboard()}</a></div>
	{:else}
		<h2>{m.admin_editor_heading()}</h2>
		<p class="muted mb-2">
			{#if isAdmin}Edit game configurations — categories, restrictions, rules, and more.
			{:else}Edit games you moderate — categories, restrictions, rules, and more.{/if}
			Changes save directly to the database.
		</p>

		{#if userRole?.moderator && !isAdmin}
			<div class="role-notice">You are a <strong>Game Moderator</strong>. You can edit the {userRole.gameIds?.length || 0} game{userRole.gameIds?.length !== 1 ? 's' : ''} assigned to you.</div>
		{/if}

		{#if canFreeze}
			<div class="freeze-all-bar">
				<div class="freeze-all-info">
					{#if frozenCount > 0}
						<span class="freeze-all-count"><Lock size={12} style="display:inline-block;vertical-align:-0.125em;" /> {frozenCount} of {games.length} game{games.length !== 1 ? 's' : ''} frozen</span>
					{:else}
						<span class="muted">No games are frozen.</span>
					{/if}
				</div>
				<button
					class="btn freeze-all-btn"
					class:freeze-all-btn--frozen={allFrozen}
					disabled={freezingAll || games.length === 0}
					onclick={promptFreezeAll}
				>
					{#if freezingAll}
						<Hourglass size={14} /> Processing...
					{:else if allFrozen}
						<LockOpen size={14} /> Unfreeze All Games
					{:else}
						<Lock size={14} /> Freeze All Games
					{/if}
				</button>
			</div>
		{/if}

		<AzNav bind:activeLetter />

		<div class="search-bar">
			<input type="text" class="search-bar__input" placeholder="Search games..." bind:value={searchInput} />
			{#if searchInput}<button class="search-bar__clear" onclick={() => { searchInput = ''; search = ''; }}><X size={14} /></button>{/if}
		</div>

		<div class="results-controls">
			<label class="muted" for="games-limit">Show</label>
			<Select.Root value={String(showLimit)} onValueChange={(v: string) => { showLimit = Number(v); }}>
				<Select.Trigger>{showLimit === 0 ? m.admin_filter_all() : String(showLimit)}</Select.Trigger>
				<Select.Content>
					<Select.Item value="10" label="10" />
					<Select.Item value="25" label="25" />
					<Select.Item value="50" label="50" />
					<Select.Item value="100" label="100" />
					<Select.Item value="0" label={m.admin_filter_all()} />
				</Select.Content>
			</Select.Root>
			<span class="muted results-count">Showing {visible.length} of {filtered.length} games</span>
		</div>

		{#if loading}
			<div class="center-sm"><div class="spinner"></div></div>
		{:else if filtered.length === 0}
			<div class="empty">
				<span class="empty__icon"><Gamepad2 size={36} /></span>
				<h3>{searchInput || activeLetter ? 'No matches' : 'No games found'}</h3>
				<p class="muted">{searchInput || activeLetter ? 'Try a different search term or letter.' : (userRole?.moderator ? 'No games assigned to you yet.' : 'Games will appear here once added to Supabase.')}</p>
			</div>
		{:else}
			<div class="games-grid">
				{#each visible as g}
					<a href={localizeHref(`/admin/game-editor/${g.game_id}`)} class="game-tile" class:game-tile--frozen={g.frozen_at}>
						{#if g.cover}
							<div class="game-tile__cover" style="background-image: url({g.cover})"></div>
						{:else}
							<div class="game-tile__cover game-tile__cover--empty"><Gamepad2 size={24} /></div>
						{/if}
						<div class="game-tile__info">
							<span class="game-tile__name">{g.game_name || g.game_id}</span>
							<span class="game-tile__meta">
								<span class="status-dot status-dot--{g.status?.toLowerCase()?.replace(/\s+/g, '-')}"></span>
								{g.status || 'Unknown'}
								{#if g.frozen_at}<span class="frozen-badge"><Lock size={10} style="display:inline-block;vertical-align:-0.125em;" /> FROZEN</span>{/if}
							</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<AlertDialog.Root bind:open={freezeConfirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{allFrozen ? 'Unfreeze All Games' : 'Freeze All Games'}</AlertDialog.Title>
		<AlertDialog.Description>
			{#if allFrozen}
				Unfreeze ALL {frozenCount} frozen games? Edits will be allowed again.
			{:else}
				Freeze ALL {games.length} games? This blocks all edits site-wide until unfrozen.
			{/if}
		</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="btn btn--danger" onclick={executeFreezeAll}>
				{allFrozen ? 'Unfreeze All' : 'Freeze All'}
			</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h2 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
	.role-notice { padding: 0.6rem 1rem; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; font-size: 0.85rem; color: var(--fg); margin-bottom: 1rem; }
	.search-bar { position: relative; margin-bottom: 1.5rem; }
	.search-bar__input { width: 100%; padding: 0.6rem 0.9rem; padding-right: 2.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--fg); font-size: 0.95rem; font-family: inherit; box-sizing: border-box; }
	.search-bar__input:focus { outline: none; border-color: var(--accent); }
	.search-bar__input::placeholder { color: var(--muted); }
	.search-bar__clear { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.9rem; }
	.search-bar__clear:hover { color: var(--fg); }
	.games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
	.game-tile { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; text-decoration: none; color: var(--fg); transition: border-color 0.15s, transform 0.15s; }
	.game-tile:hover { border-color: var(--accent); transform: translateY(-2px); }
	.game-tile--frozen { border-color: #ef4444; opacity: 0.75; }
	.game-tile--frozen:hover { border-color: #ef4444; }
	.game-tile__cover { aspect-ratio: 460/215; background-size: cover; background-position: center; }
	.game-tile__cover--empty { display: flex; align-items: center; justify-content: center; background: var(--bg); font-size: 2rem; }
	.game-tile__info { padding: 0.75rem; }
	.game-tile__name { display: block; font-weight: 700; font-size: 0.95rem; margin-bottom: 0.25rem; }
	.game-tile__meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--muted); flex-wrap: wrap; }
	.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
	.status-dot--active { background: #22c55e; }
	.status-dot--inactive { background: #ef4444; }
	.status-dot--coming-soon { background: #eab308; }
	.frozen-badge { background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; }
	.freeze-all-bar {
		display: flex; align-items: center; justify-content: space-between; gap: 1rem;
		padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 8px; margin-bottom: 1rem; flex-wrap: wrap;
	}
	.freeze-all-count { font-size: 0.85rem; font-weight: 600; color: #ef4444; }
	.freeze-all-btn { font-size: 0.85rem; padding: 0.4rem 0.8rem; }
	.freeze-all-btn--frozen { border-color: #22c55e; color: #22c55e; }
	.results-controls {
		display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;
	}
	.results-count { margin-left: auto; font-size: 0.9rem; }
	.empty { text-align: center; padding: 3rem 1rem; } .empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; } .empty h3 { margin: 0 0 0.5rem; }
	@media (max-width: 480px) { .games-grid { grid-template-columns: 1fr 1fr; } }
</style>
