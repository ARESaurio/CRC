<script lang="ts">
	import { PUBLIC_WORKER_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, Send, Eye, Plus, X, Save, Upload, Search } from 'lucide-svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as Checkbox from '$lib/components/ui/checkbox/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Slider from '$lib/components/ui/slider/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { data } = $props();
	let genres = $derived(data.genres);
	let platforms = $derived(data.platforms);
	let challengeDefs = $derived(data.challenges);

	// ── Form State ────────────────────────────────────────────
	// Section 1: Game Info
	let gameName = $state('');
	let aliases = $state('');
	let description = $state('');

	// ── Simple / Advanced mode ────────────────────────────────
	let formMode = $state<'simple' | 'advanced'>('simple');
	type GameCheckResult = {
		exists: boolean;
		where?: 'live' | 'pending';
		game_id?: string;
		game_name?: string;
		pending_game_id?: string;
		status?: string;
		supporter_count?: number;
	};
	let gameCheckLoading = $state(false);
	let gameCheckResult = $state<GameCheckResult | null>(null);
	let supporterMode = $derived(gameCheckResult?.exists === true && gameCheckResult?.where === 'pending');
	let gameExistsLive = $derived(gameCheckResult?.exists === true && gameCheckResult?.where === 'live');

	// ── Supporter form state ──────────────────────────────────
	let supporterNotes = $state('');
	let supporterCategories = $state('');
	let supporterChallenges = $state('');
	let supporterRules = $state('');
	let supporterSubmitting = $state(false);
	let supporterResult = $state<{ ok: boolean; message: string } | null>(null);

	// Cover image upload (same crop tool as game editor)
	const CROP_W = 460;
	const CROP_H = 215;
	let coverUrl = $state('');
	let coverUploading = $state(false);
	let cropModalOpen = $state(false);
	let cropImg = $state<HTMLImageElement | null>(null);
	let cropCanvas = $state<HTMLCanvasElement | null>(null);
	let cropX = $state(0);
	let cropY = $state(0);
	let cropZoom = $state(1);
	let cropDragging = $state(false);
	let cropDragStart = $state({ x: 0, y: 0, cx: 0, cy: 0 });
	let cropOriginalFile = $state<File | null>(null);
	// Temp upload key — a client-generated id used as the storage path before game_id is known
	let coverTempKey = $state(crypto.randomUUID());

	function handleCoverFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			alert('Only JPEG, PNG, and WebP images are allowed.');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			alert('File must be under 5MB.');
			return;
		}
		cropOriginalFile = file;
		const img = new Image();
		img.onload = async () => {
			cropImg = img;
			const scaleW = CROP_W / img.width;
			const scaleH = CROP_H / img.height;
			cropZoom = Math.max(scaleW, scaleH);
			cropX = (CROP_W - img.width * cropZoom) / 2;
			cropY = (CROP_H - img.height * cropZoom) / 2;
			cropModalOpen = true;
			await import('svelte').then(m => m.tick?.());
			drawCrop();
		};
		img.src = URL.createObjectURL(file);
		input.value = '';
	}

	function drawCrop() {
		if (!cropCanvas || !cropImg) return;
		const ctx = cropCanvas.getContext('2d');
		if (!ctx) return;
		cropCanvas.width = CROP_W;
		cropCanvas.height = CROP_H;
		ctx.clearRect(0, 0, CROP_W, CROP_H);
		ctx.fillStyle = '#111';
		ctx.fillRect(0, 0, CROP_W, CROP_H);
		ctx.drawImage(cropImg, cropX, cropY, cropImg.width * cropZoom, cropImg.height * cropZoom);
	}

	function handleCropMouseDown(e: MouseEvent) {
		cropDragging = true;
		cropDragStart = { x: e.clientX, y: e.clientY, cx: cropX, cy: cropY };
	}
	function handleCropMouseMove(e: MouseEvent) {
		if (!cropDragging) return;
		cropX = cropDragStart.cx + (e.clientX - cropDragStart.x);
		cropY = cropDragStart.cy + (e.clientY - cropDragStart.y);
		drawCrop();
	}
	function handleCropMouseUp() { cropDragging = false; }
	function handleCropZoom(vals: number[]) {
		const val = vals[0];
		if (!cropImg) return;
		const oldZoom = cropZoom;
		cropZoom = val;
		const cx = CROP_W / 2;
		const cy = CROP_H / 2;
		cropX = cx - (cx - cropX) * (cropZoom / oldZoom);
		cropY = cy - (cy - cropY) * (cropZoom / oldZoom);
		drawCrop();
	}
	function closeCropModal() {
		cropModalOpen = false;
		cropImg = null;
		cropOriginalFile = null;
	}
	async function confirmCropAndUpload() {
		if (!cropCanvas || !cropImg) return;
		coverUploading = true;
		try {
			const blob = await new Promise<Blob | null>((resolve) => {
				cropCanvas!.toBlob(resolve, 'image/webp', 0.85);
			});
			if (!blob) { alert('Failed to process image.'); coverUploading = false; return; }
			const { error: uploadErr } = await supabase.storage
				.from('pending-covers')
				.upload(`${coverTempKey}.webp`, blob, { contentType: 'image/webp', upsert: true });
			if (uploadErr) { alert(`Upload failed: ${uploadErr.message}`); coverUploading = false; return; }
			const { data: urlData } = supabase.storage.from('pending-covers').getPublicUrl(`${coverTempKey}.webp`);
			coverUrl = urlData.publicUrl + '?v=' + Date.now();
			closeCropModal();
		} catch (err: any) {
			alert(`Upload error: ${err?.message || 'Unknown'}`);
		}
		coverUploading = false;
	}

	// Section 2: Platforms
	let selectedPlatforms = $state<string[]>([]);
	let platformSearch = $state('');
	let customPlatforms = $state<string[]>([]);
	const PLATFORM_DISPLAY_LIMIT = 30;

	let filteredPlatforms = $derived.by(() => {
		if (platformSearch.trim()) {
			const q = platformSearch.toLowerCase();
			return platforms.filter((p: any) => p.label.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
		}
		return platforms.slice(0, PLATFORM_DISPLAY_LIMIT);
	});

	function togglePlatform(slug: string) {
		if (selectedPlatforms.includes(slug)) {
			selectedPlatforms = selectedPlatforms.filter(s => s !== slug);
		} else {
			selectedPlatforms = [...selectedPlatforms, slug];
		}
	}
	function addCustomPlatform() { if (customPlatforms.length < 2) customPlatforms = [...customPlatforms, '']; }
	function removeCustomPlatform(i: number) { customPlatforms = customPlatforms.filter((_, idx) => idx !== i); }
	function customPlatformDuplicate(value: string): string | null {
		if (!value.trim()) return null;
		const q = value.trim().toLowerCase();
		const match = platforms.find((p: any) =>
			p.label.toLowerCase() === q || p.slug === q ||
			(p.aliases || []).some((a: string) => a.toLowerCase() === q)
		);
		return match ? `"${match.label}" already exists as an option.` : null;
	}

	// Section 3: Genres
	let selectedGenres = $state<string[]>([]);
	let genreSearch = $state('');
	let customGenres = $state<string[]>([]);
	const GENRE_DISPLAY_LIMIT = 30;

	let totalGenreCount = $derived(selectedGenres.length + customGenres.filter(g => g.trim()).length);

	let filteredGenres = $derived.by(() => {
		if (genreSearch.trim()) {
			const q = genreSearch.toLowerCase();
			return genres.filter((g: any) => g.label.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q));
		}
		return genres.slice(0, GENRE_DISPLAY_LIMIT);
	});

	function toggleGenre(slug: string) {
		if (selectedGenres.includes(slug)) {
			selectedGenres = selectedGenres.filter(s => s !== slug);
		} else if (totalGenreCount < 5) {
			selectedGenres = [...selectedGenres, slug];
		}
	}
	function addCustomGenre() {
		if (totalGenreCount < 5 && customGenres.length < 3) customGenres = [...customGenres, ''];
	}
	function removeCustomGenre(i: number) {
		customGenres = customGenres.filter((_, idx) => idx !== i);
	}
	function customGenreDuplicate(value: string): string | null {
		if (!value.trim()) return null;
		const q = value.trim().toLowerCase();
		const match = genres.find((g: any) =>
			g.label.toLowerCase() === q || g.slug === q ||
			(g.aliases || []).some((a: string) => a.toLowerCase() === q)
		);
		return match ? `"${match.label}" already exists as an option.` : null;
	}

	// Section 4: Run Categories
	interface FullRunEntry {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
	}
	let fullRunCategories = $state<FullRunEntry[]>([]);

	interface MiniChild {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
		fixedLoadoutEnabled: boolean;
		fixedCharacter: string;
		fixedRestriction: string;
	}
	interface MiniChallengeGroup {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
		children: MiniChild[];
		childSelect: 'single' | 'multi';
	}
	let miniChallengeGroups = $state<MiniChallengeGroup[]>([]);

	const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	function addFullRun() {
		fullRunCategories = [...fullRunCategories, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '' }];
		editingSection = 'fr'; editingIndex = fullRunCategories.length - 1;
	}
	function removeFullRun(i: number) { fullRunCategories = fullRunCategories.filter((_, idx) => idx !== i); }

	function addMiniGroup() {
		miniChallengeGroups = [...miniChallengeGroups, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '', childSelect: 'single', children: [] }];
		editingSection = 'mc'; editingIndex = miniChallengeGroups.length - 1;
	}
	function removeMiniGroup(i: number) {
		miniChallengeGroups = miniChallengeGroups.filter((_, idx) => idx !== i);
	}
	function addMiniChild(groupIdx: number) {
		miniChallengeGroups = miniChallengeGroups.map((g, i) =>
			i === groupIdx ? { ...g, children: [...g.children, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '', fixedLoadoutEnabled: false, fixedCharacter: '', fixedRestriction: '' }] } : g
		);
	}
	function removeMiniChild(groupIdx: number, childIdx: number) {
		miniChallengeGroups = miniChallengeGroups.map((g, i) =>
			i === groupIdx ? { ...g, children: g.children.filter((_, ci) => ci !== childIdx) } : g
		);
	}

	let hasAtLeastOneCategory = $derived.by(() => {
		const hasFullRun = fullRunCategories.some(c => c.label.trim());
		const hasMini = miniChallengeGroups.some(g => g.label.trim());
		return hasFullRun || hasMini;
	});

	// Section 5: Challenges (alphabetical)
	const STANDARD_CHALLENGES = [
		'Blindfolded', 'Damageless', 'Deathless', 'Flawless',
		'Hitless', 'Minimalist', 'Pacifist', 'Speedrun'
	];
	let selectedChallenges = $state<string[]>([]);
	let challengeExceptions = $state<Record<string, string>>({});
	let challengeDescriptions = $state<Record<string, string>>({});
	let customChallengeEnabled = $state(false);
	let customChallengeName = $state('');
	let customChallengeDescription = $state('');

	function toggleChallenge(c: string) {
		if (selectedChallenges.includes(c)) {
			selectedChallenges = selectedChallenges.filter(s => s !== c);
			const { [c]: _, ...restExc } = challengeExceptions;
			challengeExceptions = restExc;
			const { [c]: __, ...restDesc } = challengeDescriptions;
			challengeDescriptions = restDesc;
		} else {
			selectedChallenges = [...selectedChallenges, c];
		}
	}

	let hasAtLeastOneChallenge = $derived(
		selectedChallenges.length > 0 || (customChallengeEnabled && customChallengeName.trim())
	);

	// Section 6: Characters
	let characterEnabled = $state(false);
	let characterLabel = $state('Character');
	let characterOptions = $state<string[]>([]);

	function addCharacter() { characterOptions = [...characterOptions, '']; }
	function removeCharacter(i: number) { characterOptions = characterOptions.filter((_, idx) => idx !== i); }

	// Section 7: Restrictions (parent-child with descriptions and exceptions)
	interface RestrictionChild {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
	}
	interface RestrictionGroup {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
		childSelect: 'single' | 'multi';
		children: RestrictionChild[];
	}
	let restrictions = $state<RestrictionGroup[]>([]);
	function addRestriction() {
		restrictions = [...restrictions, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '', childSelect: 'single', children: [] }];
		editingSection = 'rs'; editingIndex = restrictions.length - 1;
	}
	function removeRestriction(i: number) { restrictions = restrictions.filter((_, idx) => idx !== i); }
	function addRestrictionChild(parentIdx: number) {
		restrictions = restrictions.map((r, i) =>
			i === parentIdx ? { ...r, children: [...r.children, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '' }] } : r
		);
	}
	function removeRestrictionChild(parentIdx: number, childIdx: number) {
		restrictions = restrictions.map((r, i) =>
			i === parentIdx ? { ...r, children: r.children.filter((_, ci) => ci !== childIdx) } : r
		);
	}

	// Section 8: Timing
	let timingMethod = $state('RTA');
	const TIMING_OPTIONS = [
		{ value: 'RTA', label: 'RTA (Real Time Attack)' },
		{ value: 'IGT', label: 'IGT (In-Game Time)' },
		{ value: 'LRT', label: 'LRT (Load-Removed Time)' },
	];

	// Section 9: Glitches
	const GLITCH_PRESETS = [
		{ slug: 'unrestricted', label: 'Unrestricted', hint: 'Any and all glitches are allowed' },
		{ slug: 'nmg', label: 'No Major Glitches (NMG)', hint: '' },
		{ slug: 'glitchless', label: 'Glitchless', hint: '' },
	];
	let selectedGlitches = $state<string[]>([]);
	let nmgRules = $state('');
	let customGlitches = $state<{ name: string; description: string }[]>([]);
	let glitchDocLinks = $state('');

	function toggleGlitch(slug: string) {
		if (selectedGlitches.includes(slug)) {
			selectedGlitches = selectedGlitches.filter(s => s !== slug);
			if (slug === 'nmg') nmgRules = '';
		} else {
			selectedGlitches = [...selectedGlitches, slug];
		}
	}
	function addCustomGlitch() { customGlitches = [...customGlitches, { name: '', description: '' }]; }
	function removeCustomGlitch(i: number) { customGlitches = customGlitches.filter((_, idx) => idx !== i); }

	// Section 10: Rules
	let generalRules = $state('');

	// Simple mode: optional category description
	let simpleCategoryNotes = $state('');

	// Section 11: Involvement & Notes
	const INVOLVEMENT_OPTIONS = [
		'I would like to be credited for helping set this page up.',
		'I am interested in helping moderate this game.',
		'I am interested in helping verify runs for this game.',
	];
	let involvement = $state<string[]>([]);
	let additionalNotes = $state('');

	function toggleInvolvement(opt: string) {
		if (involvement.includes(opt)) {
			involvement = involvement.filter(s => s !== opt);
		} else {
			involvement = [...involvement, opt];
		}
	}

	// ── Draft Save/Load ──────────────────────────────────────
	let draftStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let draftExists = $state(false);
	let draftLoading = $state(true);
	let draftRestored = $state(false);

	function serializeForm() {
		return {
			formMode,
			gameName, aliases, description, coverUrl,
			selectedPlatforms, customPlatforms, selectedGenres, customGenres,
			fullRunCategories, miniChallengeGroups,
			selectedChallenges, challengeExceptions, challengeDescriptions, customChallengeEnabled, customChallengeName, customChallengeDescription,
			characterEnabled, characterLabel, characterOptions,
			restrictions, timingMethod,
			selectedGlitches, nmgRules, customGlitches, glitchDocLinks,
			generalRules, involvement, additionalNotes,
			simpleCategoryNotes,
		};
	}

	function loadFormFromDraft(d: any) {
		if (!d) return;
		formMode = d.formMode ?? 'simple';
		gameName = d.gameName ?? '';
		aliases = d.aliases ?? '';
		description = d.description ?? '';
		coverUrl = d.coverUrl ?? '';
		selectedPlatforms = d.selectedPlatforms ?? [];
		customPlatforms = d.customPlatforms ?? [];
		selectedGenres = d.selectedGenres ?? [];
		customGenres = d.customGenres ?? [];
		fullRunCategories = d.fullRunCategories ?? [];
		miniChallengeGroups = (d.miniChallengeGroups ?? []).map((g: any) => ({
			...g,
			childSelect: g.childSelect ?? 'single',
			children: (g.children || []).map((c: any) => ({
				...c,
				fixedLoadoutEnabled: c.fixedLoadoutEnabled ?? !!(c.fixedCharacter || c.fixedRestriction),
			})),
		}));
		selectedChallenges = d.selectedChallenges ?? [];
		challengeExceptions = d.challengeExceptions ?? {};
		challengeDescriptions = d.challengeDescriptions ?? {};
		customChallengeEnabled = d.customChallengeEnabled ?? false;
		customChallengeName = d.customChallengeName ?? '';
		customChallengeDescription = d.customChallengeDescription ?? '';
		characterEnabled = d.characterEnabled ?? false;
		characterLabel = d.characterLabel ?? 'Character';
		characterOptions = d.characterOptions ?? [];
		restrictions = (d.restrictions ?? []).map((r: any) => ({ ...r, childSelect: r.childSelect ?? 'single' }));
		timingMethod = d.timingMethod ?? 'RTA';
		selectedGlitches = d.selectedGlitches ?? [];
		nmgRules = d.nmgRules ?? '';
		customGlitches = d.customGlitches ?? [];
		glitchDocLinks = d.glitchDocLinks ?? '';
		generalRules = d.generalRules ?? '';
		involvement = d.involvement ?? [];
		additionalNotes = d.additionalNotes ?? '';
		simpleCategoryNotes = d.simpleCategoryNotes ?? '';
	}

	async function checkForDraft() {
		if (!$user) { draftLoading = false; return; }
		try {
			const { data: draft, error } = await supabase
				.from('game_submission_drafts')
				.select('draft_data')
				.eq('user_id', $user.id)
				.maybeSingle();
			if (!error && draft?.draft_data) {
				draftExists = true;
				loadFormFromDraft(draft.draft_data);
				draftRestored = true;
			}
		} catch { /* silent — table may not exist yet */ }
		draftLoading = false;
	}

	async function loadDraft() {
		if (!$user) return;
		try {
			const { data: draft } = await supabase
				.from('game_submission_drafts')
				.select('draft_data')
				.eq('user_id', $user.id)
				.maybeSingle();
			if (draft?.draft_data) {
				loadFormFromDraft(draft.draft_data);
			}
		} catch { /* silent */ }
	}

	async function startFresh() {
		await deleteDraft();
		window.location.reload();
	}

	async function saveDraft() {
		if (!$user) return;
		draftStatus = 'saving';
		try {
			const { error } = await supabase
				.from('game_submission_drafts')
				.upsert({
					user_id: $user.id,
					draft_data: serializeForm(),
					updated_at: new Date().toISOString(),
				}, { onConflict: 'user_id' });
			if (error) throw error;
			draftStatus = 'saved';
			draftExists = true;
			setTimeout(() => { if (draftStatus === 'saved') draftStatus = 'idle'; }, 3000);
		} catch {
			draftStatus = 'error';
			setTimeout(() => { if (draftStatus === 'error') draftStatus = 'idle'; }, 4000);
		}
	}

	async function deleteDraft() {
		if (!$user) return;
		try {
			await supabase
				.from('game_submission_drafts')
				.delete()
				.eq('user_id', $user.id);
			draftExists = false;
		} catch { /* silent */ }
	}

	$effect(() => {
		if ($user) checkForDraft();
	});

	// ── Turnstile ─────────────────────────────────────────────
	let turnstileToken = $state('');
	let turnstileReady = $state(false);
	let turnstileWidgetId = $state<string | null>(null);

	$effect(() => {
		if (!document.querySelector('script[src*="turnstile"]')) {
			const script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
			script.async = true;
			document.head.appendChild(script);
		}

		(window as any).onTurnstileLoad = () => {
			turnstileReady = true;
			renderTurnstile();
		};

		if ((window as any).turnstile) {
			turnstileReady = true;
			renderTurnstile();
		}
	});

	function renderTurnstile() {
		const container = document.getElementById('turnstile-container-game');
		if (!container || !(window as any).turnstile) return;
		if (turnstileWidgetId !== null) {
			(window as any).turnstile.reset(turnstileWidgetId);
			return;
		}
		turnstileWidgetId = (window as any).turnstile.render('#turnstile-container-game', {
			sitekey: PUBLIC_TURNSTILE_SITE_KEY,
			callback: (token: string) => { turnstileToken = token; },
			'expired-callback': () => { turnstileToken = ''; },
			theme: 'auto'
		});
	}

	// ── Validation ────────────────────────────────────────────
	const bannedTermsWarning = $derived.by(() => {
		const fields = [
			{ label: 'Game name', value: gameName },
			{ label: 'Description', value: description },
			{ label: 'Rules', value: generalRules },
			{ label: 'Notes', value: additionalNotes },
			{ label: 'Aliases', value: aliases },
			{ label: 'Custom challenge', value: customChallengeName },
			{ label: 'Custom challenge description', value: customChallengeDescription },
		];
		for (const f of fields) {
			const result = checkBannedTerms(f.value);
			if (result) return `${f.label}: ${result}`;
		}
		return null;
	});

	let submitting = $state(false);
	let result = $state<{ ok: boolean; message: string } | null>(null);

	let hasEnoughCharacters = $derived(
		!characterEnabled || characterOptions.filter(c => c.trim()).length >= 2
	);

	let canSubmit = $derived(
		gameName.trim() &&
		(formMode === 'simple' || (hasAtLeastOneCategory && hasAtLeastOneChallenge && hasEnoughCharacters)) &&
		turnstileToken &&
		!submitting &&
		!bannedTermsWarning &&
		!gameExistsLive &&
		!supporterMode
	);

	// ── Item card editing (game-editor pattern) ─────────────
	let editingSection = $state<string | null>(null);
	let editingIndex = $state<number | null>(null);

	function toggleEdit(section: string, idx: number) {
		if (editingSection === section && editingIndex === idx) { editingSection = null; editingIndex = null; }
		else { editingSection = section; editingIndex = idx; }
	}
	function isEditing(section: string, idx: number) { return editingSection === section && editingIndex === idx; }

	function isDuplicateSlug(slug: string, list: any[], excludeIndex: number) {
		if (!slug) return false;
		return list.some((item: any, i: number) => i !== excludeIndex && item.slug === slug);
	}

	// ── Tab navigation (matches game-editor pattern) ─────────
	const SUBMIT_TABS = [
		{ id: 'general', label: m.submit_game_tab_general(), icon: '🎮', required: true },
		{ id: 'categories', label: m.submit_game_tab_categories(), icon: '📂', required: true },
		{ id: 'challenges', label: m.submit_game_tab_challenges(), icon: '⚔️', required: true },
		{ id: 'characters', label: m.submit_game_tab_characters(), icon: '🧙' },
		{ id: 'restrictions', label: m.submit_game_tab_restrictions(), icon: '🔒' },
		{ id: 'timing-glitches', label: m.submit_game_tab_timing(), icon: '⏱️' },
		{ id: 'rules-notes', label: m.submit_game_tab_rules(), icon: '📜' },
	];
	let activeTab = $state('general');

	// Accordion state for sub-sections within tabs
	let openSubs = $state<Record<string, boolean>>({
		info: true,
		platforms: false,
		genres: false,
		timing: true,
		glitches: false,
		rules: true,
		involvement: true,
	});
	function toggleSub(key: string) { openSubs = { ...openSubs, [key]: !openSubs[key] }; }

	// Map old section keys to tab IDs for validation links
	const sectionToTab: Record<string, string> = {
		info: 'general', platforms: 'general', genres: 'general',
		categories: 'categories', challenges: 'challenges',
		characters: 'characters', restrictions: 'restrictions',
		timing: 'timing-glitches', glitches: 'timing-glitches',
		rules: 'rules-notes', involvement: 'rules-notes',
	};

	function scrollToSection(key: string) {
		const tabId = sectionToTab[key] || key;
		activeTab = tabId;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// ── Submit ────────────────────────────────────────────────

	async function checkGameName() {
		const name = gameName.trim();
		if (!name) {
			gameCheckResult = null;
			return;
		}

		gameCheckLoading = true;
		try {
			const res = await fetch(`${PUBLIC_WORKER_URL}/check-game-exists`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ game_name: name })
			});
			gameCheckResult = await res.json();
		} catch {
			gameCheckResult = null;
		} finally {
			gameCheckLoading = false;
		}
	}

	async function handleSupportSubmit() {
		if (!gameCheckResult?.pending_game_id || !$user) return;
		supporterSubmitting = true;
		supporterResult = null;

		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess?.access_token) throw new Error('Not authenticated. Please sign in again.');

			const res = await fetch(`${PUBLIC_WORKER_URL}/support-game`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${sess.access_token}`
				},
				body: JSON.stringify({
					pending_game_id: gameCheckResult.pending_game_id,
					notes: supporterNotes.trim() || null,
					suggested_categories: supporterCategories.split(',').map((s: string) => s.trim()).filter(Boolean),
					suggested_challenges: supporterChallenges.split(',').map((s: string) => s.trim()).filter(Boolean),
					suggested_rules: supporterRules.trim() || null,
					turnstile_token: turnstileToken,
				})
			});
			const data = await res.json();
			if (res.ok && data.ok) {
				supporterResult = { ok: true, message: data.message };
				window.scrollTo({ top: 0, behavior: 'smooth' });
			} else {
				supporterResult = { ok: false, message: data.error || 'Failed to save contribution' };
			}
		} catch (err: any) {
			supporterResult = { ok: false, message: err?.message || 'Network error' };
		} finally {
			supporterSubmitting = false;
			if (turnstileWidgetId !== null && (window as any).turnstile) {
				(window as any).turnstile.reset(turnstileWidgetId);
				turnstileToken = '';
			}
		}
	}

	async function handleSubmit() {
		if (!canSubmit || !$user) return;
		submitting = true;
		result = null;

		const clean = (arr: string[]) => arr.map(s => s.trim()).filter(Boolean);

		const allChallenges = [
			...selectedChallenges.map(c => ({
				slug: slugify(c), label: c,
				description: challengeDescriptions[c]?.trim() || null,
				exceptions: challengeExceptions[c]?.trim() || null,
			})),
		];
		if (customChallengeEnabled && customChallengeName.trim()) {
			allChallenges.push({
				slug: slugify(customChallengeName),
				label: customChallengeName.trim(),
				description: customChallengeDescription.trim() || null,
				exceptions: null,
			});
		}

		const allGlitches = [
			...selectedGlitches.map(slug => {
				const preset = GLITCH_PRESETS.find(g => g.slug === slug);
				return { slug, label: preset?.label ?? slug };
			}),
			...customGlitches.filter(g => g.name.trim()).map(g => ({
				slug: slugify(g.name),
				label: g.name.trim(),
				description: g.description.trim() || null,
			})),
		];

		const fullRunPayload = fullRunCategories
			.filter(c => c.label.trim())
			.map(c => ({
				slug: c.slug || slugify(c.label), label: c.label.trim(),
				description: c.description.trim() || null,
				exceptions: c.hasExceptions && c.exceptions.trim() ? c.exceptions.trim() : null,
			}));

		const miniChallengesPayload = miniChallengeGroups
			.filter(g => g.label.trim())
			.map(g => ({
				slug: g.slug || slugify(g.label), label: g.label.trim(),
				description: g.description.trim() || null,
				exceptions: g.hasExceptions && g.exceptions.trim() ? g.exceptions.trim() : null,
				child_select: g.childSelect || 'single',
				children: g.children.filter(c => c.label.trim()).map(c => ({
					slug: c.slug || slugify(c.label), label: c.label.trim(),
					description: c.description.trim() || null,
					exceptions: c.hasExceptions && c.exceptions.trim() ? c.exceptions.trim() : null,
					fixed_loadout: (c.fixedCharacter || c.fixedRestriction) ? {
						character: c.fixedCharacter || undefined,
						restriction: c.fixedRestriction || undefined,
					} : undefined,
				})),
			}));

		const restrictionsPayload = restrictions
			.filter(r => r.label.trim())
			.map(r => ({
				slug: r.slug || slugify(r.label), label: r.label.trim(),
				description: r.description.trim() || null,
				exceptions: r.hasExceptions && r.exceptions.trim() ? r.exceptions.trim() : null,
				child_select: r.childSelect || 'single',
				children: r.children.filter(c => c.label.trim()).map(c => ({
					slug: c.slug || slugify(c.label), label: c.label.trim(),
					description: c.description.trim() || null,
					exceptions: c.hasExceptions && c.exceptions.trim() ? c.exceptions.trim() : null,
				})),
			}));

		const payload = {
			submission_type: formMode === 'simple' ? 'basic' : 'advanced',
			game_name: gameName.trim(),
			aliases: clean(aliases.split(',')),
			description: description.trim() || null,
			platforms: selectedPlatforms,
			custom_platforms: clean(customPlatforms),
			genres: selectedGenres,
			custom_genres: clean(customGenres),
			full_run_categories: fullRunPayload,
			mini_challenges: miniChallengesPayload,
			challenges: allChallenges,
			custom_challenge_description: (customChallengeEnabled && customChallengeDescription.trim()) ? customChallengeDescription.trim() : null,
			character_enabled: characterEnabled,
			character_label: characterLabel.trim() || 'Character',
			characters: clean(characterOptions).map(c => ({ slug: slugify(c), label: c })),
			restrictions: restrictionsPayload,
			timing_method: timingMethod,
			glitches: allGlitches,
			glitch_doc_links: glitchDocLinks.trim() || null,
			nmg_rules: nmgRules.trim() || null,
			general_rules: generalRules.trim() || null,
			involvement,
			additional_notes: additionalNotes.trim() || null,
			simple_category_notes: (formMode === 'simple' && simpleCategoryNotes.trim()) ? simpleCategoryNotes.trim() : null,
			cover_image_url: coverUrl.trim() || null,
			turnstile_token: turnstileToken,
		};

		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess?.access_token) throw new Error('Not authenticated. Please sign in again.');

			const res = await fetch(`${PUBLIC_WORKER_URL}/submit-game`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${sess.access_token}`
				},
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (res.ok && data.ok) {
				result = { ok: true, message: 'Game submitted for review! Our team will review your request and set up the game page if approved.' };
				window.scrollTo({ top: 0, behavior: 'smooth' });
				await deleteDraft();
			} else {
				result = { ok: false, message: data.error || 'Submission failed. Please try again.' };
			}
		} catch (err: any) {
			result = { ok: false, message: err?.message || 'Network error. Please check your connection.' };
		} finally {
			submitting = false;
			if (turnstileWidgetId !== null && (window as any).turnstile) {
				(window as any).turnstile.reset(turnstileWidgetId);
				turnstileToken = '';
			}
		}
	}
