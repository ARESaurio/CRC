<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading, user } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, Pencil, Eye, EyeOff, AlertTriangle, X, Search, Save, Shield, Clock, ArrowLeft, Sparkles, RefreshCw, Video, Clipboard, Trash2, Send} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import StatusFilterTabs from '$lib/components/StatusFilterTabs.svelte';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

	let checking = $state(true);
	let authorized = $state(false);
	let isSuperAdmin = $state(false);
	let isAdmin = $state(false);
	let roleLabel = $state('');

	/** game_ids this user can approve runs for (from role_game_verifiers) */
	let assignedGameIds = $state<Set<string>>(new Set());

	/** Can the current user take action on a specific run? */
	function canActOnRun(run: any): boolean {
		if (isSuperAdmin || isAdmin) return true;
		return assignedGameIds.has(run.game_id);
	}

	// ── Data ──────────────────────────────────────────────────────────────────
	type RunStatus = 'pending' | 'rejected' | 'needs_changes' | 'published' | 'verified' | 'all';
	let runs = $state<any[]>([]);
	let approvedRuns = $state<any[]>([]);
	let loading = $state(false);
	let statusFilter = $state<RunStatus>('pending');
	let gameFilter = $state('');
	let gameFilterSearch = $state('');
	let gameFilterOpen = $state(false);
	let dateFrom = $state('');
	let dateTo = $state('');
	let expandedId = $state<string | null>(null);
	let processingId = $state<string | null>(null);
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// ── Modals ────────────────────────────────────────────────────────────────
	let rejectModalOpen = $state(false);
	let editModalOpen = $state(false);
	let unverifyModalOpen = $state(false);
	let editDiffStep = $state(false);
	let modalRunId = $state<string | null>(null);
	let modalInfo = $state('');
	let rejectReason = $state('');
	let rejectNotes = $state('');
	let editFields = $state<Record<string, any>>({});
	let originalFields = $state<Record<string, any>>({});
	let editNotes = $state('');
	let unverifyReason = $state('');
	let unverifyNotes = $state('');

	// ── Reusable confirm dialog ───────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmVariant = $state<'approve' | 'danger'>('approve');
	let confirmCallback = $state<(() => Promise<void>) | null>(null);

	function openConfirm(title: string, desc: string, variant: 'approve' | 'danger', cb: () => Promise<void>) {
		confirmTitle = title;
		confirmDesc = desc;
		confirmVariant = variant;
		confirmCallback = cb;
		confirmOpen = true;
	}
	async function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) await confirmCallback();
		confirmCallback = null;
	}

	const modalRun = $derived(runs.find(r => r.public_id === modalRunId) || approvedRuns.find(r => r.public_id === modalRunId));

	// ── Combobox state for edit modal ──
	let editCharSearch = $state(''); let editCharFilterText = $state('');
	let editChallengeSearch = $state(''); let editChallengeFilterText = $state('');
	let editRestrictionSearch = $state(''); let editRestrictionFilterText = $state('');
	let editGlitchSearch = $state(''); let editGlitchFilterText = $state('');

	/** Fields tracked for diff comparison */
	const EDITABLE_FIELDS = [
		{ key: 'category_tier', label: 'Tier', type: 'select' },
		{ key: 'category_slug', label: 'Category', type: 'select' },
		{ key: 'character', label: 'Character', type: 'select' },
		{ key: 'difficulty', label: 'Difficulty', type: 'select' },
		{ key: 'time_primary', label: 'Primary Time', type: 'text' },
		{ key: 'time_rta', label: 'RTA Time', type: 'text' },
		{ key: 'date_completed', label: 'Date Completed', type: 'date' },
		{ key: 'standard_challenges', label: 'Challenges', type: 'multi' },
		{ key: 'glitch_id', label: 'Glitch Category', type: 'select' },
		{ key: 'restrictions', label: 'Restrictions', type: 'multi' },
		{ key: 'platform', label: 'Platform', type: 'select' },
	];

	/** Get fields that were actually changed */
	let editedFields = $derived.by(() => {
		const changed: { key: string; label: string; from: any; to: any }[] = [];
		for (const f of EDITABLE_FIELDS) {
			const orig = originalFields[f.key];
			const edit = editFields[f.key];
			if (f.type === 'multi') {
				const a = JSON.stringify((orig || []).slice().sort());
				const b = JSON.stringify((edit || []).slice().sort());
				if (a !== b) changed.push({ key: f.key, label: f.label, from: orig || [], to: edit || [] });
			} else {
				if ((orig || '') !== (edit || '')) changed.push({ key: f.key, label: f.label, from: orig || '', to: edit || '' });
			}
		}
		return changed;
	});

	// ── Pagination ───────────────────────────────────────────────────────────
	let pageSize = $state(10);
	let currentPage = $state(1);

	// ── Derived ───────────────────────────────────────────────────────────────
	// Exclude pending_runs that already exist in approved runs (stale records)
	let approvedPublicIds = $derived(new Set(approvedRuns.map(r => r.public_id).filter(Boolean)));
	let approvedSubmissionIds = $derived(new Set(approvedRuns.map(r => r.submission_id).filter(Boolean)));
	let activePendingRuns = $derived(runs.filter(r =>
		r.status !== 'approved' && !approvedPublicIds.has(r.public_id) && !approvedSubmissionIds.has(r.submission_id)
	));

	let filteredRuns = $derived.by(() => {
		let result: any[];
		if (statusFilter === 'published') {
			result = approvedRuns.filter(r => !r.verified);
		} else if (statusFilter === 'verified') {
			result = approvedRuns.filter(r => r.verified);
		} else if (statusFilter === 'all') {
			const actionable = activePendingRuns.filter(r => ['pending', 'rejected', 'needs_changes'].includes(r.status));
			result = [...actionable, ...approvedRuns];
		} else {
			result = activePendingRuns.filter(r => r.status === statusFilter);
		}
		// Non-admin/super-admin users only see rejected runs for their assigned games
		if (statusFilter === 'rejected' && !isSuperAdmin && !isAdmin && assignedGameIds.size > 0) {
			result = result.filter(r => assignedGameIds.has(r.game_id));
		}
		if (gameFilter) result = result.filter(r => r.game_id === gameFilter);
		if (dateFrom) {
			result = result.filter(r => r.submitted_at >= dateFrom);
		}
		if (dateTo) {
			result = result.filter(r => r.submitted_at <= dateTo + 'T23:59:59');
		}
		return result;
	});

	let paginatedRuns = $derived(filteredRuns.slice((currentPage - 1) * pageSize, currentPage * pageSize));

	let pendingCount = $derived(activePendingRuns.filter(r => r.status === 'pending').length);
	let publishedCount = $derived(approvedRuns.filter(r => !r.verified).length);
	let verifiedCount = $derived(approvedRuns.filter(r => r.verified).length);
	let rejectedCount = $derived(activePendingRuns.filter(r => r.status === 'rejected').length);
	let changesCount = $derived(activePendingRuns.filter(r => r.status === 'needs_changes').length);
	let allCount = $derived(activePendingRuns.filter(r => ['pending', 'rejected', 'needs_changes'].includes(r.status)).length + approvedRuns.length);

	let runTabs = $derived([
		{ value: 'pending', label: 'Pending', count: pendingCount },
		{ value: 'published', label: 'Published', count: publishedCount },
		{ value: 'needs_changes', label: 'Needs Changes', count: changesCount },
		{ value: 'verified', label: 'Active', count: verifiedCount },
		{ value: 'rejected', label: 'Rejected', count: rejectedCount },
		{ value: 'all', label: 'All', count: allCount },
	]);

	let gameOptions = $derived.by(() => {
		const allRuns = [...runs, ...approvedRuns];
		const ids = [...new Set(allRuns.map(r => r.game_id).filter(Boolean))].sort();
		return ids;
	});

	let filteredGameOptions = $derived.by(() => {
		const q = gameFilterSearch.trim().toLowerCase();
		if (!q) return gameOptions;
		return gameOptions.filter(id => id.toLowerCase().includes(q) || fmt(id).toLowerCase().includes(q));
	});

	// ── Helpers ───────────────────────────────────────────────────────────────
	function fmt(id: string): string {
		return (id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}
	function fmtTier(tier: string): string {
		const map: Record<string, string> = { full_runs: 'Full Runs', mini_challenges: 'Mini-Challenges', player_made: 'Player-Made' };
		return map[tier] || fmt(tier);
	}
	function fmtDate(d: string): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
	function fmtAgo(d: string): string {
		if (!d) return '—';
		const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
		if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
		return fmtDate(d);
	}
	function fmtArray(arr: any): string {
		if (!arr || !Array.isArray(arr) || arr.length === 0) return '—';
		return arr.map((s: string) => fmt(s)).join(', ');
	}
	function wasEdited(run: any): boolean {
		return !!(run.updated_at && run.submitted_at && run.updated_at !== run.submitted_at);
	}
	function getVideoEmbed(url: string): string | null {
		if (!url) return null;
		try {
			const u = new URL(url);
			const host = u.hostname.replace(/^www\./, '').toLowerCase();
			// YouTube (standard, shorts, youtu.be)
			if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
				let id: string | null = null;
				if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
				else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/shorts/')[1]?.split(/[/?]/)[0] || null;
				else id = u.searchParams.get('v');
				return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
			}
			// Twitch videos
			if (host === 'twitch.tv' && u.pathname.includes('/videos/')) {
				const vid = u.pathname.split('/videos/')[1]?.split(/[/?]/)[0];
				return vid ? `https://player.twitch.tv/?video=${vid}&parent=www.challengerun.net&parent=challengerun.net` : null;
			}
			// Twitch clips
			if (host === 'clips.twitch.tv') {
				const clip = u.pathname.slice(1).split(/[/?]/)[0];
				return clip ? `https://clips.twitch.tv/embed?clip=${clip}&parent=www.challengerun.net&parent=challengerun.net` : null;
			}
			if (host === 'twitch.tv' && u.pathname.includes('/clip/')) {
				const clip = u.pathname.split('/clip/')[1]?.split(/[/?]/)[0];
				return clip ? `https://clips.twitch.tv/embed?clip=${clip}&parent=www.challengerun.net&parent=challengerun.net` : null;
			}
			// Bilibili
			if (host === 'bilibili.com' || host === 'b23.tv') {
				const bvMatch = u.pathname.match(/\/(BV[a-zA-Z0-9]+)/);
				return bvMatch ? `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&high_quality=1` : null;
			}
		} catch { /* ignore */ }
		return null;
	}

	/** Strip tracking / source-identifier params from video URLs for display */
	function cleanVideoUrl(url: string): string {
		if (!url) return url;
		try {
			const u = new URL(url);
			const strip = ['si', 'feature', 'list', 'index', 'pp', 'ab_channel',
				'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
				'tt_content', 'tt_medium', 'fbclid', 'gclid'];
			for (const p of strip) u.searchParams.delete(p);
			// Return clean URL — drop empty search string
			return u.searchParams.toString() ? u.origin + u.pathname + '?' + u.searchParams.toString() : u.origin + u.pathname;
		} catch { return url; }
	}

	// ── Game configs (for "Not Applicable" logic) ────────────────────────────
	let gameConfigs = $state<Record<string, any>>({});

	// ── Helpers for "Not Applicable" ──────────────────────────────────────────
	function fieldApplicable(run: any, field: string): boolean {
		const g = gameConfigs[run.game_id];
		if (!g) return true; // if we don't have config, assume applicable
		switch (field) {
			case 'character': return !!(g.character_column?.enabled && g.characters_data?.length);
			case 'difficulty': return !!(g.difficulty_column?.enabled && g.difficulties_data?.length);
			case 'challenges': return !!(g.challenges_data?.length);
			case 'glitch': return !!(g.glitches_data?.length);
			case 'restrictions': return !!(g.restrictions_data?.length);
			case 'platform': return true; // always applicable
			default: return true;
		}
	}
	function fieldValue(run: any, field: string, rawValue: string): string {
		if (!fieldApplicable(run, field)) return 'n/a';
		return rawValue;
	}

	// ── Edit Modal: Typeahead Helpers ──

	const PLATFORM_OPTIONS: { slug: string; label: string }[] = [
		{ slug: '3do', label: '3DO' }, { slug: 'android', label: 'Android' },
		{ slug: 'atari-2600', label: 'Atari 2600' }, { slug: 'atari-7600', label: 'Atari 7600' },
		{ slug: 'atari-lynx', label: 'Atari Lynx' }, { slug: 'atari-jaguar', label: 'Atari: Jaguar' },
		{ slug: 'colecovision', label: 'ColecoVision' }, { slug: 'fairchild-channel-f', label: 'Fairchild Channel F' },
		{ slug: 'nintendo-game-boy', label: 'Game Boy' }, { slug: 'nintendo-game-boy-advance', label: 'Game Boy Advance' },
		{ slug: 'nintendo-game-boy-color', label: 'Game Boy Color' }, { slug: 'sega-game-gear', label: 'Game Gear' },
		{ slug: 'sega-genesis-nomad', label: 'Genesis Nomad' }, { slug: 'intellivision', label: 'Intellivision' },
		{ slug: 'magnavox-odyssey-2', label: 'Magnavox Odyssey 2' }, { slug: 'n-gage', label: 'N-Gage' },
		{ slug: 'nintendo-entertainment-system', label: 'NES' }, { slug: 'neo-geo', label: 'Neo Geo' },
		{ slug: 'neo-geo-pocket', label: 'Neo Geo Pocket' }, { slug: 'neo-geo-x', label: 'Neo Geo X' },
		{ slug: 'nintendo-3ds', label: 'Nintendo 3DS' }, { slug: 'nintendo-64', label: 'Nintendo 64' },
		{ slug: 'nintendo-ds', label: 'Nintendo DS' }, { slug: 'nintendo-gamecube', label: 'Nintendo GameCube' },
		{ slug: 'nintendo-switch', label: 'Nintendo Switch' }, { slug: 'nintendo-switch-2', label: 'Nintendo Switch 2' },
		{ slug: 'nintendo-wii', label: 'Nintendo Wii' }, { slug: 'nintendo-wii-u', label: 'Nintendo Wii U' },
		{ slug: 'pc-epic-games', label: 'PC: Epic Games' }, { slug: 'pc-gog', label: 'PC: GOG' },
		{ slug: 'pc-other', label: 'PC: Other' }, { slug: 'pc-steam', label: 'PC: Steam' },
		{ slug: 'playstation', label: 'PlayStation' }, { slug: 'playstation-2', label: 'PlayStation 2' },
		{ slug: 'playstation-3', label: 'PlayStation 3' }, { slug: 'playstation-4', label: 'PlayStation 4' },
		{ slug: 'playstation-5', label: 'PlayStation 5' }, { slug: 'playstation-portable', label: 'PlayStation Portable' },
		{ slug: 'playstation-vita', label: 'PlayStation Vita' }, { slug: 'rog-xbox-ally', label: 'ROG Xbox Ally' },
		{ slug: 'super-nintendo-entertainment-system', label: 'SNES' }, { slug: 'sega-dreamcast', label: 'Sega Dreamcast' },
		{ slug: 'sega-genesis', label: 'Sega Genesis' }, { slug: 'sega-saturn', label: 'Sega Saturn' },
		{ slug: 'sega-master-system', label: 'Sega: Master System' }, { slug: 'steam-deck', label: 'Steam Deck' },
		{ slug: 'nec-turboexpress', label: 'TurboExpress' }, { slug: 'turbografx-16', label: 'TurboGrafx-16' },
		{ slug: 'bandai-wonderswan', label: 'WonderSwan' }, { slug: 'xbox', label: 'Xbox' },
		{ slug: 'xbox-360', label: 'Xbox 360' }, { slug: 'xbox-one', label: 'Xbox One' },
		{ slug: 'xbox-series-x-s', label: 'Xbox Series X|S' }, { slug: 'ios', label: 'iOS' },
	];

	function norm(s: string): string { return (s || '').toLowerCase().replace(/[-_]/g, ''); }

	function taFilter(items: { slug: string; label: string; group?: string }[], search: string, excludeSlugs?: string[]): typeof items {
		let list = items;
		if (excludeSlugs?.length) list = list.filter(i => !excludeSlugs.includes(i.slug));
		if (!search) return list.slice(0, 20);
		const q = norm(search);
		return list.filter(i => norm(i.label).includes(q) || norm(i.slug).includes(q) || (i.group && norm(i.group).includes(q))).slice(0, 20);
	}

	/** Get categories filtered by the currently selected tier */
	function getCategoryOptions(gameId: string, tier: string): { slug: string; label: string }[] {
		const g = gameConfigs[gameId];
		if (!g) return [];
		switch (tier) {
			case 'full_runs':
				return (g.full_runs || []).map((c: any) => ({ slug: c.slug, label: c.label }));
			case 'mini_challenges': {
				const cats: { slug: string; label: string }[] = [];
				for (const group of (g.mini_challenges || [])) {
					if (group.children?.length) {
						for (const child of group.children) cats.push({ slug: child.slug, label: `${group.label} › ${child.label}` });
					} else {
						cats.push({ slug: group.slug, label: group.label });
					}
				}
				return cats;
			}
			case 'player_made':
				return (g.player_made || []).map((c: any) => ({ slug: c.slug, label: c.label }));
			default: return [];
		}
	}

	/** Flatten restrictions (supports parent-child): both parent and children are selectable.
	 *  Parents with children also appear as a standalone option (e.g. "One God Only").
	 *  Children show their parent as a group label (e.g. "One God Only › Hestia Only"). */
	function flattenRestrictions(data: any[]): { slug: string; label: string; group?: string }[] {
		const result: { slug: string; label: string; group?: string }[] = [];
		for (const r of (data || [])) {
			// Parent is always selectable
			result.push({ slug: r.slug, label: r.label });
			// Children are also selectable, shown under the parent group
			if (r.children?.length) {
				for (const child of r.children) {
					result.push({ slug: child.slug, label: child.label, group: r.label });
				}
			}
		}
		return result;
	}

	/** Get flat items for a game config field */
	function getItems(gameId: string, field: 'characters_data' | 'challenges_data' | 'glitches_data'): { slug: string; label: string }[] {
		const g = gameConfigs[gameId];
		if (!g?.[field]?.length) return [];
		return g[field].map((c: any) => ({ slug: c.slug || c.id || c.label, label: c.label || c.name || c.slug }));
	}

	/** Add/remove from an array field in editFields */
	function editAddMulti(key: string, slug: string) {
		const arr = [...(editFields[key] || [])];
		if (!arr.includes(slug)) arr.push(slug);
		editFields = { ...editFields, [key]: arr };
	}
	function editRemoveMulti(key: string, slug: string) {
		editFields = { ...editFields, [key]: (editFields[key] || []).filter((s: string) => s !== slug) };
	}

	/** Set a single-value field */
	function editSet(key: string, value: string) {
		editFields = { ...editFields, [key]: value };
	}

	/** Look up a slug's label from an items list */
	function labelFor(slug: string, items: { slug: string; label: string }[]): string {
		return items.find(i => i.slug === slug)?.label || fmt(slug);
	}

	/** Resolve a slug to a human label using the game config for the modal run */
	function diffLabel(fieldKey: string, value: string): string {
		if (!value) return '—';
		const g = modalRun ? gameConfigs[modalRun.game_id] : null;
		if (!g) return fmt(value);
		switch (fieldKey) {
			case 'category_slug': {
				for (const c of (g.full_runs || [])) { if (c.slug === value) return c.label; }
				for (const grp of (g.mini_challenges || [])) {
					if (grp.slug === value) return grp.label;
					for (const ch of (grp.children || [])) { if (ch.slug === value) return `${grp.label} › ${ch.label}`; }
				}
				for (const c of (g.player_made || [])) { if (c.slug === value) return c.label; }
				return fmt(value);
			}
			case 'character': return labelFor(value, getItems(modalRun!.game_id, 'characters_data'));
			case 'difficulty': return labelFor(value, (g.difficulties_data || []).map((d: any) => ({ slug: d.slug, label: d.label })));
			case 'standard_challenges': return labelFor(value, getItems(modalRun!.game_id, 'challenges_data'));
			case 'restrictions': return labelFor(value, flattenRestrictions(g.restrictions_data || []));
			case 'glitch_id': return labelFor(value, getItems(modalRun!.game_id, 'glitches_data'));
			case 'platform': return PLATFORM_OPTIONS.find(p => p.slug === value)?.label || fmt(value);
			default: return fmt(value);
		}
	}

	// ── Data Loading ──────────────────────────────────────────────────────────
	async function loadRuns() {
		loading = true;
		try {
			// Always load all statuses so tab counts are accurate; filter client-side
			const { data, error } = await supabase
				.from('pending_runs')
				.select('*')
				.order('submitted_at', { ascending: false })
				.limit(500);

			if (!error && data) {

				// Resolve claimed_by UUIDs to runner_ids
				const claimerIds = [...new Set(data.filter((r: any) => r.claimed_by).map((r: any) => r.claimed_by))];
				let claimerMap: Record<string, string> = {};
				if (claimerIds.length > 0) {
					const { data: profiles } = await supabase.from('profiles').select('user_id, runner_id, display_name').in('user_id', claimerIds);
					for (const p of (profiles || [])) {
						claimerMap[p.user_id] = p.runner_id || p.display_name || 'Staff';
					}
				}

				runs = data.map((r: any) => ({
					...r,
					claimed_by_name: r.claimed_by ? (claimerMap[r.claimed_by] || 'Staff') : null
				}));

				// Load game configs for "Not Applicable" logic
				const gameIds = [...new Set(data.map((r: any) => r.game_id).filter(Boolean))];
				if (gameIds.length > 0) {
					const { data: games } = await supabase.from('games').select('game_id, character_column, characters_data, difficulty_column, difficulties_data, challenges_data, glitches_data, restrictions_data, full_runs, mini_challenges, player_made').in('game_id', gameIds);
					const configs: Record<string, any> = {};
					for (const g of (games || [])) configs[g.game_id] = g;
					gameConfigs = configs;
				}
			}
		} catch { /* ignore */ }
		loading = false;
	}

	async function loadApprovedRuns() {
		try {
			const { data, error } = await supabase
				.from('runs')
				.select('*')
				.eq('status', 'approved')
				.order('verified', { ascending: true, nullsFirst: true })
				.order('submitted_at', { ascending: false })
				.limit(500);

			if (!error && data) {
				// Column names now match between pending_runs and runs
				approvedRuns = data.map((r: any) => ({
					...r,
					_source: 'approved'
				}));

				// Load game configs for any new game IDs from approved runs
				const approvedGameIds = [...new Set(data.map((r: any) => r.game_id).filter(Boolean))];
				const missingGameIds = approvedGameIds.filter(id => !gameConfigs[id]);
				if (missingGameIds.length > 0) {
					const { data: games } = await supabase.from('games').select('game_id, character_column, characters_data, difficulty_column, difficulties_data, challenges_data, glitches_data, restrictions_data, full_runs, mini_challenges, player_made').in('game_id', missingGameIds);
					for (const g of (games || [])) gameConfigs[g.game_id] = g;
				}
			}
		} catch { /* ignore */ }
	}

	// ── Actions ───────────────────────────────────────────────────────────────
	async function approveRun(id: string) {
		openConfirm('Publish Run', 'Publish this run? It will appear on the site but still needs moderator verification.', 'approve', async () => {
			processingId = id;
			actionMessage = null;
			const result = await adminAction('/admin/approve-run', { run_id: id });
			if (result.ok) {
				runs = runs.filter(r => r.public_id !== id);
				loadApprovedRuns();
				actionMessage = { type: 'success', text: 'Run published! Awaiting moderator verification.' };
			} else {
				actionMessage = { type: 'error', text: result.message };
			}
			processingId = null;
			setTimeout(() => actionMessage = null, 3000);
		});
	}

	async function verifyRun(id: string) {
		openConfirm('Verify Run', 'Verify this run? This confirms a game moderator has reviewed it.', 'approve', async () => {
			processingId = id;
			actionMessage = null;
			const result = await adminAction('/admin/verify-run', { run_id: id });
			if (result.ok) {
				approvedRuns = approvedRuns.map(r => r.public_id === id ? { ...r, verified: true, verified_at: new Date().toISOString() } : r);
				actionMessage = { type: 'success', text: 'Run verified!' };
			} else {
				actionMessage = { type: 'error', text: result.message };
			}
			processingId = null;
			setTimeout(() => actionMessage = null, 3000);
		});
	}

	function openUnverifyModal(run: any) {
		modalRunId = run.public_id;
		modalInfo = `${fmt(run.game_id)} by ${run.runner_id}`;
		unverifyReason = '';
		unverifyNotes = '';
		unverifyModalOpen = true;
	}

	async function submitUnverify() {
		if (!modalRunId || !unverifyReason) return;
		processingId = modalRunId;
		actionMessage = null;
		const result = await adminAction('/admin/unverify-run', {
			run_id: modalRunId, reason: unverifyReason, notes: unverifyNotes.trim() || undefined
		});
		if (result.ok) {
			approvedRuns = approvedRuns.map(r => r.public_id === modalRunId ? { ...r, verified: false, verified_by: null, verified_at: null } : r);
			actionMessage = { type: 'success', text: 'Verification revoked.' };
		} else {
			actionMessage = { type: 'error', text: result.message };
		}
		unverifyModalOpen = false;
		processingId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	function openRejectModal(run: any) {
		modalRunId = run.public_id;
		modalInfo = `${fmt(run.game_id)} by ${run.runner_id}`;
		rejectReason = '';
		rejectNotes = '';
		rejectModalOpen = true;
	}

	async function confirmReject() {
		if (!modalRunId || !rejectReason) return;
		processingId = modalRunId;
		const result = await adminAction('/admin/reject-run', {
			run_id: modalRunId, reason: rejectReason, notes: rejectNotes.trim() || undefined
		});
		if (result.ok) {
			runs = runs.map(r => r.public_id === modalRunId ? { ...r, status: 'rejected', rejection_reason: rejectReason, verifier_notes: rejectNotes } : r);
			actionMessage = { type: 'success', text: 'Run rejected.' };
		} else {
			actionMessage = { type: 'error', text: result.message };
		}
		rejectModalOpen = false;
		processingId = null;
		modalRunId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	function openEditModal(run: any) {
		modalRunId = run.public_id;
		modalInfo = `${fmt(run.game_id)} by ${run.runner_id}`;
		editNotes = '';
		editDiffStep = false;
		// Reset combobox state
		editCharSearch = ''; editCharFilterText = '';
		editChallengeSearch = ''; editChallengeFilterText = '';
		editRestrictionSearch = ''; editRestrictionFilterText = '';
		editGlitchSearch = ''; editGlitchFilterText = '';
		const fields: Record<string, any> = {};
		const orig: Record<string, any> = {};
		for (const f of EDITABLE_FIELDS) {
			if (f.type === 'multi') {
				fields[f.key] = [...(run[f.key] || [])];
				orig[f.key] = [...(run[f.key] || [])];
			} else {
				fields[f.key] = run[f.key] || '';
				orig[f.key] = run[f.key] || '';
			}
		}
		editFields = fields;
		originalFields = orig;
		// Pre-fill typeahead search text for single-select fields
		const g = gameConfigs[run.game_id];
		if (run.character && g?.characters_data) {
			const ch = g.characters_data.find((c: any) => c.slug === run.character);
			if (ch) editCharSearch = ch.label;
		}
		if (run.glitch_id && g?.glitches_data) {
			const gl = g.glitches_data.find((gl: any) => gl.slug === run.glitch_id);
			if (gl) editGlitchSearch = gl.label;
		}
		editModalOpen = true;
	}

	function showEditDiff() {
		if (editedFields.length === 0 && !editNotes.trim()) return;
		editDiffStep = true;
	}

	async function confirmEdit() {
		if (!modalRunId) return;
		processingId = modalRunId;
		const isApprovedRun = modalRun?._source === 'approved';

		// Build the update payload (only changed fields)
		const updates: Record<string, any> = {};
		for (const f of editedFields) updates[f.key] = editFields[f.key] || null;

		if (Object.keys(updates).length > 0) {
			if (isApprovedRun) {
				// ── Approved run: field names now match; sync duplicate columns in runs table ──
				const edits: Record<string, any> = {};
				for (const [key, value] of Object.entries(updates)) {
					edits[key] = value;
					// runs table has duplicate columns that need to stay in sync
					if (key === 'date_completed') edits.date_submitted = value;
					if (key === 'category_slug') edits.category = value;
				}

				const result = await adminAction('/admin/edit-approved-run', {
					run_id: modalRunId,
					edits,
					notes: editNotes.trim() || `Fields edited: ${editedFields.map(f => f.label).join(', ')}`
				});

				if (result.ok) {
					approvedRuns = approvedRuns.map(r => r.public_id === modalRunId ? { ...r, ...updates } : r);
					actionMessage = { type: 'success', text: `Approved run updated (${editedFields.length} field${editedFields.length !== 1 ? 's' : ''} changed).` };
				} else {
					actionMessage = { type: 'error', text: result.message };
					processingId = null;
					return;
				}
			} else {
				// ── Pending run: call Worker (handles audit log + runner notification) ──
				const edits: Record<string, any> = {};
				for (const [key, value] of Object.entries(updates)) {
					if (key === 'updated_at') continue;
					edits[key] = value;
				}

				const result = await adminAction('/admin/staff-edit-pending-run', {
					run_id: modalRunId,
					edits,
					notes: editNotes.trim() || `Fields edited: ${editedFields.map(f => f.label).join(', ')}`
				});

				if (result.ok) {
					runs = runs.map(r => r.public_id === modalRunId ? { ...r, ...updates } : r);
					actionMessage = { type: 'success', text: `Run updated (${editedFields.length} field${editedFields.length !== 1 ? 's' : ''} changed).` };
				} else {
					actionMessage = { type: 'error', text: result.message };
					processingId = null;
					return;
				}
			}
		} else if (editNotes.trim() && !isApprovedRun) {
			// Notes only, no field changes — behave like old "Request Changes" (pending only)
			const result = await adminAction('/admin/request-changes', {
				run_id: modalRunId, notes: editNotes.trim()
			});
			if (result.ok) {
				runs = runs.map(r => r.public_id === modalRunId ? { ...r, status: 'needs_changes', verifier_notes: editNotes } : r);
				actionMessage = { type: 'success', text: 'Changes requested.' };
			} else {
				actionMessage = { type: 'error', text: result.message };
			}
		}

		editModalOpen = false;
		processingId = null;
		modalRunId = null;
		setTimeout(() => actionMessage = null, 4000);
	}

	async function claimRun(id: string) {
		processingId = id;
		actionMessage = null;
		try {
			const { data: { user: u } } = await supabase.auth.getUser();
			if (!u) throw new Error('Not authenticated');

			// Look up runner_id from profiles
			const { data: profile } = await supabase.from('profiles').select('runner_id, display_name').eq('user_id', u.id).single();
			const claimName = profile?.runner_id || profile?.display_name || 'Unknown';

			const { error } = await supabase.from('pending_runs').update({
				claimed_by: u.id,
				claimed_at: new Date().toISOString()
			}).eq('public_id', id);
			if (error) throw error;
			runs = runs.map(r => r.public_id === id ? { ...r, claimed_by: u.id, claimed_by_name: claimName, claimed_at: new Date().toISOString() } : r);
			actionMessage = { type: 'success', text: 'Run claimed for review.' };
		} catch (e: any) {
			actionMessage = { type: 'error', text: `Claim failed: ${e.message}` };
		}
		processingId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	async function deleteRun(run: any) {
		const source = run._source === 'approved' ? 'runs' : 'pending_runs';
		const label = `${run.game_id} by ${run.runner_id || run.runner} (${run.category_slug || run.category})`;
		openConfirm('Delete Run', `Permanently delete this run?\n\n${label}\n\nThis cannot be undone.`, 'danger', async () => {
			processingId = run.public_id;
			actionMessage = null;
			try {
				const { error } = await supabase.from(source).delete().eq('public_id', run.public_id);
				if (error) throw error;
				if (source === 'runs') {
					approvedRuns = approvedRuns.filter(r => r.public_id !== run.public_id);
				} else {
					runs = runs.filter(r => r.public_id !== run.public_id);
				}
				actionMessage = { type: 'success', text: 'Run deleted.' };
			} catch (e: any) {
				actionMessage = { type: 'error', text: `Delete failed: ${e.message}` };
			}
			processingId = null;
			setTimeout(() => actionMessage = null, 3000);
		});
	}

	// ── Init ──────────────────────────────────────────────────────────────────
	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/runs'); return; }
				const role = await checkAdminRole();
				authorized = !!(role?.admin || role?.verifier || role?.moderator);
				isSuperAdmin = !!role?.superAdmin;
				isAdmin = !!role?.admin;
				roleLabel = role?.superAdmin ? 'Super Admin' : role?.admin ? 'Admin' : role?.moderator ? 'Moderator' : role?.verifier ? 'Verifier' : '';

				// Load game assignments for verifiers/moderators
				if (authorized && !role?.superAdmin && !role?.admin) {
					try {
						const { data: vGames } = await supabase
							.from('role_game_verifiers')
							.select('game_id')
							.eq('user_id', sess.user.id);
						assignedGameIds = new Set((vGames || []).map((r: any) => r.game_id));
					} catch { /* assignedGameIds stays empty */ }
				}

				checking = false;
				if (authorized) { loadRuns(); loadApprovedRuns(); }
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>{m.admin_runs_title()}</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}><ArrowLeft size={14} /> {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_verifier_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>{m.admin_runs_heading()}</h1>
		<p class="muted mb-2">
			Review pending runs, publish approved runs, and manage verification.
			{#if !isSuperAdmin && !isAdmin && assignedGameIds.size > 0}
				You have {assignedGameIds.size} assigned game{assignedGameIds.size !== 1 ? 's' : ''}.
			{/if}
		</p>

		{#if actionMessage}
			<div class="toast toast--{actionMessage.type}">{actionMessage.text}</div>
		{/if}

		<!-- Status Tabs + Filters -->
		<div class="filters card">
			<div class="filters__row">
				<StatusFilterTabs tabs={runTabs} bind:value={statusFilter} totalItems={filteredRuns.length} bind:pageSize bind:currentPage />
				<div class="filters__controls">
					<div class="combobox-wrap" style="min-width: 200px;">
						<Combobox.Root bind:value={gameFilter} bind:inputValue={gameFilterSearch} bind:open={gameFilterOpen} onValueChange={(v: string) => { if (!v) gameFilterSearch = ''; }}>
							<Combobox.Input placeholder={m.admin_all_games()} />
							<Combobox.Content>
								<Combobox.Item value="">
									<span style="color: var(--muted);">{m.admin_all_games()}</span>
								</Combobox.Item>
								{#each filteredGameOptions as gid}
									<Combobox.Item value={gid} forceMount>{fmt(gid)}</Combobox.Item>
								{/each}
								{#if filteredGameOptions.length === 0 && gameFilterSearch}
									<div class="combobox-empty">No matching games</div>
								{/if}
							</Combobox.Content>
						</Combobox.Root>
						{#if gameFilter}
							<button class="combobox-clear" onclick={() => { gameFilter = ''; gameFilterSearch = ''; }}>
								<X size={12} />
							</button>
						{/if}
					</div>
					<Button.Root size="sm" onclick={() => { loadRuns(); loadApprovedRuns(); }} disabled={loading}><RefreshCw size={12} /> Refresh</Button.Root>
				</div>
			</div>
			<div class="filters__advanced">
				<div class="filter-group">
					<label class="filter-label">{m.admin_date_from()}</label>
					<input type="date" class="filter-input" bind:value={dateFrom} />
				</div>
				<div class="filter-group">
					<label class="filter-label">{m.admin_date_to()}</label>
					<input type="date" class="filter-input" bind:value={dateTo} />
				</div>
				{#if gameFilter || dateFrom || dateTo}
					<Button.Root size="sm" onclick={() => { gameFilter = ''; dateFrom = ''; dateTo = ''; }}><X size={12} /> Clear</Button.Root>
				{/if}
			</div>
		</div>

		<!-- Runs List -->
		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">{m.admin_loading_runs()}</p></div></div>
		{:else if filteredRuns.length === 0}
			<div class="card">
				<div class="empty">
					<span class="empty__icon"><Sparkles size={24} /></span>
					<h3>{m.admin_runs_no_runs()}</h3>
					<p class="muted">No {statusFilter === 'all' ? '' : statusFilter === 'verified' ? 'active' : statusFilter.replace('_', ' ')} runs matching your filters.</p>
				</div>
			</div>
		{:else}
			<div class="runs-list">
				{#each paginatedRuns as run (run.public_id)}
					{@const isPending = run.status === 'pending'}
					{@const isNeedsChanges = run.status === 'needs_changes'}
					{@const isApproved = run._source === 'approved'}
					{@const canAct = (isPending || isNeedsChanges) && canActOnRun(run)}
					{@const viewOnly = (isPending || isNeedsChanges) && !canActOnRun(run)}
					{@const canEditApproved = isApproved && canActOnRun(run)}
					<Collapsible.Root open={expandedId === run.public_id} onOpenChange={(o: boolean) => { expandedId = o ? run.public_id : null; }} class="run-card">
						<Collapsible.Trigger class="run-card__header">
							<div>
								<div class="run-card__title-row">
									<span class="run-card__game">{fmt(run.game_id)}</span>
									<span class="status-badge status-badge--{isApproved ? (run.verified ? 'verified' : 'published') : run.status}">{isApproved ? (run.verified ? 'verified' : 'published') : run.status === 'needs_changes' ? 'needs changes' : run.status}</span>
									{#if viewOnly}
										<span class="run-card__viewonly"><Eye size={12} /> View Only</span>
									{/if}
								</div>
								<span class="run-card__runner">by {run.runner_id} · {fmtTier(run.category_tier || '')} › {fmt(run.category_slug || run.category || '')}{#if run.time_primary} · <span class="mono">{run.time_primary}</span>{/if}</span>
							</div>
							<span class="run-card__date muted">{fmtAgo(run.submitted_at)}</span>
						</Collapsible.Trigger>

						<Collapsible.Content class="run-card__body">
								<!-- Claim Bar (pending runs only) -->
								{#if !isApproved}
								<div class="run-claim-bar">
									{#if run.claimed_by}
										<span class="claim-badge claim-badge--claimed"><Lock size={12} /> Claimed by {run.claimed_by_name || run.claimed_by}{#if run.claimed_at} · {fmtAgo(run.claimed_at)}{/if}</span>
									{:else if canAct && isPending}
										<button class="btn btn--claim" onclick={() => claimRun(run.public_id)} disabled={processingId === run.public_id}>ðŸ” Claim for Review</button>
									{:else}
										<span class="claim-badge claim-badge--unclaimed">{m.admin_unclaimed()}</span>
									{/if}
								</div>
								{/if}

								<!-- Edit indicator -->
								{#if !isApproved && wasEdited(run)}
									<div class="edit-indicator"><Pencil size={14} /> Edited after submission · {fmtAgo(run.updated_at)}</div>
								{/if}

								<div class="run-details">
									<div class="run-detail"><span class="run-detail__label">{m.admin_game()}</span><span class="run-detail__value">{fmt(run.game_id || '—')}</span></div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_tier()}</span><span class="run-detail__value">{fmtTier(run.category_tier || '—')}</span></div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_category()}</span><span class="run-detail__value">{fmt(run.category_slug || run.category || '—')}</span></div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_character()}</span>
										{#if !fieldApplicable(run, 'character')}<span class="run-detail__na">{m.admin_runs_na()}</span>
										{:else if !run.character}<span class="run-detail__na">{m.admin_runs_no_response()}</span>
										{:else}<span class="run-detail__value">{fmt(run.character)}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_difficulty()}</span>
										{#if !fieldApplicable(run, 'difficulty')}<span class="run-detail__na">{m.admin_runs_na()}</span>
										{:else if !run.difficulty}<span class="run-detail__na">{m.admin_runs_no_response()}</span>
										{:else}<span class="run-detail__value">{fmt(run.difficulty)}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_primary_time()}</span>
										{#if run.time_primary}<span class="run-detail__value mono">{run.time_primary}</span>
										{:else}<span class="run-detail__na">{m.admin_runs_no_response()}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_rta_time()}</span>
										{#if run.time_rta}<span class="run-detail__value mono">{run.time_rta}</span>
										{:else}<span class="run-detail__na">{m.admin_runs_no_response()}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_date_completed()}</span>
										{#if run.date_completed}<span class="run-detail__value">{fmtDate(run.date_completed)}</span>
										{:else}<span class="run-detail__na">{m.admin_runs_no_response()}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_submitted()}</span><span class="run-detail__value">{fmtDate(run.submitted_at)}</span></div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_challenges()}</span>
										{#if !fieldApplicable(run, 'challenges')}<span class="run-detail__na">{m.admin_runs_na()}</span>
										{:else if !run.standard_challenges?.length}<span class="run-detail__na">{m.admin_runs_no_response()}</span>
										{:else}<span class="run-detail__value">{fmtArray(run.standard_challenges)}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_glitch()}</span>
										{#if !fieldApplicable(run, 'glitch')}<span class="run-detail__na">{m.admin_runs_na()}</span>
										{:else if !run.glitch_id}<span class="run-detail__na">{m.admin_runs_no_response()}</span>
										{:else}<span class="run-detail__value">{fmt(run.glitch_id)}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_restrictions()}</span>
										{#if !fieldApplicable(run, 'restrictions')}<span class="run-detail__na">{m.admin_runs_na()}</span>
										{:else if !run.restrictions?.length}<span class="run-detail__na">{m.admin_runs_no_response()}</span>
										{:else}<span class="run-detail__value">{fmtArray(run.restrictions)}</span>{/if}
									</div>
									<div class="run-detail"><span class="run-detail__label">{m.admin_runs_platform()}</span>
										{#if run.platform}<span class="run-detail__value">{fmt(run.platform)}</span>
										{:else}<span class="run-detail__na">{m.admin_runs_no_response()}</span>{/if}
									</div>
									{#if run.runner_notes}
										<div class="run-detail run-detail--wide"><span class="run-detail__label">{m.admin_runs_runner_notes()}</span><span class="run-detail__value">{run.runner_notes}</span></div>
									{/if}
									{#if run.submission_id}<div class="run-detail"><span class="run-detail__label">{m.admin_runs_submission_id()}</span><span class="run-detail__value mono">{run.submission_id}</span></div>{/if}
									{#if isApproved && run.verified}
										<div class="run-detail"><span class="run-detail__label">{m.admin_runs_verified_by()}</span><span class="run-detail__value">{run.verified_by || '—'}</span></div>
										<div class="run-detail"><span class="run-detail__label">{m.admin_runs_verified_at()}</span><span class="run-detail__value">{fmtDate(run.verified_at)}</span></div>
									{/if}
								</div>

								{#if run.video_url}
									{@const embedUrl = getVideoEmbed(run.video_url)}
									<div class="run-video">
										<a href={run.video_url} target="_blank" rel="noopener"><Video size={14} /> {cleanVideoUrl(run.video_url)}</a>
										{#if embedUrl}
											<div class="run-video__embed">
												<iframe src={embedUrl} allowfullscreen loading="lazy" title="Run video"></iframe>
											</div>
										{/if}
									</div>
								{/if}

								{#if run.rejection_reason || run.verifier_notes}
									<div class="run-status-bar">
										{#if run.rejection_reason}Reason: {run.rejection_reason}{/if}
										{#if run.verifier_notes}{run.rejection_reason ? ' — ' : ''}Notes: {run.verifier_notes}{/if}
									</div>
								{/if}

								{#if canAct}
									<div class="run-actions">
										<button class="btn btn--approve" onclick={() => approveRun(run.public_id)} disabled={processingId === run.public_id}>
											{processingId === run.public_id ? '...' : '<Clipboard size={14} /> Publish'}
										</button>
										<button class="btn btn--changes" onclick={() => openEditModal(run)} disabled={processingId === run.public_id}>
											âœï¸ Edit / Request Changes
										</button>
										<button class="btn btn--reject" onclick={() => openRejectModal(run)} disabled={processingId === run.public_id}>
											âŒ Reject
										</button>
										{#if isAdmin || isSuperAdmin}
											<button class="btn btn--delete" onclick={() => deleteRun(run)} disabled={processingId === run.public_id}>
												<Trash2 size={14} />ï¸ Delete
											</button>
										{/if}
									</div>
								{:else if canEditApproved}
									<div class="run-actions">
										{#if !run.verified}
											<button class="btn btn--verify" onclick={() => verifyRun(run.public_id)} disabled={processingId === run.public_id}>
												ðŸ† Verify Run
											</button>
										{:else}
											<button class="btn btn--unverify" onclick={() => openUnverifyModal(run)} disabled={processingId === run.public_id}>
												<RefreshCw size={14} /> Revoke Verification
											</button>
										{/if}
										<button class="btn btn--changes" onclick={() => openEditModal(run)} disabled={processingId === run.public_id}>
											âœï¸ Edit Run
										</button>
										{#if isAdmin || isSuperAdmin}
											<button class="btn btn--delete" onclick={() => deleteRun(run)} disabled={processingId === run.public_id}>
												<Trash2 size={14} />ï¸ Delete
											</button>
										{/if}
									</div>
								{:else if run.status === 'rejected' && isSuperAdmin}
									<div class="run-actions">
										<button class="btn btn--delete" onclick={() => deleteRun(run)} disabled={processingId === run.public_id}>
											<Trash2 size={14} />ï¸ Permanently Delete
										</button>
									</div>
								{:else if viewOnly}
									<div class="run-actions run-actions--viewonly">
										<span class="viewonly-msg">ðŸ‘ View only — not your assigned game</span>
									</div>
								{/if}
							</Collapsible.Content>
					</Collapsible.Root>
				{/each}
			</div>
		{/if}

		<!-- Reject Modal -->
		<Dialog.Root open={rejectModalOpen} onOpenChange={(o: boolean) => { if (!o) rejectModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_runs_reject()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<p class="muted mb-2">{modalInfo}</p>
					<div class="form-field">
						<label>{m.admin_reason_required()} <span class="required">*</span></label>
						<Select.Root bind:value={rejectReason}>
							<Select.Trigger>{{ invalid_run: m.admin_runs_reason_invalid(), wrong_category: m.admin_runs_reason_wrong_cat(), video_issue: m.admin_runs_reason_video(), cheating_suspected: m.admin_runs_reason_cheating(), duplicate: m.admin_runs_reason_duplicate(), other: m.admin_other() }[rejectReason] || m.admin_select_reason()}</Select.Trigger>
							<Select.Content>
								<Select.Item value="invalid_run" label={m.admin_runs_reason_invalid()} />
								<Select.Item value="wrong_category" label={m.admin_runs_reason_wrong_cat()} />
								<Select.Item value="video_issue" label={m.admin_runs_reason_video()} />
								<Select.Item value="cheating_suspected" label={m.admin_runs_reason_cheating()} />
								<Select.Item value="duplicate" label={m.admin_runs_reason_duplicate()} />
								<Select.Item value="other" label={m.admin_other()} />
							</Select.Content>
						</Select.Root>
					</div>
					<div class="form-field">
						<label for="reject-notes">{m.admin_notes_opt()}</label>
						<textarea id="reject-notes" rows="3" bind:value={rejectNotes} placeholder="Additional details for the runner..."></textarea>
					</div>
				</div>
				<Dialog.Footer>
					<button class="btn btn--reject" onclick={confirmReject} disabled={!rejectReason || processingId !== null}>
						{processingId ? 'Rejecting...' : 'Reject Run'}
					</button>
					<Button.Root onclick={() => rejectModalOpen = false}>{m.admin_cancel()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<!-- Unverify Modal -->
		<Dialog.Root open={unverifyModalOpen} onOpenChange={(o: boolean) => { if (!o) unverifyModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_runs_revoke()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<p class="muted mb-2">{modalInfo}</p>
					<div class="form-field">
						<label>{m.admin_reason_required()} <span class="required">*</span></label>
						<Select.Root bind:value={unverifyReason}>
							<Select.Trigger>{{ rule_change: m.admin_runs_revoke_rule(), category_reclassified: m.admin_runs_reason_reclassified(), video_issue: m.admin_runs_revoke_video(), verification_error: m.admin_runs_revoke_error(), other: m.admin_other() }[unverifyReason] || m.admin_select_reason()}</Select.Trigger>
							<Select.Content>
								<Select.Item value="rule_change" label={m.admin_runs_revoke_rule()} />
								<Select.Item value="category_reclassified" label={m.admin_runs_reason_reclassified()} />
								<Select.Item value="video_issue" label={m.admin_runs_revoke_video()} />
								<Select.Item value="verification_error" label={m.admin_runs_revoke_error()} />
								<Select.Item value="other" label={m.admin_other()} />
							</Select.Content>
						</Select.Root>
					</div>
					<div class="form-field">
						<label for="unverify-notes">{m.admin_notes_opt()}</label>
						<textarea id="unverify-notes" bind:value={unverifyNotes} rows="3" placeholder="Additional context for the runner..."></textarea>
					</div>
				</div>
				<Dialog.Footer>
					<button class="btn btn--unverify" onclick={submitUnverify} disabled={!unverifyReason || processingId !== null}>
						{processingId ? '...' : '<RefreshCw size={14} /> Revoke Verification'}
					</button>
					<Button.Root onclick={() => unverifyModalOpen = false}>{m.admin_cancel()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<!-- Changes Modal -->
		<Dialog.Root open={editModalOpen} onOpenChange={(o: boolean) => { if (!o) editModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content class="modal--wide">
				{#if !editDiffStep}
					<!-- Step 1: Edit Fields -->
					<h3>{modalRun?._source === 'approved' ? 'Edit Published Run' : 'Edit / Request Changes'}</h3>
					<p class="muted mb-2">{modalInfo}</p>
					{@const g = modalRun ? gameConfigs[modalRun.game_id] : null}
					{@const categoryOpts = modalRun ? getCategoryOptions(modalRun.game_id, editFields.category_tier) : []}
					{@const charItems = modalRun ? getItems(modalRun.game_id, 'characters_data') : []}
					{@const difficultyItems = g?.difficulty_column?.enabled ? (g.difficulties_data || []).map((d: any) => ({ slug: d.slug, label: d.label })) : []}
					{@const challengeItems = modalRun ? getItems(modalRun.game_id, 'challenges_data') : []}
					{@const restrictionItems = modalRun ? flattenRestrictions(g?.restrictions_data || []) : []}
					{@const glitchItems = modalRun ? getItems(modalRun.game_id, 'glitches_data') : []}

					<div class="edit-grid">
						<!-- Tier -->
						<div class="form-field form-field--inline">
							<label>{m.admin_runs_tier()}</label>
							<Select.Root value={editFields.category_tier} onValueChange={(v: string) => { editSet('category_tier', v); editSet('category_slug', ''); }}>
								<Select.Trigger>{({ full_runs: m.admin_runs_full(), mini_challenges: m.admin_runs_mini(), player_made: m.admin_runs_player() } as Record<string, string>)[editFields.category_tier] || '—'}</Select.Trigger>
								<Select.Content>
									<Select.Item value="" label="—" />
									<Select.Item value="full_runs" label={m.admin_runs_full()} />
									<Select.Item value="mini_challenges" label={m.admin_runs_mini()} />
									<Select.Item value="player_made" label={m.admin_runs_player()} />
								</Select.Content>
							</Select.Root>
						</div>

						<!-- Category (filtered by tier) -->
						<div class="form-field form-field--inline">
							<label>{m.admin_runs_category()}</label>
							{#if categoryOpts.length}
								<Select.Root value={editFields.category_slug} onValueChange={(v: string) => { editSet('category_slug', v); }}>
									<Select.Trigger>{categoryOpts.find((c: any) => c.slug === editFields.category_slug)?.label || '—'}</Select.Trigger>
									<Select.Content>
										<Select.Item value="" label="—" />
										{#each categoryOpts as cat}
											<Select.Item value={cat.slug} label={cat.label} />
										{/each}
									</Select.Content>
								</Select.Root>
							{:else}
								<span class="run-detail__na">{editFields.category_tier ? 'No categories' : 'Select a tier first'}</span>
							{/if}
						</div>

						<!-- Character (combobox single-select) -->
						{#if charItems.length}
							<div class="form-field form-field--inline">
								<label>{m.admin_runs_character()}</label>
								<div class="combobox-wrap">
									<Combobox.Root class="combobox-single" bind:inputValue={editCharSearch} onInputValueChange={(v: string) => { editCharFilterText = v; }} onValueChange={(v: string) => { editSet('character', v); }} onOpenChange={(o: boolean) => { if (!o) editCharFilterText = ''; }}>
										<Combobox.Input placeholder="Type a character..." />
										<Combobox.Content>
											{#each taFilter(charItems, editCharFilterText) as c}
												<Combobox.Item value={c.slug} label={c.label} forceMount>{c.label}</Combobox.Item>
											{/each}
											{#if taFilter(charItems, editCharFilterText).length === 0}
												<div class="combobox-empty">{m.admin_runs_no_matches()}</div>
											{/if}
										</Combobox.Content>
									</Combobox.Root>
									{#if editFields.character}<button class="combobox-clear" onclick={() => { editSet('character', ''); editCharSearch = ''; }}><X size={14} /></button>{/if}
								</div>
							</div>
						{/if}

						<!-- Difficulty (select) -->
						{#if difficultyItems.length}
							<div class="form-field form-field--inline">
								<label>{m.admin_runs_difficulty()}</label>
								<Select.Root value={editFields.difficulty || ''} onValueChange={(v: string) => { editSet('difficulty', v); }}>
									<Select.Trigger>{difficultyItems.find((d: any) => d.slug === editFields.difficulty)?.label || '—'}</Select.Trigger>
									<Select.Content>
										<Select.Item value="" label="—" />
										{#each difficultyItems as d}
											<Select.Item value={d.slug} label={d.label} />
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						{/if}

						<!-- Primary Time / RTA Time -->
						<div class="form-field form-field--inline">
							<label for="edit-time-primary">{m.admin_runs_primary_time()}</label>
							<input id="edit-time-primary" type="text" bind:value={editFields.time_primary} placeholder="HH:MM:SS" />
						</div>
						{#if modalRun?._source !== 'approved'}
						<div class="form-field form-field--inline">
							<label for="edit-time-rta">{m.admin_runs_rta_time()}</label>
							<input id="edit-time-rta" type="text" bind:value={editFields.time_rta} placeholder="HH:MM:SS" />
						</div>
						{/if}

						<!-- Date Completed -->
						<div class="form-field form-field--inline">
							<label for="edit-date">{m.admin_runs_date_completed()}</label>
							<input id="edit-date" type="date" bind:value={editFields.date_completed} />
						</div>

						<!-- Challenges (combobox multi-select) -->
						{#if challengeItems.length}
							<div class="form-field form-field--ta-multi">
								<label>{m.admin_runs_challenges()}</label>
								<div class="combobox-wrap">
									<Combobox.Root class="combobox-single" bind:inputValue={editChallengeSearch} onInputValueChange={(v: string) => { editChallengeFilterText = v; }} onValueChange={(v: string) => { editAddMulti('standard_challenges', v); editChallengeSearch = ''; }} onOpenChange={(o: boolean) => { if (!o) editChallengeFilterText = ''; }}>
										<Combobox.Input placeholder="Type a challenge..." />
										<Combobox.Content>
											{#each taFilter(challengeItems, editChallengeFilterText, editFields.standard_challenges) as c}
												<Combobox.Item value={c.slug} label={c.label} forceMount>{c.label}</Combobox.Item>
											{/each}
											{#if taFilter(challengeItems, editChallengeFilterText, editFields.standard_challenges).length === 0}
												<div class="combobox-empty">{(editFields.standard_challenges?.length || 0) === challengeItems.length ? 'All selected' : 'No matches'}</div>
											{/if}
										</Combobox.Content>
									</Combobox.Root>
								</div>
								{#if (editFields.standard_challenges || []).length}
									<div class="combobox-pills">
										{#each editFields.standard_challenges as slug}
											<span class="combobox-pill">{labelFor(slug, challengeItems)} <button class="combobox-pill-x" onclick={() => editRemoveMulti('standard_challenges', slug)}><X size={14} /></button></span>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						<!-- Glitch Category (combobox single-select) -->
						{#if glitchItems.length}
							<div class="form-field form-field--inline">
								<label>{m.admin_runs_glitch()}</label>
								<div class="combobox-wrap">
									<Combobox.Root class="combobox-single" bind:inputValue={editGlitchSearch} onInputValueChange={(v: string) => { editGlitchFilterText = v; }} onValueChange={(v: string) => { editSet('glitch_id', v); }} onOpenChange={(o: boolean) => { if (!o) editGlitchFilterText = ''; }}>
										<Combobox.Input placeholder="Type a glitch category..." />
										<Combobox.Content>
											{#each taFilter(glitchItems, editGlitchFilterText) as gl}
												<Combobox.Item value={gl.slug} label={gl.label} forceMount>{gl.label}</Combobox.Item>
											{/each}
											{#if taFilter(glitchItems, editGlitchFilterText).length === 0}
												<div class="combobox-empty">{m.admin_runs_no_matches()}</div>
											{/if}
										</Combobox.Content>
									</Combobox.Root>
									{#if editFields.glitch_id}<button class="combobox-clear" onclick={() => { editSet('glitch_id', ''); editGlitchSearch = ''; }}><X size={14} /></button>{/if}
								</div>
							</div>
						{/if}

						<!-- Restrictions (combobox multi-select with parent-child grouping) -->
						{#if restrictionItems.length}
							<div class="form-field form-field--ta-multi">
								<label>{m.admin_runs_restrictions()}</label>
								<div class="combobox-wrap">
									<Combobox.Root class="combobox-single" bind:inputValue={editRestrictionSearch} onInputValueChange={(v: string) => { editRestrictionFilterText = v; }} onValueChange={(v: string) => { editAddMulti('restrictions', v); editRestrictionSearch = ''; }} onOpenChange={(o: boolean) => { if (!o) editRestrictionFilterText = ''; }}>
										<Combobox.Input placeholder="Type a restriction..." />
										<Combobox.Content>
											{#each taFilter(restrictionItems, editRestrictionFilterText, editFields.restrictions) as r}
												<Combobox.Item value={r.slug} label={r.label} forceMount>{#if r.group}<span class="combobox-group">{r.group} ›</span> {/if}{r.label}</Combobox.Item>
											{/each}
											{#if taFilter(restrictionItems, editRestrictionFilterText, editFields.restrictions).length === 0}
												<div class="combobox-empty">{(editFields.restrictions?.length || 0) === restrictionItems.length ? 'All selected' : 'No matches'}</div>
											{/if}
										</Combobox.Content>
									</Combobox.Root>
								</div>
								{#if (editFields.restrictions || []).length}
									<div class="combobox-pills">
										{#each editFields.restrictions as slug}
											{@const item = restrictionItems.find(i => i.slug === slug)}
											<span class="combobox-pill">{#if item?.group}<span class="combobox-pill-group">{item.group} ›</span> {/if}{item?.label || fmt(slug)} <button class="combobox-pill-x" onclick={() => editRemoveMulti('restrictions', slug)}><X size={14} /></button></span>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						<!-- Platform (searchable select) -->
						{#if modalRun?._source !== 'approved'}
						<div class="form-field form-field--inline">
							<label>{m.admin_runs_platform()}</label>
							<Select.Root value={editFields.platform} onValueChange={(v: string) => { editSet('platform', v); }}>
								<Select.Trigger>{PLATFORM_OPTIONS.find((p: any) => p.slug === editFields.platform)?.label || '—'}</Select.Trigger>
								<Select.Content>
									<Select.Item value="" label="—" />
									{#each PLATFORM_OPTIONS as p}
										<Select.Item value={p.slug} label={p.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						{/if}
					</div>
					<div class="form-field mt-1">
						<label for="edit-notes">{m.admin_runs_notes_for_runner()}</label>
						<textarea id="edit-notes" rows="3" bind:value={editNotes} placeholder="Explain the changes or what the runner needs to do..."></textarea>
					</div>
					<p class="muted note-placeholder"><Send size={14} /> Runner notifications coming soon — for now, changes are logged and visible in the audit trail.</p>
					<div class="modal__actions">
						<button class="btn btn--changes" onclick={showEditDiff} disabled={editedFields.length === 0 && !editNotes.trim()}>
							Review Changes ({editedFields.length})
						</button>
						<Button.Root onclick={() => editModalOpen = false}>{m.admin_cancel()}</Button.Root>
					</div>
				{:else}
					<!-- Step 2: Diff Confirmation -->
					<h3>{m.admin_runs_confirm_changes()}</h3>
					<p class="muted mb-2">{modalInfo}</p>

					{#if editedFields.length > 0}
						<div class="diff-table">
							<div class="diff-header">
								<span>{m.admin_runs_field()}</span><span>{m.admin_runs_original()}</span><span>{m.admin_runs_updated()}</span>
							</div>
							{#each editedFields as f}
								{@const fmtDiff = (v: any) => {
									if (f.key === 'category_tier') return fmtTier(v);
									if (Array.isArray(v)) return v.length ? v.map((s: string) => diffLabel(f.key, s)).join(', ') : '—';
									return v ? diffLabel(f.key, String(v)) : '—';
								}}
								<div class="diff-row">
									<span class="diff-field">{f.label}</span>
									<span class="diff-old">{fmtDiff(f.from)}</span>
									<span class="diff-new">{fmtDiff(f.to)}</span>
								</div>
							{/each}
						</div>
					{/if}

					{#if editNotes.trim()}
						<div class="diff-notes">
							<strong>{m.admin_runs_notes_colon()}</strong> {editNotes}
						</div>
					{/if}

					<p class="muted mt-1">{m.admin_runs_confirm_audit()}</p>

					<div class="modal__actions">
						<button class="btn btn--approve" onclick={confirmEdit} disabled={processingId !== null}>
							{processingId ? 'Saving...' : '<CheckCircle size={14} /> Confirm Changes'}
						</button>
						<Button.Root onclick={() => editDiffStep = false}><ArrowLeft size={14} /> Back to Edit</Button.Root>
						<Button.Root onclick={() => editModalOpen = false}>{m.admin_cancel()}</Button.Root>
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	<!-- Reusable confirm dialog -->
	<AlertDialog.Root bind:open={confirmOpen}>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
			<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
			<div class="alert-dialog-actions">
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action class={confirmVariant === 'danger' ? 'btn btn--danger' : 'btn btn--approve'} onclick={handleConfirmAction}>
					{confirmVariant === 'danger' ? 'Delete' : 'Confirm'}
				</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; font-family: inherit; }
	.mono { font-family: monospace; font-size: 0.85rem; }

	/* Toast */
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

	/* Filters */
	.filters { padding: 1rem; margin-bottom: 1.5rem; }
	.filters__row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
	.filters__tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	:global(.filter-tabs.ui-toggle-group) { display: flex; flex-wrap: wrap; gap: 0.25rem; border: none; border-radius: 0; overflow: visible; }
	:global(.filter-tabs .ui-toggle-group-item) { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; color: var(--muted); }
	:global(.filter-tabs .ui-toggle-group-item:hover) { border-color: var(--fg); color: var(--fg); }
	:global(.filter-tabs .ui-toggle-group-item[data-state="on"]) { background: var(--accent); color: white; border-color: var(--accent); }
	:global(.filter-tab__count) { display: inline-block; background: rgba(255,255,255,0.25); padding: 0 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; font-weight: 700; }
	.filters__advanced { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.filter-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.filter-input { padding: 0.35rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.filter-input:focus { border-color: var(--accent); outline: none; }
	.filters__controls { display: flex; gap: 0.5rem; align-items: center; }

	/* Run cards */
	.runs-list { display: flex; flex-direction: column; gap: 0.75rem; }
	:global(.run-card) { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	:global(.run-card__header) { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem 1.25rem; cursor: pointer; transition: background 0.1s; flex-wrap: wrap; gap: 0.75rem; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; }
	:global(.run-card__header:hover) { background: rgba(255,255,255,0.02); }
	.run-card__title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.run-card__game { font-weight: 700; font-size: 1.05rem; }
	.run-card__runner { font-size: 0.85rem; color: var(--muted); display: block; margin-top: 0.15rem; }
	.run-card__date { white-space: nowrap; font-size: 0.85rem; }
	.run-card__viewonly { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.45rem; border-radius: 4px; background: rgba(107,114,128,0.15); color: var(--muted); }
	.status-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
	.status-badge--pending { background: rgba(234, 179, 8, 0.15); color: #eab308; }
	.status-badge--published { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.status-badge--verified { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
	.status-badge--rejected { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.status-badge--needs_changes { background: rgba(234, 179, 8, 0.15); color: #eab308; }

	/* Expandable body */
	:global(.run-card__body) { border-top: 1px solid var(--border); padding: 1.25rem; }
	.run-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
	.run-detail { display: flex; flex-direction: column; gap: 0.2rem; }
	.run-detail--wide { grid-column: 1 / -1; }
	.run-detail__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); font-weight: 700; }
	.run-detail__value { font-weight: 500; word-break: break-word; color: var(--fg); }
	.run-detail__na { font-size: 0.85rem; color: var(--muted); opacity: 0.5; font-style: italic; }

	/* Claim bar */
	.run-claim-bar { margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
	.claim-badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
	.claim-badge--claimed { background: rgba(59, 130, 246, 0.12); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.25); }
	.claim-badge--unclaimed { background: rgba(107, 114, 128, 0.1); color: var(--muted); border: 1px solid var(--border); }
	.btn--claim { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #3b82f6; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn--claim:hover { background: rgba(59, 130, 246, 0.2); }
	.edit-indicator { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; margin-bottom: 1rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: #fbbf24; }
	.run-video { margin-bottom: 1.25rem; }
	.run-video a { color: var(--accent); word-break: break-all; text-decoration: none; font-size: 0.9rem; }
	.run-video a:hover { text-decoration: underline; }
	.run-video__embed { margin-top: 0.75rem; aspect-ratio: 16/9; max-width: 560px; border-radius: 8px; overflow: hidden; }
	.run-video__embed iframe { width: 100%; height: 100%; border: none; }
	.run-status-bar { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.85rem; color: var(--muted); background: rgba(255,255,255,0.02); margin-bottom: 1rem; border: 1px solid var(--border); }
	.run-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--border); }
	.run-actions--viewonly { padding-top: 0.75rem; }
	.viewonly-msg { font-size: 0.85rem; color: var(--muted); font-style: italic; padding: 0.25rem 0; }
	.btn--approve { background: #28a745; color: white; border-color: #28a745; }
	.btn--approve:hover { background: #218838; color: white; }
	.btn--reject { border-color: #dc3545; color: #dc3545; }
	.btn--delete { border-color: #6b7280; color: #ef4444; }
	.btn--delete:hover { background: rgba(239, 68, 68, 0.08); border-color: #ef4444; }
	.btn--reject:hover { background: #dc3545; color: white; }
	.btn--changes { border-color: #17a2b8; color: #17a2b8; }
	.btn--changes:hover { background: #17a2b8; color: white; }
	.btn--verify { background: #6f42c1; color: white; border-color: #6f42c1; }
	.btn--verify:hover { background: #5a32a3; color: white; }
	.btn--unverify { border-color: #ffc107; color: #ffc107; }
	.btn--unverify:hover { background: #ffc107; color: #000; }

	/* Empty */
	.empty { text-align: center; padding: 3rem 1rem; }
	.empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
	.empty h3 { margin: 0 0 0.5rem; }

	/* Modal */
	.modal__body { margin-bottom: 0.5rem; }
	.modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
	.form-field { margin-bottom: 1rem; }
	.form-field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
	.form-field textarea { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.form-field textarea:focus { outline: none; border-color: var(--accent); }
	.form-field input { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.form-field input:focus { outline: none; border-color: var(--accent); }
	.form-field--inline { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
	.form-field--inline label { font-size: 0.8rem; font-weight: 600; color: var(--muted); margin: 0; }
	.required { color: #dc3545; }
	.mt-1 { margin-top: 0.75rem; }
	.note-placeholder { font-size: 0.8rem; font-style: italic; margin-top: 0.5rem; padding: 0.5rem 0.75rem; background: rgba(59, 130, 246, 0.06); border-radius: 6px; border: 1px dashed rgba(59, 130, 246, 0.2); }

	/* Edit modal */
	:global(.modal--wide) { max-width: 640px; }
	.edit-grid { display: flex; flex-direction: column; gap: 0; }
	.form-field--ta-multi { margin-bottom: 0.6rem; }
	.form-field--ta-multi > label { font-size: 0.8rem; font-weight: 600; color: var(--muted); margin: 0 0 0.35rem; display: block; }

	/* Typeahead */
	/* Combobox */
	.combobox-wrap { position: relative; }
	.combobox-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 2px 5px; border-radius: 3px; z-index: 1; }
	.combobox-clear:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
	.combobox-empty { padding: 0.5rem 0.6rem; color: var(--muted); font-size: 0.8rem; }
	.combobox-group { color: var(--muted); font-size: 0.78rem; font-weight: 600; margin-right: 0.15rem; }
	.combobox-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.4rem; }
	.combobox-pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.55rem; background: var(--accent); color: #fff; border-radius: 14px; font-size: 0.75rem; font-weight: 500; }
	.combobox-pill-group { opacity: 0.7; font-size: 0.7rem; }
	.combobox-pill-x { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.7rem; padding: 0 2px; line-height: 1; }
	.combobox-pill-x:hover { color: #fff; }

	/* Diff table */
	.diff-table { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 1rem; }
	.diff-header { display: grid; grid-template-columns: 120px 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--surface); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); border-bottom: 1px solid var(--border); }
	.diff-row { display: grid; grid-template-columns: 120px 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
	.diff-row:last-child { border-bottom: none; }
	.diff-field { font-weight: 600; color: var(--muted); font-size: 0.8rem; }
	.diff-old { color: #ef4444; text-decoration: line-through; opacity: 0.7; }
	.diff-new { color: #22c55e; font-weight: 600; }
	.diff-notes { padding: 0.6rem 0.75rem; background: rgba(59, 130, 246, 0.06); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.75rem; }

	@media (max-width: 640px) {
		.filters__row { flex-direction: column; align-items: stretch; }
		.run-details { grid-template-columns: 1fr 1fr; }
		.run-actions { flex-direction: column; }
		.run-actions .btn { width: 100%; justify-content: center; }
	}
</style>