</script>

<svelte:head><title>{m.submit_game_page_title()}</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="submit-page">
			<h1>{m.submit_game_heading()}</h1>
			<p class="page-desc">{m.submit_game_description()}</p>
			<p class="page-desc muted">{@html m.submit_game_required_hint({ req: '<span class="req">*</span>' })}</p>

			{#if draftRestored}
				<div class="draft-banner">
					<span>📝 This form was restored from your last session.</span>
					<div class="draft-banner__actions">
						<Button.Root size="sm" onclick={startFresh}>Start Over</Button.Root>
					</div>
				</div>
			{/if}

			{#if result}
				<div class="alert alert--{result.ok ? 'success' : 'error'}">{result.message}</div>
				{#if result.ok}
					<div class="success-actions">
						<a href={localizeHref('/games')} class="btn">{m.btn_browse_games()}</a>
						<Button.Root variant="accent" onclick={() => { result = null; gameName = ''; }}>{m.btn_submit_another()}</Button.Root>
						<a href={localizeHref('/profile/submissions')} class="btn">📋 {m.user_menu_submissions()}</a>
					</div>
				{/if}
			{/if}

			{#if !result?.ok}
				{#if !supporterMode && !gameExistsLive}
					<div class="draft-hint">
						<span>💾</span>
						<span>{m.submit_game_draft_hint()}</span>
					</div>

					<!-- Mode toggle -->
					<nav class="game-tabs mode-tabs">
						<button class="game-tab" class:game-tab--active={formMode === 'simple'}
							onclick={() => { formMode = 'simple'; activeTab = 'general'; }}>
							📝 {m.submit_game_mode_quick()}
						</button>
						<button class="game-tab" class:game-tab--active={formMode === 'advanced'}
							onclick={() => { formMode = 'advanced'; activeTab = 'general'; }}>
							⚙️ {m.submit_game_mode_detailed()}
						</button>
					</nav>
					{#if formMode === 'simple'}
						<p class="mode-hint muted">{m.submit_game_mode_quick_desc()} <button class="link-btn" onclick={() => { formMode = 'advanced'; activeTab = 'general'; }}>{m.submit_game_mode_switch_detailed()}</button></p>
					{:else}
						<p class="mode-hint muted">{m.submit_game_mode_detailed_desc()} <button class="link-btn" onclick={() => { formMode = 'simple'; activeTab = 'general'; }}>{m.submit_game_mode_switch_quick()}</button></p>
					{/if}

					{#if formMode === 'advanced'}
					<!-- Tab bar -->
					<Tabs.Root bind:value={activeTab}>
					<Tabs.List variant="game" class="submit-tabs">
						{#each SUBMIT_TABS as t}
							<Tabs.Trigger variant="game" value={t.id}>
								<span class="tab__icon">{t.icon}</span> {t.label}{#if t.required}<span class="req">*</span>{/if}
							</Tabs.Trigger>
						{/each}
					</Tabs.List>
					</Tabs.Root>
					{/if}
				{/if}

				<div class="submit-panel">

					<!-- ═══ Tab: General ═══ -->
					{#if activeTab === 'general'}
						<div class="tab-content">
							<div class="sub-section" class:sub-section--open={openSubs.info}>
								<button class="sub-toggle" onclick={() => toggleSub('info')}>
									<span>🎮 {m.submit_game_sub_game_info()}</span>
									<span class="sub-toggle__chevron">{openSubs.info ? '▲' : '▼'}</span>
								</button>
								{#if openSubs.info}
								<div class="sub-body">

								<div class="fg">
									<label class="fl" for="gameName">{m.submit_game_game_name()} <span class="req">*</span></label>
									<input id="gameName" type="text" class="fi" bind:value={gameName}
										placeholder="e.g. Sekiro: Shadows Die Twice" maxlength="200"
										onblur={checkGameName}
										oninput={() => { gameCheckResult = null; supporterResult = null; }} />
									<p class="fh"><em>{m.submit_game_game_name_hint()}</em></p>

									{#if gameCheckLoading}
										<p class="game-check game-check--loading">⏳ {m.submit_game_checking()}</p>
									{:else if gameExistsLive}
										<div class="game-check game-check--live">
											<p>✅ <strong>{m.submit_game_exists_live({ name: gameCheckResult?.game_name ?? '' })}</strong></p>
											<a href={localizeHref(`/games/${gameCheckResult?.game_id}`)} class="btn btn--small btn--accent">{m.submit_game_view_game_page()}</a>
										</div>
									{:else if supporterMode}
										<div class="game-check game-check--pending">
											<p>📋 <strong>{gameCheckResult?.game_name}</strong> has already been submitted and is awaiting review{gameCheckResult?.supporter_count ? ` (${gameCheckResult.supporter_count} supporter${gameCheckResult.supporter_count === 1 ? '' : 's'} so far)` : ''}.</p>
											<p>{m.submit_game_add_suggestions_desc()}</p>
										</div>
									{:else if gameCheckResult && !gameCheckResult.exists && gameName.trim()}
										<p class="game-check game-check--clear">✓ {m.submit_game_first_submit()}</p>
									{/if}
								</div>
								<div class="fg">
									<label class="fl" for="aliases">{m.submit_game_aliases()}</label>
									<input id="aliases" type="text" class="fi" bind:value={aliases} placeholder="e.g. Sekiro, SSDT, Shadows Die Twice" maxlength="500" />
									<p class="fh"><em>Comma-separated. Include abbreviations, acronyms, or alternate titles people commonly use for this game.</em></p>
								</div>
								<div class="fg">
									<label class="fl" for="description">{m.submit_game_description_label()}</label>
									<textarea id="description" class="fi" bind:value={description} placeholder="e.g. Sekiro: Shadows Die Twice is a 2019 action-adventure game developed by FromSoftware..." rows="3" maxlength="2000"></textarea>
								</div>
								<div class="fg">
									<label class="fl">{m.submit_game_cover_image()}</label>
									{#if coverUrl}
										<div class="cover-preview">
											<div class="cover-preview__img" style="background-image: url('{coverUrl}');"></div>
											<div class="cover-preview__actions">
												<label class="btn btn--small cover-upload-btn">
													📷 {m.submit_game_cover_replace()}
													<input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleCoverFileSelect} hidden />
												</label>
												<button type="button" class="btn btn--small btn--reset" onclick={() => { coverUrl = ''; coverTempKey = crypto.randomUUID(); }}>✕ {m.submit_game_cover_remove()}</button>
											</div>
										</div>
									{:else}
										<div class="cover-empty">
											<label class="cover-empty__upload">
												<span class="cover-empty__icon">📷</span>
												<span>{m.submit_game_cover_upload()}</span>
												<input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleCoverFileSelect} hidden />
											</label>
										</div>
									{/if}
									<p class="fh">{m.submit_game_cover_hint()}</p>
									<Collapsible.Root class="url-fallback">
										<Collapsible.Trigger class="url-fallback__toggle">{m.submit_game_cover_url_fallback()}</Collapsible.Trigger>
										<Collapsible.Content>
											<div class="fg mt-2">
												<input type="text" class="fi" bind:value={coverUrl} placeholder="https://..." />
											</div>
										</Collapsible.Content>
									</Collapsible.Root>
								</div>

							</div>
							{/if}
							</div>

							{#if supporterMode}
								<!-- ── Supporter Contribution Form ── -->
								<div class="supporter-form">
									<h3 class="tab-heading">🤝 {m.submit_game_supporter_heading()}</h3>
									<p class="fh mb-2">Your input will help our team build the best game page. All contributions are attributed and preserved — nobody can overwrite your suggestions.</p>

									{#if supporterResult}
										<div class="alert alert--{supporterResult.ok ? 'success' : 'error'}">{supporterResult.message}</div>
										{#if supporterResult.ok}
											<div class="success-actions">
												<a href={localizeHref('/games')} class="btn">{m.btn_browse_games()}</a>
												<Button.Root variant="accent" onclick={() => { supporterResult = null; gameCheckResult = null; gameName = ''; }}>{m.btn_submit_another()}</Button.Root>
												<a href={localizeHref('/profile/submissions')} class="btn">📋 {m.user_menu_submissions()}</a>
											</div>
										{/if}
									{/if}

									{#if !supporterResult?.ok}
										<div class="fg">
											<label class="fl" for="supporterCategories">{m.submit_game_supporter_categories()}</label>
											<input id="supporterCategories" type="text" class="fi" bind:value={supporterCategories} placeholder="e.g. Any%, All Bosses, No Hit" maxlength="500" />
											<p class="fh"><em>Comma-separated. What categories should this game have?</em></p>
										</div>
										<div class="fg">
											<label class="fl" for="supporterChallenges">{m.submit_game_supporter_challenges()}</label>
											<input id="supporterChallenges" type="text" class="fi" bind:value={supporterChallenges} placeholder="e.g. Hitless, Deathless, Damageless" maxlength="500" />
											<p class="fh"><em>Comma-separated. What challenge types apply?</em></p>
										</div>
										<div class="fg">
											<label class="fl" for="supporterRules">{m.submit_game_supporter_rules()}</label>
											<textarea id="supporterRules" class="fi" bind:value={supporterRules} placeholder="Any rules or guidelines you'd suggest for this game's challenge runs..." rows="4" maxlength="3000"></textarea>
										</div>
										<div class="fg">
											<label class="fl" for="supporterNotes">{m.submit_game_supporter_notes()}</label>
											<textarea id="supporterNotes" class="fi" bind:value={supporterNotes} placeholder="Any other thoughts, context, or suggestions for the review team..." rows="3" maxlength="3000"></textarea>
										</div>
									{/if}
								</div>
							{/if}

							{#if !supporterMode && !gameExistsLive}
							<div class="sub-section" class:sub-section--open={openSubs.platforms}>
								<button class="sub-toggle" onclick={() => toggleSub('platforms')}>
									<span>🖥️ {m.submit_game_sub_platforms()}</span>
									<span class="sub-toggle__chevron">{openSubs.platforms ? '▲' : '▼'}</span>
								</button>
								{#if openSubs.platforms}
								<div class="sub-body">
								<div class="fg">
									<label class="fl">{m.submit_game_sub_platforms()}</label>
									<p class="fh mb-2">Only the top {PLATFORM_DISPLAY_LIMIT} platforms are shown. If you don't see your platform, try searching for it.</p>
									<input type="text" class="fi mb-2" bind:value={platformSearch} placeholder={m.submit_game_search_platforms()} />
									{#if selectedPlatforms.length > 0}
										<div class="selected-chips mb-2">
											{#each selectedPlatforms as slug}
												{@const plat = platforms.find((p: any) => p.slug === slug)}
												<button type="button" class="chip chip--selected" onclick={() => togglePlatform(slug)}>{plat?.label || slug} ✕</button>
											{/each}
										</div>
									{/if}
									<div class="checkbox-grid">
										{#each filteredPlatforms as p}
											<label class="check-item">
												<Checkbox.Root checked={selectedPlatforms.includes(p.slug)} onCheckedChange={() => togglePlatform(p.slug)} />
												<span>{p.label}</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="fg">
									<label class="fl">{m.submit_game_other_platforms()}</label>
									<p class="fh mb-2">{m.submit_game_other_platforms_hint()}</p>
									{#each customPlatforms as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={customPlatforms[i]} placeholder="e.g. Amiga" maxlength="60" />
											<button type="button" class="list-row__remove" onclick={() => removeCustomPlatform(i)}><X size={14} /></button>
										</div>
										{#if customPlatformDuplicate(customPlatforms[i])}
											<p class="fh" style="color: #ef4444;">{customPlatformDuplicate(customPlatforms[i])}</p>
										{/if}
									{/each}
									{#if customPlatforms.length < 2}
										<Button.Root size="sm" class="mt-2" onclick={addCustomPlatform}>{m.submit_game_add_platform()}</Button.Root>
									{/if}
								</div>

							</div>
							{/if}
							</div>

							<div class="sub-section" class:sub-section--open={openSubs.genres}>
								<button class="sub-toggle" onclick={() => toggleSub('genres')}>
									<span>🏷️ {m.submit_game_sub_genres()}</span>
									<span class="sub-toggle__chevron">{openSubs.genres ? '▲' : '▼'}</span>
								</button>
								{#if openSubs.genres}
								<div class="sub-body">
								<div class="fg">
									<label class="fl">{m.submit_game_sub_genres()}</label>
									<p class="fh mb-2">Add up to 5 genres total (including custom). Only the top {GENRE_DISPLAY_LIMIT} genres are shown. If you don't see your genre, try searching for it.</p>
									<input type="text" class="fi mb-2" bind:value={genreSearch} placeholder={m.submit_game_search_genres()} />
									{#if selectedGenres.length > 0}
										<div class="selected-chips mb-2">
											{#each selectedGenres as slug}
												{@const genre = genres.find((g: any) => g.slug === slug)}
												<button type="button" class="chip chip--selected" onclick={() => toggleGenre(slug)}>{genre?.label || slug} ✕</button>
											{/each}
										</div>
									{/if}
									{#if totalGenreCount >= 5}
										<p class="fh" style="color: var(--accent);">Maximum of 5 genres reached ({selectedGenres.length} selected + {customGenres.filter(g => g.trim()).length} custom).</p>
									{/if}
									<div class="checkbox-grid">
										{#each filteredGenres as g}
											<label class="check-item" class:check-item--disabled={totalGenreCount >= 5 && !selectedGenres.includes(g.slug)}>
												<Checkbox.Root
													checked={selectedGenres.includes(g.slug)}
													onCheckedChange={() => toggleGenre(g.slug)}
													disabled={totalGenreCount >= 5 && !selectedGenres.includes(g.slug)}
												/>
												<span>{g.label}</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="fg">
									<label class="fl">{m.submit_game_other_genres()}</label>
									<p class="fh mb-2">Don't see a genre that fits? Add up to 3 custom genres (counts toward the 5 max). These will be reviewed by our team.</p>
									{#each customGenres as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={customGenres[i]} placeholder="e.g. Tower Defense" maxlength="60" />
											<button type="button" class="list-row__remove" onclick={() => removeCustomGenre(i)}><X size={14} /></button>
										</div>
										{#if customGenreDuplicate(customGenres[i])}
											<p class="fh" style="color: #ef4444;">{customGenreDuplicate(customGenres[i])}</p>
										{/if}
									{/each}
									{#if totalGenreCount < 5 && customGenres.length < 3}
										<Button.Root size="sm" class="mt-2" onclick={addCustomGenre}>{m.submit_game_add_genre()}</Button.Root>
									{/if}
								</div>

							</div>
							{/if}
							</div>

							{/if}

						</div>
					{/if}
					{#if formMode === 'simple' && activeTab === 'general'}
						<!-- Simple mode: challenges, categories, timing, rules, involvement, notes -->
						<div class="tab-content simple-extras">
							<div class="fg">
								<label class="fl">Standard Challenges</label>
								<p class="fh mb-2">Select the challenge types that apply to this game. Each uses the global CRC definition — after submission, game-specific rules can be proposed.</p>
								<div class="simple-challenges">
									{#each challengeDefs as ch}
										<div class="simple-challenge" class:simple-challenge--selected={selectedChallenges.includes(ch.label)}>
											<label class="simple-challenge__toggle">
												<Checkbox.Root checked={selectedChallenges.includes(ch.label)} onCheckedChange={() => toggleChallenge(ch.label)} />
												<strong>{ch.label}</strong>
											</label>
											{#if ch.description}
												<p class="simple-challenge__def">{ch.description.replace(/^- /gm, '• ').trim()}</p>
											{/if}
										</div>
									{/each}
								</div>
							</div>

							<div class="fg">
								<label class="fl">Run Categories <span class="optional-tag">(optional)</span></label>
								<p class="fh mb-2">If you don't specify categories, the game will default to <strong>Any%</strong> and <strong>100%</strong>. You can add more specific categories later.</p>
								<textarea class="fi" bind:value={simpleCategoryNotes} placeholder="e.g. Any%, 100%, All Bosses, Low%, Glitchless&#10;&#10;Describe any specific categories you'd like this game to have and what they entail." rows="4" maxlength="3000"></textarea>
								<p class="fh">After the game is approved, categories can be refined by game moderators.</p>
							</div>

							<div class="fg">
								<label class="fl">{m.submit_game_timing_method()}</label>
								<RadioGroup.Root bind:value={timingMethod}>
									{#each TIMING_OPTIONS as opt}
										<RadioGroup.Item value={opt.value}>{opt.label}</RadioGroup.Item>
									{/each}
								</RadioGroup.Root>
							</div>
							<div class="fg">
								<label class="fl" for="rules-simple">{m.submit_game_suggested_rules()}</label>
								<p class="fh mb-2">{m.submit_game_rules_hint()}</p>
								<textarea id="rules-simple" class="fi" bind:value={generalRules} placeholder="e.g. For Unseeded runs, show previous death or..." rows="4" maxlength="5000"></textarea>
								<p class="fh">{m.submit_game_rules_review()}</p>
							</div>
							<div class="fg">
								<label class="fl">{m.submit_game_involvement_question()}</label>
								{#each INVOLVEMENT_OPTIONS as opt}
									<label class="check-item mb-2">
										<Checkbox.Root checked={involvement.includes(opt)} onCheckedChange={() => toggleInvolvement(opt)} />
										<span>{opt}</span>
									</label>
								{/each}
							</div>
							<div class="fg">
								<label class="fl" for="notes-simple">{m.submit_game_additional_notes()}</label>
								<textarea id="notes-simple" class="fi" bind:value={additionalNotes} placeholder="Any other notes, context, or links for our review team." rows="3" maxlength="2000"></textarea>
							</div>
						</div>
					{/if}
					{#if activeTab === 'categories'}
						<div class="tab-content">
							<h3 class="tab-heading">{m.submit_game_categories_heading()}</h3>
								<p class="fh mb-2">{m.submit_game_categories_hint()}</p>
								<div class="game-editor">
									<div class="editor-section">
										<h3 class="subsection-title">{m.submit_game_full_runs()}</h3>
										<p class="subsection-desc">{m.submit_game_full_runs_desc()}</p>
										<div class="item-list">
											{#each fullRunCategories as item, i}
												<div class="item-card" class:item-card--open={isEditing('fr', i)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('fr', i)}>
															<span class="item-card__slug">{item.slug || '(new)'}</span>
															<span class="item-card__label">{item.label || 'Untitled'}</span>
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => { fullRunCategories = fullRunCategories.filter((_, idx) => idx !== i); }}><X size={14} /></button>
														</div>
													</div>
													{#if isEditing('fr', i)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={item.label} oninput={() => { item.slug = slugify(item.label); }} /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="2" bind:value={item.description}></textarea></div>
															<span class="field-hint">Markdown supported</span>
															<label class="toggle-row"><Switch.Root bind:checked={item.hasExceptions} /> Has Exceptions</label>
															{#if item.hasExceptions}
																<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="e.g. This category requires the player to die 3 times. These 3 deaths must be when there are no enemies nearby..."></textarea>
															{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addFullRun}>{m.submit_game_add_full_run()}</button>

										<h3 class="subsection-title mt-2">{m.submit_game_mini_challenges()}</h3>
										<p class="subsection-desc">{m.submit_game_mini_challenges_desc()}</p>
										<div class="item-list">
											{#each miniChallengeGroups as group, gi}
												<div class="item-card item-card--group" class:item-card--open={isEditing('mc', gi)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('mc', gi)}>
															<span class="item-card__slug">{group.slug || '(new)'}</span>
															<span class="item-card__label">{group.label || 'Untitled Group'}</span>
															<span class="item-card__count">{group.children?.length || 0} children</span>
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => removeMiniGroup(gi)}><X size={14} /></button>
														</div>
													</div>
													{#if isEditing('mc', gi)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Slug</label><input type="text" value={group.slug} disabled class="slug-auto" /></div>
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={miniChallengeGroups[gi].label} oninput={() => { group.slug = slugify(group.label); miniChallengeGroups = [...miniChallengeGroups]; }} /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="2" bind:value={miniChallengeGroups[gi].description}></textarea></div>
															<span class="field-hint">Markdown supported</span>
															<label class="toggle-row"><Switch.Root bind:checked={miniChallengeGroups[gi].hasExceptions} /> Has Exceptions</label>
															{#if group.hasExceptions}
																<textarea class="exceptions-textarea" rows="2" bind:value={miniChallengeGroups[gi].exceptions} placeholder="Describe exceptions (Markdown supported)..."></textarea>
															{/if}
															<Collapsible.Root class="children-section">
																<Collapsible.Trigger class="children-title">Children <span class="muted">({group.children.length})</span> <span class="children-chevron">▶</span></Collapsible.Trigger><Collapsible.Content>
																{#if group.children.length > 0}
																	<div class="child-select-row">
																		<label class="field-label">Child Selection Mode</label>
																		<Select.Root bind:value={miniChallengeGroups[gi].childSelect}>
																			<Select.Trigger class="field-input field-input--short">{{ single: 'Single-select (pick one)', multi: 'Multi-select (pick any number)' }[miniChallengeGroups[gi].childSelect] || 'Single-select (pick one)'}</Select.Trigger>
																			<Select.Content>
																				<Select.Item value="single" label="Single-select (pick one)" />
																				<Select.Item value="multi" label="Multi-select (pick any number)" />
																			</Select.Content>
																		</Select.Root>
																	</div>
																{/if}
																{#each group.children as child, ci}
																	<Collapsible.Root class="child-card">
																		<Collapsible.Trigger class="child-card__header">
																			<span class="child-card__chevron">▶</span>
																			<span class="child-card__arrow">└</span>
																			<span class="child-card__slug-text">{child.slug || '(new)'}</span>
																			<span class="child-card__label-text">{child.label || 'Untitled'}</span>
																			<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); removeMiniChild(gi, ci); }}><X size={14} /></button>
																		</Collapsible.Trigger><Collapsible.Content>
																		<div class="child-card__body">
																			<div class="child-card__fields">
																				<div class="field-row--compact"><label>Slug</label><input type="text" value={child.slug} disabled class="slug-auto" /></div>
																				<div class="field-row--compact"><label>Label</label><input type="text" bind:value={miniChallengeGroups[gi].children[ci].label} oninput={() => { child.slug = slugify(child.label); miniChallengeGroups = [...miniChallengeGroups]; }} /></div>
																			</div>
																			<div class="child-card__desc">
																				<textarea rows="2" bind:value={miniChallengeGroups[gi].children[ci].description} placeholder="Description (Markdown supported)..."></textarea>
																			</div>
																			<label class="toggle-row toggle-row--child"><Switch.Root bind:checked={miniChallengeGroups[gi].children[ci].hasExceptions} /> Has Exceptions</label>
																			{#if child.hasExceptions}
																				<textarea class="exceptions-textarea" rows="2" bind:value={miniChallengeGroups[gi].children[ci].exceptions} placeholder="Exceptions (Markdown supported)..."></textarea>
																			{/if}
																				<label class="toggle-row toggle-row--child"><Switch.Root bind:checked={miniChallengeGroups[gi].children[ci].fixedLoadoutEnabled} onCheckedChange={(v: boolean) => { if (!v) { miniChallengeGroups[gi].children[ci].fixedCharacter = ''; miniChallengeGroups[gi].children[ci].fixedRestriction = ''; } miniChallengeGroups = [...miniChallengeGroups]; }} /> Fixed Loadout</label>
																				{#if child.fixedLoadoutEnabled}
																					<div class="fixed-loadout-fields">
																						{#if characterEnabled && characterOptions.filter(c => c.trim()).length > 0}
																							<div class="field-row--compact"><label>{characterLabel}</label><Select.Root bind:value={miniChallengeGroups[gi].children[ci].fixedCharacter}><Select.Trigger>{miniChallengeGroups[gi].children[ci].fixedCharacter || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each characterOptions.filter(c => c.trim()) as ch}<Select.Item value={ch} label={ch} />{/each}</Select.Content></Select.Root></div>
																						{/if}
																						{#if restrictions.filter(r => r.label.trim()).length > 0}
																							<div class="field-row--compact"><label>Restriction</label><Select.Root bind:value={miniChallengeGroups[gi].children[ci].fixedRestriction}><Select.Trigger>{miniChallengeGroups[gi].children[ci].fixedRestriction || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each restrictions.filter(r => r.label.trim()) as r}<Select.Item value={r.label} label={r.label} />{/each}</Select.Content></Select.Root></div>
																						{/if}
																						{#if !(characterEnabled && characterOptions.filter(c => c.trim()).length > 0) && !(restrictions.filter(r => r.label.trim()).length > 0)}
																							<p class="fh" style="color: var(--muted); font-style: italic;">Add characters in the Characters tab or restrictions in the Restrictions tab to select fixed loadout options here.</p>
																						{/if}
																					</div>
																				{/if}
																		</div>
																	</Collapsible.Content></Collapsible.Root>
																{/each}
																<button class="btn btn--add btn--add-sm" onclick={() => addMiniChild(gi)}>{m.submit_game_add_child()}</button>
															</Collapsible.Content></Collapsible.Root>
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addMiniGroup}>{m.submit_game_add_mini_group()}</button>
									</div>
								</div>
						</div>
					{/if}

					<!-- ═══ Tab: Challenges ═══ -->
					{#if activeTab === 'challenges'}
						<div class="tab-content">
							<h3 class="tab-heading">{m.submit_game_challenges_heading()}</h3>
								<div class="game-editor">
									<div class="editor-section">
										<h3 class="subsection-title">{m.submit_game_standard_challenges()}</h3>
										<p class="subsection-desc">{m.submit_game_standard_challenges_desc()}</p>
										<div class="item-list">
											{#each STANDARD_CHALLENGES as c}
												<div class="item-card" class:item-card--open={selectedChallenges.includes(c)}>
													<div class="item-card__header">
														<label class="item-card__toggle" style="cursor:pointer;">
															<Checkbox.Root checked={selectedChallenges.includes(c)} onCheckedChange={() => toggleChallenge(c)} class="mr-2" />
															<span class="item-card__label">{c}</span>
														</label>
													</div>
													{#if selectedChallenges.includes(c)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Description <span class="muted" style="font-weight:normal;font-size:0.8rem;">(optional)</span></label><textarea rows="2" value={challengeDescriptions[c] || ''} oninput={(e) => { challengeDescriptions[c] = e.currentTarget.value; challengeDescriptions = { ...challengeDescriptions }; }} placeholder="What does this challenge mean for this game? (Markdown supported)"></textarea></div>
															<label class="toggle-row"><Switch.Root checked={!!challengeExceptions[c]} onCheckedChange={(v: boolean) => { if (v) challengeExceptions[c] = challengeExceptions[c] || ''; else { const { [c]: _, ...rest } = challengeExceptions; challengeExceptions = rest; } }} /> Has Exceptions</label>
															{#if challengeExceptions[c] != null}
																<textarea class="exceptions-textarea" rows="2" bind:value={challengeExceptions[c]} placeholder="e.g. Health lost from swimming underwater does not count as damage..."></textarea>
															{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								</div>
								<div class="fg">
									<label class="check-item custom-challenge-toggle">
										<Checkbox.Root bind:checked={customChallengeEnabled} />
										<span>{m.submit_game_custom_challenge_toggle()}</span>
									</label>
									{#if customChallengeEnabled}
										<div class="custom-challenge-fields">
											<p class="fh mb-2">{m.submit_game_custom_challenge_hint()}</p>
											<div class="fg">
												<label class="fl" for="customChallengeName">{m.submit_game_challenge_name()}</label>
												<input id="customChallengeName" type="text" class="fi" bind:value={customChallengeName} placeholder="e.g. Deathless" maxlength="100" />
											</div>
											<div class="fg">
												<label class="fl" for="customChallengeDesc">{m.submit_game_challenge_desc()}</label>
												<textarea id="customChallengeDesc" class="fi" bind:value={customChallengeDescription} placeholder="e.g. A death is when your character fails in a way that resets progress, typically with a penalty like losing lives, items, or other resources." rows="3" maxlength="2000"></textarea>
												<p class="fh">Markdown is supported.</p>
											</div>
										</div>
									{/if}
								</div>
						</div>
					{/if}

					<!-- ═══ Tab: Characters ═══ -->
					{#if activeTab === 'characters'}
						<div class="tab-content">
							<h3 class="tab-heading">{m.submit_game_characters_heading()}</h3>
								<label class="toggle-row">
									<Switch.Root bind:checked={characterEnabled} />
									<span class="toggle-label">{m.submit_game_characters_toggle()}</span>
								</label>
								{#if characterEnabled}
									<p class="fh mt-2" style="margin-left: 3.25rem;">At least 2 options are required when characters are enabled.</p>
									<div class="fg mt-2">
										<label class="fl" for="charLabel">{m.submit_game_column_label()}</label>
										<input id="charLabel" type="text" class="fi" bind:value={characterLabel} placeholder="Character" maxlength="50" />
										<p class="fh">What do you call it? "Character", "Weapon", "Weapon / Aspect", "Class", "Loadout", etc.</p>
									</div>
									<div class="fg">
										<label class="fl">{m.submit_game_options()}</label>
										{#each characterOptions as _, i}
											<div class="list-row">
												<input type="text" class="fi" bind:value={characterOptions[i]} placeholder="e.g. Knight, Mage" maxlength="100" />
												<button type="button" class="list-row__remove" onclick={() => removeCharacter(i)}><X size={14} /></button>
											</div>
										{/each}
										<Button.Root size="sm" class="mt-2" onclick={addCharacter}>{m.submit_game_add_option()}</Button.Root>
									</div>
								{/if}
						</div>
					{/if}

					<!-- ═══ Tab: Restrictions ═══ -->
					{#if activeTab === 'restrictions'}
						<div class="tab-content">
							<h3 class="tab-heading">{m.submit_game_restrictions_heading()}</h3>
								<div class="game-editor">
									<div class="editor-section">
										<p class="subsection-desc">{m.submit_game_restrictions_desc()}</p>
										<div class="item-list">
											{#each restrictions as item, i}
												<div class="item-card" class:item-card--group={(item.children?.length ?? 0) > 0} class:item-card--open={isEditing('rs', i)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('rs', i)}>
															<span class="item-card__slug">{item.slug || '(new)'}</span>
															<span class="item-card__label">{item.label || 'Untitled'}</span>
															{#if item.children?.length}<span class="item-card__count">{item.children.length} children</span>{/if}
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => removeRestriction(i)}><X size={14} /></button>
														</div>
													</div>
													{#if isEditing('rs', i)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={restrictions[i].label} oninput={() => { item.slug = slugify(item.label); restrictions = [...restrictions]; }} /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="3" bind:value={restrictions[i].description}></textarea></div>
															<span class="field-hint">Markdown supported</span>
															<label class="toggle-row"><Switch.Root bind:checked={restrictions[i].hasExceptions} /> Has Exceptions</label>
															{#if item.hasExceptions}
																<textarea class="exceptions-textarea" rows="2" bind:value={restrictions[i].exceptions} placeholder="Describe exceptions (Markdown supported)..."></textarea>
															{/if}
															<Collapsible.Root class="children-section">
																<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron">▶</span></Collapsible.Trigger><Collapsible.Content>
																{#if (item.children || []).length > 0}
																	<div class="child-select-row">
																		<label class="field-label">Child Selection Mode</label>
																		<Select.Root bind:value={restrictions[i].childSelect}>
																			<Select.Trigger class="field-input field-input--short">{{ single: 'Single-select (pick one)', multi: 'Multi-select (pick any number)' }[restrictions[i].childSelect] || 'Single-select (pick one)'}</Select.Trigger>
																			<Select.Content>
																				<Select.Item value="single" label="Single-select (pick one)" />
																				<Select.Item value="multi" label="Multi-select (pick any number)" />
																			</Select.Content>
																		</Select.Root>
																	</div>
																{/if}
																{#each item.children || [] as child, ci}
																	<Collapsible.Root class="child-card">
																		<Collapsible.Trigger class="child-card__header">
																			<span class="child-card__chevron">▶</span>
																			<span class="child-card__arrow">└</span>
																			<span class="child-card__slug-text">{child.slug || '(new)'}</span>
																			<span class="child-card__label-text">{child.label || 'Untitled'}</span>
																			<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); removeRestrictionChild(i, ci); }}><X size={14} /></button>
																		</Collapsible.Trigger><Collapsible.Content>
																		<div class="child-card__body">
																			<div class="child-card__fields">
																				<div class="field-row--compact"><label>Slug</label><input type="text" value={child.slug} disabled class="slug-auto" /></div>
																				<div class="field-row--compact"><label>Label</label><input type="text" bind:value={restrictions[i].children[ci].label} oninput={() => { child.slug = slugify(child.label); restrictions = [...restrictions]; }} /></div>
																			</div>
																			<div class="child-card__desc">
																				<textarea rows="2" bind:value={restrictions[i].children[ci].description} placeholder="Description (Markdown supported)..."></textarea>
																			</div>
																			<label class="toggle-row toggle-row--child"><Switch.Root bind:checked={restrictions[i].children[ci].hasExceptions} /> Has Exceptions</label>
																			{#if child.hasExceptions}
																				<textarea class="exceptions-textarea" rows="2" bind:value={restrictions[i].children[ci].exceptions} placeholder="Exceptions (Markdown supported)..."></textarea>
																			{/if}
																		</div>
																	</Collapsible.Content></Collapsible.Root>
																{/each}
																<button class="btn btn--add btn--add-sm" onclick={() => addRestrictionChild(i)}>{m.submit_game_add_child_restriction()}</button>
															</Collapsible.Content></Collapsible.Root>
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addRestriction}>{m.submit_game_add_restriction()}</button>
									</div>
								</div>
						</div>
					{/if}

					<!-- ═══ Tab: Timing & Glitches ═══ -->
					{#if activeTab === 'timing-glitches'}
						<div class="tab-content">
							<div class="sub-section" class:sub-section--open={openSubs.timing}>
								<button class="sub-toggle" onclick={() => toggleSub('timing')}>
									<span>⏱️ {m.submit_game_sub_timing()}</span>
									<span class="sub-toggle__chevron">{openSubs.timing ? '▲' : '▼'}</span>
								</button>
								{#if openSubs.timing}
								<div class="sub-body">
								<div class="fg">
									<label class="fl">{m.submit_game_timing_method()}</label>
									<RadioGroup.Root bind:value={timingMethod}>
										{#each TIMING_OPTIONS as opt}
											<RadioGroup.Item value={opt.value}>{opt.label}</RadioGroup.Item>
										{/each}
									</RadioGroup.Root>
								</div>
								</div>
								{/if}
							</div>

							<div class="sub-section" class:sub-section--open={openSubs.glitches}>
								<button class="sub-toggle" onclick={() => toggleSub('glitches')}>
									<span>🎲 {m.submit_game_sub_glitches()}</span>
									<span class="sub-toggle__chevron">{openSubs.glitches ? '▲' : '▼'}</span>
								</button>
								{#if openSubs.glitches}
								<div class="sub-body">
						
								<div class="game-editor">
									<div class="editor-section">
										<h3 class="subsection-title">{m.submit_game_glitch_presets()}</h3>
										<p class="subsection-desc">{m.submit_game_glitch_presets_desc()}</p>
										<div class="item-list">
											{#each GLITCH_PRESETS as g}
												<div class="item-card" class:item-card--open={selectedGlitches.includes(g.slug)}>
													<div class="item-card__header">
														<label class="item-card__toggle" style="cursor:pointer;">
															<Checkbox.Root checked={selectedGlitches.includes(g.slug)} onCheckedChange={() => toggleGlitch(g.slug)} class="mr-2" />
															<span class="item-card__label">{g.label}</span>
															{#if g.hint}<span class="item-card__count">— {g.hint}</span>{/if}
														</label>
													</div>
													{#if selectedGlitches.includes(g.slug) && g.slug === 'nmg'}
														<div class="item-card__body">
															<div class="field-row--compact"><label>NMG Rules</label><textarea rows="3" bind:value={nmgRules} placeholder="Describe what qualifies as a 'major glitch' for this game and what is/isn't allowed under NMG..."></textarea></div>
															<span class="field-hint">Help our team understand what NMG means for this specific game.</span>
														</div>
													{/if}
												</div>
											{/each}
										</div>

										<h3 class="subsection-title mt-2">{m.submit_game_custom_glitches()}</h3>
										<p class="subsection-desc">{m.submit_game_custom_glitches_desc()}</p>
										<div class="item-list">
											{#each customGlitches as item, i}
												<div class="item-card" class:item-card--open={isEditing('gl', i)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('gl', i)}>
															<span class="item-card__slug">{slugify(item.name) || '(new)'}</span>
															<span class="item-card__label">{item.name || 'Untitled'}</span>
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => removeCustomGlitch(i)}><X size={14} /></button>
														</div>
													</div>
													{#if isEditing('gl', i)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={customGlitches[i].name} placeholder="e.g. No Wrong Warp" /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="3" bind:value={customGlitches[i].description} placeholder="Describe what this glitch category allows or restricts..."></textarea></div>
															<span class="field-hint">Markdown supported</span>
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addCustomGlitch}>{m.submit_game_add_glitch()}</button>

										<div class="fg mt-2">
											<label class="fl" for="glitchDocs">{m.submit_game_glitch_docs()}</label>
											<textarea id="glitchDocs" class="fi" bind:value={glitchDocLinks} placeholder="Links to glitch guides, wikis, or documentation..." rows="2" maxlength="2000"></textarea>
										</div>
									</div>
								</div>
								</div>
								{/if}
								</div>

						</div>
					{/if}

					<!-- ═══ Tab: Rules & Notes ═══ -->
					{#if activeTab === 'rules-notes'}
						<div class="tab-content">
							<div class="sub-section" class:sub-section--open={openSubs.rules}>
								<button class="sub-toggle" onclick={() => toggleSub('rules')}>
									<span>📜 {m.submit_game_sub_rules()}</span>
									<span class="sub-toggle__chevron">{openSubs.rules ? '▲' : '▼'}</span>
								</button>
								{#if openSubs.rules}
								<div class="sub-body">
								<div class="fg">
									<label class="fl" for="rules">{m.submit_game_suggested_rules()}</label>
									<p class="fh mb-2">{m.submit_game_rules_hint()}</p>
									<textarea id="rules" class="fi" bind:value={generalRules} placeholder="e.g. For Unseeded runs, show previous death or..." rows="4" maxlength="5000"></textarea>
									<p class="fh">{m.submit_game_rules_review()}</p>
								</div>
								</div>
								{/if}
							</div>

							<div class="sub-section" class:sub-section--open={openSubs.involvement}>
								<button class="sub-toggle" onclick={() => toggleSub('involvement')}>
									<span>📝 {m.submit_game_sub_involvement()}</span>
									<span class="sub-toggle__chevron">{openSubs.involvement ? '▲' : '▼'}</span>
								</button>
								{#if openSubs.involvement}
								<div class="sub-body">
								<div class="fg">
									<label class="fl">{m.submit_game_involvement_question()}</label>
									{#each INVOLVEMENT_OPTIONS as opt}
										<label class="check-item mb-2">
											<Checkbox.Root checked={involvement.includes(opt)} onCheckedChange={() => toggleInvolvement(opt)} />
											<span>{opt}</span>
										</label>
									{/each}
								</div>
								<div class="fg">
									<label class="fl" for="notes">{m.submit_game_additional_notes()}</label>
									<textarea id="notes" class="fi" bind:value={additionalNotes} placeholder="Let us know any thoughts, ideas, suggestions, or frustrations with the game submission form. Please be respectful in this reply if you have criticisms." rows="3" maxlength="2000"></textarea>
								</div>
								</div>
								{/if}
							</div>
						</div>
					{/if}

				</div> <!-- end submit-panel -->

				<!-- Submit section -->
				{#if !gameExistsLive}
				<div class="submit-section">
					<div id="turnstile-container-game" class="turnstile-container"></div>

					{#if !supporterMode}
						{#if bannedTermsWarning}
							<p class="alert alert--error">{bannedTermsWarning}</p>
						{/if}

						{#if formMode === 'advanced'}
						{#if !hasAtLeastOneCategory && gameName.trim()}
							<button type="button" class="validation-link" onclick={() => scrollToSection('categories')}>
								⚠ {m.submit_game_val_category()}
							</button>
						{/if}
						{#if !hasAtLeastOneChallenge && gameName.trim()}
							<button type="button" class="validation-link" onclick={() => scrollToSection('challenges')}>
								⚠ {m.submit_game_val_challenge()}
							</button>
						{/if}
						{#if !hasEnoughCharacters && gameName.trim()}
							<button type="button" class="validation-link" onclick={() => scrollToSection('characters')}>
								⚠ {m.submit_game_val_characters()}
							</button>
						{/if}
						{/if}

						<div class="submit-buttons">
							<Button.Root size="lg" onclick={saveDraft} disabled={!gameName.trim()}>
								{#if draftStatus === 'saving'}{m.btn_draft_saving()}{:else if draftStatus === 'saved'}{m.btn_draft_saved()}{:else if draftStatus === 'error'}{m.btn_draft_save_failed()}{:else}{m.btn_save_draft()}{/if}
							</Button.Root>
							<Button.Root variant="accent" size="lg" class="submit-btn" onclick={handleSubmit} disabled={!canSubmit}>
								{submitting ? m.btn_submitting() : m.btn_submit_game_request()}
							</Button.Root>
						</div>
					{:else}
						<Button.Root variant="accent" size="lg" class="submit-btn" onclick={handleSupportSubmit}
							disabled={supporterSubmitting || !turnstileToken || (!supporterNotes.trim() && !supporterCategories.trim() && !supporterChallenges.trim() && !supporterRules.trim())}>
							{supporterSubmitting ? m.btn_submitting() : `🤝 ${m.btn_add_suggestions()}`}
						</Button.Root>
					{/if}
				</div>
				{/if}
			{/if}

			<div class="submit-links">
				<p>Want to submit a run instead? <a href={localizeHref("/games")}>{m.btn_browse_games()}</a> and use the Submit Run page.</p>
			</div>
		</div>
	</div>

	<!-- Cover Image Crop Modal -->
	<Dialog.Root open={cropModalOpen} onOpenChange={(o: boolean) => { if (!o) closeCropModal(); }}>
		<Dialog.Overlay />
		<Dialog.Content class="crop-dialog">
			<Dialog.Header>
				<Dialog.Title>Crop Cover Image</Dialog.Title>
				<Dialog.Close>&times;</Dialog.Close>
			</Dialog.Header>
			<div class="crop-dialog__body">
				<p class="muted crop-modal__hint">Drag to reposition. Use the slider to zoom. Output: {CROP_W}×{CROP_H}px.</p>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="crop-area"
					onmousedown={handleCropMouseDown}
					onmousemove={handleCropMouseMove}
					onmouseup={handleCropMouseUp}
					onmouseleave={handleCropMouseUp}
				>
					<canvas bind:this={cropCanvas} width={CROP_W} height={CROP_H}></canvas>
				</div>
				<div class="crop-controls">
					<label class="crop-controls__label">Zoom</label>
					{#if cropImg}
						<Slider.Root
							value={[cropZoom]}
							min={Math.max(CROP_W / cropImg.width, CROP_H / cropImg.height) * 0.5}
							max={Math.max(CROP_W / cropImg.width, CROP_H / cropImg.height) * 4}
							step={0.001}
							onValueChange={handleCropZoom}
							class="crop-controls__slider"
						/>
					{/if}
				</div>
				<div class="crop-modal__actions">
					<Button.Root variant="accent" onclick={confirmCropAndUpload} disabled={coverUploading}>{coverUploading ? 'Uploading...' : 'Crop & Upload'}</Button.Root>
					<button class="btn btn--reset" onclick={closeCropModal} disabled={coverUploading}>Cancel</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Root>
</AuthGuard>

<style>
	.submit-page { max-width: 720px; margin: 2rem auto; }
	.page-desc { font-size: 0.95rem; margin: 0.25rem 0; }
	.req { color: #ef4444; font-weight: 700; }

	/* Draft banner */
	.draft-banner {
		display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;
		background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25);
		border-radius: 10px; padding: 0.85rem 1.25rem; margin: 1rem 0; font-size: 0.9rem;
	}
	.draft-banner__actions { display: flex; gap: 0.5rem; }

	/* Section accordion */
	.draft-hint { display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 1rem; margin-top: 1.5rem; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; font-size: 0.88rem; color: var(--fg); }

	.mode-tabs { margin-top: 1.25rem; margin-bottom: 0; }
	.mode-hint { font-size: 0.84rem; margin: 0.5rem 0 0; line-height: 1.5; }
	.link-btn { background: none; border: none; color: var(--accent); cursor: pointer; font-size: inherit; font-family: inherit; text-decoration: underline; padding: 0; }
	.link-btn:hover { opacity: 0.8; }
	.simple-extras { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 0; }

	/* Tab layout */
	.submit-tabs { margin-top: 1.5rem; margin-bottom: 0; flex-wrap: wrap; overflow-x: visible; }
	.submit-panel { margin-top: 0; display: block; }
	.tab-content { padding: 1.25rem; background: var(--surface); border: 1px solid var(--border); border-top: none; border-radius: 0 0 12px 12px; }
	.tab-heading { margin: 0 0 1rem; font-size: 1.05rem; font-weight: 600; }

	/* Sub-section accordions within tabs */
	.sub-section { border: 1px solid var(--border); border-radius: 10px; margin-bottom: 0.75rem; overflow: hidden; }
	.sub-section--open { border-color: rgba(99, 102, 241, 0.35); }
	.sub-toggle {
		display: flex; justify-content: space-between; align-items: center;
		width: 100%; padding: 0.85rem 1.1rem; background: none; border: none;
		cursor: pointer; font-size: 0.95rem; font-weight: 600; color: var(--fg);
		text-align: left; font-family: inherit;
	}
	.sub-toggle:hover { background: rgba(255,255,255,0.02); }
	.sub-toggle__chevron { font-size: 0.7rem; color: var(--muted); }
	.sub-body { padding: 0 1.1rem 1.1rem; }

	/* URL fallback for cover */
	:global(.url-fallback) { margin-top: 0.5rem; }
	:global(.url-fallback__toggle) { font-size: 0.82rem; color: var(--muted); cursor: pointer; background: none; border: none; padding: 0; font: inherit; }
	:global(.url-fallback__toggle:hover) { color: var(--accent); }


	/* Form elements */
	.fg { margin-bottom: 1.25rem; }
	.fl { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
	.fi {
		width: 100%; padding: 0.6rem 0.75rem;
		border: 1px solid var(--border); border-radius: 6px;
		background: var(--bg); color: var(--fg);
		font-size: 0.95rem; font-family: inherit;
	}
	.fi:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }
	textarea.fi { resize: vertical; }
	.fh { font-size: 0.8rem; color: var(--muted); margin-top: 0.3rem; }

	/* Checkbox grids */
	.checkbox-grid {
		display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.25rem;
	}
	.check-item {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.35rem 0.5rem; border-radius: 6px; cursor: pointer;
		font-size: 0.9rem;
	}
	.check-item:hover { background: rgba(255,255,255,0.03); }
	.check-item--disabled { opacity: 0.4; cursor: not-allowed; }

	/* Dynamic list rows */
	.list-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
	.list-row .fi { flex: 1; }
	.list-row__remove {
		background: none; border: 1px solid var(--border); border-radius: 6px;
		color: var(--muted); cursor: pointer; padding: 0 0.6rem; font-size: 1.1rem;
	}
	.list-row__remove:hover { color: #ef4444; border-color: #ef4444; background: rgba(239, 68, 68, 0.08); }


	/* Custom challenge fields */
	.custom-challenge-toggle { font-weight: 500; padding: 0.5rem 0.5rem; }
	.custom-challenge-fields { padding: 0.75rem 0 0 1.5rem; border-left: 2px solid var(--accent); margin-top: 0.5rem; }

	/* Validation links */
	.validation-link {
		display: block; width: 100%; text-align: center;
		background: none; border: none; cursor: pointer;
		font-size: 0.85rem; color: #ef4444; font-family: inherit;
		padding: 0.35rem 0; text-decoration: underline; text-underline-offset: 2px;
	}
	.validation-link:hover { color: #dc2626; }

	/* Selected chips */
	.selected-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.chip { padding: 0.25rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; border: none; }
	.chip--selected { background: var(--accent); color: white; }

	/* Toggle switch */
	.toggle-row { display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.5rem 0; user-select: none; }
	.toggle-label { font-size: 0.9rem; color: var(--fg); }

	/* Submit section */
	.submit-section { margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
	.turnstile-container { min-height: 65px; }
	.submit-buttons { display: flex; gap: 0.75rem; width: 100%; max-width: 500px; }
	.submit-buttons .btn { flex: 1; justify-content: center; text-align: center; }
	.submit-btn { flex: 1.5 !important; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; }
	.btn:hover { border-color: var(--accent); }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn--accent { background: var(--accent); border-color: var(--accent); color: #fff; }
	.btn--accent:hover { filter: brightness(1.1); }
	.btn--accent:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
	.btn--lg { padding: 0.75rem 2rem; font-size: 1.05rem; min-height: 44px; }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Alerts */
	.alert { padding: 1rem 1.25rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	.success-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
	.submit-links { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border); font-size: 0.9rem; }
	.submit-links a { color: var(--accent); }

	/* Utilities */
	.mb-2 { margin-bottom: 0.5rem; }
	.mt-2 { margin-top: 0.5rem; }

	/* Child selection mode toggle */
	.child-select-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
	.child-select-row .field-label { margin: 0; font-size: 0.8rem; white-space: nowrap; }

	/* Cover image */
	.cover-preview { display: flex; flex-direction: column; gap: 0.5rem; }
	.cover-preview__img {
		width: 100%; max-width: 460px; height: 215px;
		background-size: cover; background-position: center;
		border-radius: 6px; border: 1px solid var(--border);
	}
	.cover-preview__actions { display: flex; gap: 0.5rem; }
	.cover-empty {
		width: 100%; max-width: 460px; height: 215px;
		border: 2px dashed var(--border); border-radius: 6px;
		display: flex; align-items: center; justify-content: center;
	}
	.cover-empty__upload {
		display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
		cursor: pointer; color: var(--muted); font-size: 0.9rem; padding: 1rem;
	}
	.cover-empty__upload:hover { color: var(--accent); }
	.cover-empty__icon { font-size: 2rem; }
	.cover-upload-btn { cursor: pointer; }
	.btn--reset { background: none; border-color: var(--border); color: var(--muted); }
	.btn--reset:hover { border-color: #ef4444; color: #ef4444; }

	/* Crop dialog */
	:global(.crop-dialog) { max-width: 520px !important; }
	.crop-dialog__body { padding: 0 1.5rem 1.5rem; }
	.crop-modal__hint { font-size: 0.82rem; margin: 0 0 0.75rem; }
	.crop-area {
		width: 100%; max-width: 460px; height: 215px; cursor: grab; overflow: hidden;
		border-radius: 6px; border: 1px solid var(--border); margin: 0 auto;
	}
	.crop-area:active { cursor: grabbing; }
	.crop-area canvas { display: block; width: 100%; height: 100%; }
	.crop-controls { display: flex; align-items: center; gap: 0.75rem; margin: 0.75rem 0; }
	.crop-controls__label { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
	:global(.crop-controls__slider.ui-slider) { flex: 1; }
	.crop-modal__actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; flex-wrap: wrap; }
	/* Game existence check */
	.game-check { margin-top: 0.5rem; font-size: 0.88rem; border-radius: 8px; padding: 0.6rem 0.85rem; }
	.game-check--loading { color: var(--muted); background: rgba(99, 102, 241, 0.06); }
	.game-check--live { background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); }
	.game-check--live p { margin: 0 0 0.5rem; }
	.game-check--pending { background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.25); }
	.game-check--pending p { margin: 0 0 0.35rem; }
	.game-check--clear { color: rgba(34, 197, 94, 0.85); background: transparent; padding: 0.4rem 0; }

	/* Supporter form */
	.supporter-form {
		margin-top: 1.5rem; padding: 1.25rem;
		background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
	}
	.supporter-form .tab-heading { margin-bottom: 0.5rem; }
	.supporter-form .fg { margin-top: 1rem; }

	/* Simple mode challenges */
	.simple-challenges { display: flex; flex-direction: column; gap: 0.5rem; }
	.simple-challenge { padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.simple-challenge--selected { border-color: var(--accent); background: rgba(99, 102, 241, 0.04); }
	.simple-challenge__toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.9rem; }
	.simple-challenge__toggle input { width: 18px; height: 18px; accent-color: var(--accent); }
	.simple-challenge__def { margin: 0.4rem 0 0 1.75rem; font-size: 0.82rem; color: var(--muted); line-height: 1.5; white-space: pre-line; }
	.optional-tag { font-weight: 400; font-size: 0.75rem; color: var(--muted); }
</style>
