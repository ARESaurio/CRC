<script lang="ts">
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { isValidVideoUrl } from '$lib/utils';
	import { sanitizeText } from '$lib/utils/markdown';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import { COUNTRIES, matchLocationToCode, getCountry } from '$lib/data/countries';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import AuthGuard from '$components/auth/AuthGuard.svelte';

	// Banner preset groups — each uses a CSS gradient as background (no external URLs, always works)
	const BANNER_PRESETS: { group: string; emoji: string; items: { label: string; gradient: string }[] }[] = [
		{
			group: '🌌 Dark Themes',
			emoji: '🌌',
			items: [
				{ label: 'Midnight', gradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
				{ label: 'Deep Ocean', gradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
				{ label: 'Abyss', gradient: 'linear-gradient(180deg, #000000, #1a1a2e)' },
				{ label: 'Eclipse', gradient: 'linear-gradient(135deg, #0d0d0d, #1a0533, #0d0d0d)' },
				{ label: 'Void Storm', gradient: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' },
			]
		},
		{
			group: '🎮 Gaming',
			emoji: '🎮',
			items: [
				{ label: 'Neon Arcade', gradient: 'linear-gradient(135deg, #0d0221, #190361, #08010d)' },
				{ label: 'Cyber Punk', gradient: 'linear-gradient(135deg, #0a0a0a, #1a0030, #00d4ff22, #ff00ff11)' },
				{ label: 'Level Up', gradient: 'linear-gradient(180deg, #1a1a1a, #003300, #1a1a1a)' },
				{ label: 'Boss Fight', gradient: 'linear-gradient(135deg, #1a0000, #400000, #1a0000)' },
				{ label: 'Speedrun', gradient: 'linear-gradient(90deg, #0a0a0a, #003333, #0a0a0a)' },
			]
		},
		{
			group: '🌅 Vibes',
			emoji: '🌅',
			items: [
				{ label: 'Sunset', gradient: 'linear-gradient(180deg, #ff512f, #dd2476)' },
				{ label: 'Aurora', gradient: 'linear-gradient(135deg, #0d324d, #7f5a83)' },
				{ label: 'Golden Hour', gradient: 'linear-gradient(180deg, #f7971e, #ffd200)' },
				{ label: 'Dusk', gradient: 'linear-gradient(180deg, #2c3e50, #fd746c)' },
				{ label: 'Twilight', gradient: 'linear-gradient(180deg, #0f0c29, #302b63, #24243e)' },
			]
		},
		{
			group: '🏳️‍🌈 Pride',
			emoji: '🏳️‍🌈',
			items: [
				{ label: 'Rainbow', gradient: 'linear-gradient(180deg, #FF0018 0%, #FF0018 16.66%, #FFA52C 16.66%, #FFA52C 33.33%, #FFFF41 33.33%, #FFFF41 50%, #008018 50%, #008018 66.66%, #0000F9 66.66%, #0000F9 83.33%, #86007D 83.33%, #86007D 100%)' },
				{ label: 'Trans', gradient: 'linear-gradient(180deg, #55CDFC 0%, #55CDFC 20%, #F7A8B8 20%, #F7A8B8 40%, #FFFFFF 40%, #FFFFFF 60%, #F7A8B8 60%, #F7A8B8 80%, #55CDFC 80%, #55CDFC 100%)' },
				{ label: 'Bisexual', gradient: 'linear-gradient(180deg, #D60270 0%, #D60270 40%, #9B4F96 40%, #9B4F96 60%, #0038A8 60%, #0038A8 100%)' },
				{ label: 'Lesbian', gradient: 'linear-gradient(180deg, #D62900 0%, #D62900 20%, #FF9B55 20%, #FF9B55 40%, #FFFFFF 40%, #FFFFFF 60%, #D461A6 60%, #D461A6 80%, #A50062 80%, #A50062 100%)' },
				{ label: 'Non-binary', gradient: 'linear-gradient(180deg, #FCF434 0%, #FCF434 25%, #FFFFFF 25%, #FFFFFF 50%, #9C59D1 50%, #9C59D1 75%, #2D2D2D 75%, #2D2D2D 100%)' },
				{ label: 'Pansexual', gradient: 'linear-gradient(180deg, #FF218C 0%, #FF218C 33.33%, #FFD800 33.33%, #FFD800 66.66%, #21B1FF 66.66%, #21B1FF 100%)' },
				{ label: 'Asexual', gradient: 'linear-gradient(180deg, #000000 0%, #000000 25%, #A3A3A3 25%, #A3A3A3 50%, #FFFFFF 50%, #FFFFFF 75%, #800080 75%, #800080 100%)' },
				{ label: 'Aromantic', gradient: 'linear-gradient(180deg, #3DA542 0%, #3DA542 20%, #A7D379 20%, #A7D379 40%, #FFFFFF 40%, #FFFFFF 60%, #A9A9A9 60%, #A9A9A9 80%, #000000 80%, #000000 100%)' },
				{ label: 'Genderqueer', gradient: 'linear-gradient(180deg, #B57EDC 0%, #B57EDC 33.33%, #FFFFFF 33.33%, #FFFFFF 66.66%, #4A8123 66.66%, #4A8123 100%)' },
				{ label: 'Genderfluid', gradient: 'linear-gradient(180deg, #FF76A4 0%, #FF76A4 20%, #FFFFFF 20%, #FFFFFF 40%, #C011D7 40%, #C011D7 60%, #000000 60%, #000000 80%, #2C3E98 80%, #2C3E98 100%)' },
				{ label: 'Progress', gradient: 'linear-gradient(180deg, #FF0018 0%, #FF0018 16.66%, #FFA52C 16.66%, #FFA52C 33.33%, #FFFF41 33.33%, #FFFF41 50%, #008018 50%, #008018 66.66%, #0000F9 66.66%, #0000F9 83.33%, #86007D 83.33%, #86007D 100%), linear-gradient(135deg, #000 25%, #55CDFC 25%, #F7A8B8 50%, #FFFFFF 75%)' },
				{ label: 'Intersex', gradient: 'linear-gradient(180deg, #FFD800 0%, #FFD800 100%)' },
			]
		},
	];

	// Which preset group is expanded
	let openPresetGroup = $state<string | null>(null);

	// Banner display options (stored in socials.banner_opts)
	let bannerSize = $state<'cover' | 'contain' | 'fill'>('cover');
	let bannerPosition = $state<'center' | 'top' | 'bottom'>('center');
	let bannerOpacity = $state(1);
	let bannerMode = $state<'above' | 'background'>('above');
	let bannerIsGradient = $state(false); // true when a gradient preset is selected (no URL)

	// Selected gradient (stored separately from bannerUrl)
	let bannerGradient = $state('');

	function selectPreset(gradient: string) {
		if (bannerGradient === gradient) {
			// deselect
			bannerGradient = '';
			bannerIsGradient = false;
		} else {
			bannerGradient = gradient;
			bannerIsGradient = true;
			bannerUrl = ''; // clear custom URL when choosing a preset
		}
	}


	type Tab = 'basic' | 'customize' | 'socials' | 'goals' | 'highlights';

	interface Goal {
		icon: string;
		title: string;
		description: string;
		game: string;
		completed: boolean;
		current: number;
		total: number;
		date: string;
	}

	interface Highlight {
		type: 'run' | 'playlist';
		// run fields
		game_id: string;
		game_name: string;
		category: string;
		achievement: string;
		video_url: string;
		video_approved: boolean;
		// playlist fields
		title: string;
		playlist_url: string;
		cover_url: string;
		description: string;
	}

	let { data } = $props();
	const gamesList = data.games; // [{ id, name }]

	// ── State ───────────────────────────────────────────────────
	let activeTab = $state<Tab>('basic');
	let loading = $state(true);
	let saving = $state(false);
	let msg = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let runnerId = $state('');
	let profileApprovalStatus = $state('pending');

	// Basic Info
	let displayName = $state('');
	let pronouns = $state('');
	let location = $state('');
	let representing = $state('');
	let bio = $state('');
	let statusMessage = $state('');

	// Country combobox state
	let locationSearch = $state('');
	let locationOpen = $state(false);
	let representingSearch = $state('');
	let representingOpen = $state(false);

	function filteredCountries(search: string) {
		if (!search.trim()) return COUNTRIES.slice(0, 20);
		const lower = search.toLowerCase();
		return COUNTRIES.filter(c =>
			c.name.toLowerCase().includes(lower) || c.code.toLowerCase() === lower
		).slice(0, 20);
	}

	function selectLocation(c: typeof COUNTRIES[0]) {
		location = c.code;
		locationSearch = c.flag + ' ' + c.name;
		locationOpen = false;
	}

	function clearLocation() {
		location = '';
		locationSearch = '';
		locationOpen = false;
	}

	function selectRepresenting(c: typeof COUNTRIES[0]) {
		representing = c.code;
		representingSearch = c.flag + ' ' + c.name;
		representingOpen = false;
	}

	function clearRepresenting() {
		representing = '';
		representingSearch = '';
		representingOpen = false;
	}

	// Customize
	let avatarUrl = $state('');
	let bannerUrl = $state('');
	let uploading = $state(false);
	let uploadMsg = $state('');

	// Socials
	let socialTwitch = $state('');
	let socialYoutube = $state('');
	let socialDiscord = $state('');
	let socialTwitter = $state('');
	let socialBluesky = $state('');
	let socialInstagram = $state('');
	let socialSpeedruncom = $state('');
	let socialSteam = $state('');
	let otherLinks = $state<string[]>(['']);
	let existingApprovedOther = $state<string[]>([]);
	let existingPendingOther = $state<string[]>([]);

	// Privacy
	let hideActivity = $state(false);

	// Goals
	let goals = $state<Goal[]>([]);

	// Highlights
	let highlights = $state<Highlight[]>([]);

	// ── Bio character count ─────────────────────────────────────
	let bioCount = $derived(bio.length);

	// ── Banned terms validation ──────────────────────────────────
	const bannedTermsWarning = $derived.by(() => {
		const fields = [
			{ label: 'Display name', value: displayName },
			{ label: 'Bio', value: bio },
			{ label: 'Status message', value: statusMessage },
			...goals.flatMap((g, i) => [
				{ label: `Goal ${i + 1} title`, value: g.title },
				{ label: `Goal ${i + 1} description`, value: g.description },
			]),
			...highlights.flatMap((h, i) => [
				{ label: `Highlight ${i + 1} category`, value: h.category },
				{ label: `Highlight ${i + 1} achievement`, value: h.achievement },
			]),
		];
		for (const f of fields) {
			const result = checkBannedTerms(f.value);
			if (result) return `${f.label}: ${result}`;
		}
		return null;
	});

	// ── Load existing profile ───────────────────────────────────
	$effect(() => {
		if ($user) loadProfile();
	});

	async function loadProfile() {
		loading = true;
		try {
			const { data: profile, error } = await supabase
				.from('profiles')
				.select('runner_id, display_name, pronouns, location, bio, status_message, avatar_url, banner_url, socials, personal_goals, featured_runs, other_links_pending, status')
				.eq('user_id', $user!.id)
				.maybeSingle();

			if (error || !profile) {
				msg = { type: 'error', text: 'No profile found. Please create a profile first.' };
				loading = false;
				return;
			}

			profileApprovalStatus = profile.status || 'pending';

			runnerId = profile.runner_id || '';
			displayName = profile.display_name || '';
			pronouns = profile.pronouns || '';
			// If location is a 2-letter code, use it; otherwise try to match freeform text
			const rawLoc = profile.location || '';
			if (rawLoc.length === 2 && COUNTRIES.some(c => c.code === rawLoc.toUpperCase())) {
				location = rawLoc.toUpperCase();
			} else {
				location = matchLocationToCode(rawLoc) || rawLoc;
			}
			bio = profile.bio || '';
			statusMessage = profile.status_message || '';
			avatarUrl = profile.avatar_url || '';
			bannerUrl = profile.banner_url || '';

			// Socials
			const s = profile.socials || {};
			representing = s.representing || '';
			// Initialize combobox display text from loaded codes
			const locCountry = COUNTRIES.find(c => c.code === location);
			locationSearch = locCountry ? locCountry.flag + ' ' + locCountry.name : location;
			const repCountry = COUNTRIES.find(c => c.code === representing);
			representingSearch = repCountry ? repCountry.flag + ' ' + repCountry.name : '';
			// Banner display opts
			const bo = s.banner_opts || {};
			bannerSize = bo.size || 'cover';
			bannerPosition = bo.position || 'center';
			bannerOpacity = bo.opacity ?? 1;
			bannerMode = bo.mode || 'above';
			bannerGradient = bo.gradient || '';
			bannerIsGradient = !!bannerGradient;
			socialTwitch = s.twitch || '';
			socialYoutube = s.youtube || '';
			socialDiscord = s.discord || '';
			socialTwitter = s.twitter || '';
			socialBluesky = s.bluesky || '';
			socialInstagram = s.instagram || '';
			socialSpeedruncom = s.speedruncom || '';
			socialSteam = s.steam || '';
			existingApprovedOther = Array.isArray(s.other) ? s.other : [];
			existingPendingOther = Array.isArray(profile.other_links_pending) ? profile.other_links_pending : [];
			otherLinks = [''];
			hideActivity = !!s.hide_activity;

			// Goals
			goals = Array.isArray(profile.personal_goals) ? profile.personal_goals : [];

			// Highlights
			highlights = Array.isArray(profile.featured_runs) ? profile.featured_runs : [];
		} catch (err: any) {
			msg = { type: 'error', text: err?.message || 'Failed to load profile.' };
		}
		loading = false;
	}

	// ── Save ────────────────────────────────────────────────────
	async function handleSave() {
		if (!$user) return;
		if (profileApprovalStatus !== 'approved') {
			msg = { type: 'error', text: 'Your profile is pending approval. Editing is locked until an admin approves your profile.' };
			return;
		}
		if (bannedTermsWarning) {
			msg = { type: 'error', text: bannedTermsWarning };
			return;
		}
		saving = true;
		msg = null;

		try {
			// Build socials jsonb — only include non-empty values
			const socials: Record<string, any> = {};
			if (socialTwitch.trim()) socials.twitch = socialTwitch.trim();
			if (socialYoutube.trim()) socials.youtube = socialYoutube.trim();
			if (socialDiscord.trim()) socials.discord = socialDiscord.trim();
			if (socialTwitter.trim()) socials.twitter = socialTwitter.trim();
			if (socialBluesky.trim()) socials.bluesky = socialBluesky.trim();
			if (socialInstagram.trim()) socials.instagram = socialInstagram.trim();
			if (socialSpeedruncom.trim()) socials.speedruncom = socialSpeedruncom.trim();
			if (socialSteam.trim()) socials.steam = socialSteam.trim();
			if (representing) socials.representing = representing;
			if (hideActivity) socials.hide_activity = true;
			const bannerOpts: Record<string,any> = { size: bannerSize, position: bannerPosition, opacity: bannerOpacity, mode: bannerMode };
			if (bannerGradient) bannerOpts.gradient = bannerGradient;
			socials.banner_opts = bannerOpts;
			// Preserve approved other links
			if (existingApprovedOther.length > 0) socials.other = existingApprovedOther;

			// New "other" links → go to other_links_pending for admin review
			const newOtherLinks = otherLinks
				.map(l => l.trim())
				.filter(l => l && isValidUrl(l) && !existingApprovedOther.includes(l) && !existingPendingOther.includes(l));
			const pendingOther = [...existingPendingOther, ...newOtherLinks];

			// Sanitize bio — strip any HTML tags before saving
			const cleanBio = sanitizeText(bio, 1000);

			const update: Record<string, any> = {
				display_name: displayName.trim(),
				pronouns: pronouns.trim() || null,
				location: location.trim() || null,
				bio: cleanBio || null,
				status_message: statusMessage.trim() || null,
				avatar_url: avatarUrl || null,
				banner_url: (!bannerIsGradient && bannerUrl.trim()) ? bannerUrl.trim() : null,
				socials,
				other_links_pending: pendingOther.length > 0 ? pendingOther : null,
				personal_goals: goals.length > 0 ? goals : null,
				featured_runs: highlights.length > 0 ? highlights : null,
				updated_at: new Date().toISOString()
			};

			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) throw new Error('Not authenticated. Please sign in again.');

			const res = await fetch(
				`${PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${sess.user.id}`,
				{
					method: 'PATCH',
					headers: {
						'apikey': PUBLIC_SUPABASE_ANON_KEY,
						'Authorization': `Bearer ${sess.access_token}`,
						'Content-Type': 'application/json',
						'Prefer': 'return=minimal'
					},
					body: JSON.stringify(update)
				}
			);

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || `Save failed (${res.status})`);
			}

			// Update local pending state
			existingPendingOther = pendingOther;
			otherLinks = [''];

			msg = { type: 'success', text: 'Profile updated!' };
			// Scroll to top to show message
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (err: any) {
			msg = { type: 'error', text: err?.message || 'Failed to save.' };
		}
		saving = false;
	}

	// ── Avatar Upload ───────────────────────────────────────────
	async function handleAvatarUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !$user) return;

		// Validate
		if (!['image/png', 'image/jpeg'].includes(file.type)) {
			uploadMsg = 'Only PNG or JPG files are allowed.';
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			uploadMsg = 'File must be under 2MB.';
			return;
		}

		uploading = true;
		uploadMsg = '';

		try {
			const ext = file.type === 'image/png' ? 'png' : 'jpg';
			const path = `${$user.id}/avatar.${ext}`;

			// Upload (upsert to overwrite existing)
			const { error: uploadError } = await supabase.storage
				.from('avatars')
				.upload(path, file, { upsert: true, contentType: file.type });

			if (uploadError) throw uploadError;

			// Get public URL
			const { data: urlData } = supabase.storage
				.from('avatars')
				.getPublicUrl(path);

			// Append cache-busting param
			avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
			uploadMsg = 'Avatar uploaded!';
		} catch (err: any) {
			uploadMsg = err?.message || 'Upload failed.';
		}
		uploading = false;
		input.value = '';
	}

	async function removeAvatar() {
		if (!$user) return;
		uploading = true;
		try {
			// Try to remove both extensions
			await supabase.storage.from('avatars').remove([
				`${$user.id}/avatar.png`,
				`${$user.id}/avatar.jpg`
			]);
			avatarUrl = '';
			uploadMsg = 'Avatar removed.';
		} catch {
			uploadMsg = 'Failed to remove avatar.';
		}
		uploading = false;
	}

	// ── URL Validation ──────────────────────────────────────────
	function isValidUrl(s: string): boolean {
		try {
			const u = new URL(s);
			return u.protocol === 'https:' || u.protocol === 'http:';
		} catch { return false; }
	}

	// ── Goals helpers ───────────────────────────────────────────
	function addGoal() {
		if (goals.length >= 10) return;
		goals = [...goals, { icon: '🎯', title: '', description: '', game: '', completed: false, current: 0, total: 100, date: '' }];
	}

	function removeGoal(i: number) {
		goals = goals.filter((_, idx) => idx !== i);
		goalSearchText = goalSearchText.filter((_, idx) => idx !== i);
		goalDropdownOpen = goalDropdownOpen.filter((_, idx) => idx !== i);
	}

	// Typeahead state for game selection in goals
	let goalSearchText = $state<string[]>([]);
	let goalDropdownOpen = $state<boolean[]>([]);

	function getGoalSearchText(i: number): string {
		if (goalSearchText[i] !== undefined) return goalSearchText[i];
		// Initialize from existing goal game name
		const game = gamesList.find((g: any) => g.id === goals[i]?.game);
		return game?.name || '';
	}

	function filteredGames(search: string) {
		if (!search.trim()) return gamesList.slice(0, 20);
		const lower = search.toLowerCase();
		return gamesList.filter((g: any) => g.name.toLowerCase().includes(lower)).slice(0, 20);
	}

	function selectGoalGame(i: number, game: any) {
		goals[i] = { ...goals[i], game: game.id };
		goalSearchText[i] = game.name;
		goalDropdownOpen[i] = false;
	}

	function clearGoalGame(i: number) {
		goals[i] = { ...goals[i], game: '' };
		goalSearchText[i] = '';
		goalDropdownOpen[i] = false;
	}

	function handleGoalSearchBlur(i: number) {
		// Delay to allow click on dropdown item
		setTimeout(() => { goalDropdownOpen[i] = false; }, 200);
	}

	// Completion prompt: when current >= total and not already completed
	function handleProgressChange(i: number) {
		const g = goals[i];
		if (g && g.total > 0 && g.current >= g.total && !g.completed) {
			if (confirm(`🎉 You've reached ${g.current}/${g.total}! Mark this goal as completed?`)) {
				goals[i] = { ...goals[i], completed: true, date: new Date().toISOString().split('T')[0] };
			}
		}
	}

	// ── Highlights helpers ──────────────────────────────────────
	function addHighlight(type: 'run' | 'playlist' = 'run') {
		if (highlights.length >= 3) return;
		if (type === 'playlist') {
			highlights = [...highlights, { type: 'playlist', game_id: '', game_name: '', category: '', achievement: '', video_url: '', video_approved: false, title: '', playlist_url: '', cover_url: '', description: '' }];
		} else {
			highlights = [...highlights, { type: 'run', game_id: '', game_name: '', category: '', achievement: '', video_url: '', video_approved: false, title: '', playlist_url: '', cover_url: '', description: '' }];
		}
	}

	function removeHighlight(i: number) {
		highlights = highlights.filter((_, idx) => idx !== i);
	}

	function setHighlightGame(i: number, gameId: string) {
		const game = gamesList.find((g: any) => g.id === gameId);
		if (!game) return;
		highlights[i] = { ...highlights[i], game_id: game.id, game_name: game.name };
	}

	// ── Video URL lookup for highlights ─────────────────────────
	let videoMeta = $state<Record<number, { fetching: boolean; title: string; error: string }>>({});
	let videoDebounces: Record<number, ReturnType<typeof setTimeout>> = {};

	async function fetchHighlightVideoMeta(index: number, url: string) {
		if (!videoMeta[index]) videoMeta[index] = { fetching: false, title: '', error: '' };
		videoMeta[index].fetching = true;
		videoMeta[index].title = '';
		videoMeta[index].error = '';
		try {
			const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
			if (!res.ok) throw new Error('Fetch failed');
			const json = await res.json();
			if (json.error) {
				videoMeta[index] = { fetching: false, title: '', error: 'Could not retrieve video info.' };
			} else {
				videoMeta[index] = { fetching: false, title: json.title || '', error: '' };
			}
		} catch {
			videoMeta[index] = { fetching: false, title: '', error: 'Could not retrieve video info.' };
		}
	}

	function onHighlightVideoChange(index: number) {
		const url = highlights[index]?.video_url || '';
		if (videoDebounces[index]) clearTimeout(videoDebounces[index]);
		if (!url || !isValidVideoUrl(url)) {
			videoMeta[index] = { fetching: false, title: '', error: '' };
			return;
		}
		videoMeta[index] = { fetching: true, title: '', error: '' };
		videoDebounces[index] = setTimeout(() => fetchHighlightVideoMeta(index, url), 600);
	}

	// ── Other links helpers ─────────────────────────────────────
	function addOtherLink() {
		if (otherLinks.length >= 3) return;
		otherLinks = [...otherLinks, ''];
	}

	function removeOtherLink(i: number) {
		otherLinks = otherLinks.filter((_, idx) => idx !== i);
	}

	// ── Tabs ────────────────────────────────────────────────────
	const TABS: { id: Tab; icon: string; label: string }[] = [
		{ id: 'basic', icon: '👤', label: 'Basic Info' },
		{ id: 'customize', icon: '🎨', label: 'Customize' },
		{ id: 'socials', icon: '🔗', label: 'Socials' },
		{ id: 'goals', icon: '🎯', label: 'Goals' },
		{ id: 'highlights', icon: '📌', label: 'Highlights' }
	];
</script>

<svelte:head><title>Edit Profile | Challenge Run Community</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="edit-page">
			<p class="muted mb-3">
				<a href={runnerId ? `/runners/${runnerId}` : '/profile'}>← Back to profile</a>
			</p>

			<h1>Edit Profile</h1>
			<p class="muted mb-4">Update your runner profile. Changes save instantly (except "Other Links" which require approval).</p>

			{#if msg}
				<div class="alert alert--{msg.type}">{msg.text}</div>
			{/if}

			{#if profileApprovalStatus !== 'approved' && !loading}
				<div class="alert alert--warning">⏳ Your profile is pending approval. You can view your profile details, but editing is locked until an admin approves it.</div>
			{/if}

			{#if loading}
				<div class="edit-loading">
					<div class="spinner"></div>
					<p class="muted">Loading profile...</p>
				</div>
			{:else}
				<!-- Profile Preview — full width at top -->
				{@const effectiveBannerCss = bannerIsGradient && bannerGradient
					? bannerGradient
					: bannerUrl ? `url(${bannerUrl})` : ''}
				{@const effectiveBgSize = bannerSize === 'fill' ? '100% 100%' : bannerSize === 'contain' ? 'contain' : 'cover'}
				{@const effectiveBgPos = bannerPosition === 'top' ? 'top' : bannerPosition === 'bottom' ? 'bottom' : 'center'}

				<!-- Sticky header: preview + tabs -->
				<div class="edit-sticky-header">
					<div class="preview-card">
						<p class="preview-label">Profile Preview</p>
						<div class="preview-shell" style="--preview-opacity:{bannerOpacity}">
							{#if effectiveBannerCss && bannerMode === 'background'}
								<div class="preview-bg-banner" style="background:{effectiveBannerCss}; background-size:{effectiveBgSize}; background-position:{effectiveBgPos}; opacity:{bannerOpacity};"></div>
							{:else if effectiveBannerCss}
								<div class="preview-top-banner">
									<div class="preview-top-banner__img" style="background:{effectiveBannerCss}; background-size:{effectiveBgSize}; background-position:{effectiveBgPos}; opacity:{bannerOpacity};"></div>
									<div class="preview-top-banner__fade"></div>
								</div>
							{:else}
								<div class="preview-top-banner preview-top-banner--empty">
									<div class="preview-top-banner__gradient"></div>
								</div>
							{/if}
							<div class="preview-body">
								<div class="preview-avatar-wrap">
									{#if avatarUrl}
										<img class="preview-avatar" src={avatarUrl} alt="" />
									{:else}
										<div class="preview-avatar preview-avatar--placeholder">👤</div>
									{/if}
								</div>
								<div class="preview-info">
									<span class="preview-name">{displayName || 'Display Name'}</span>
									{#if pronouns}<span class="preview-pronouns muted"> ({pronouns})</span>{/if}
								</div>
							</div>
						</div>
					</div>

					<nav class="edit-tabs">
						{#each TABS as tab}
							<button
								class="edit-tab"
								class:edit-tab--active={activeTab === tab.id}
								type="button"
								onclick={() => activeTab = tab.id}
							>
								{tab.icon} {tab.label}
							</button>
						{/each}
					</nav>
				</div>

				<!-- Tab content -->
				<div class="edit-content">

				<!-- ═══ BASIC INFO ═══ -->
				{#if activeTab === 'basic'}
					<div class="card tab-card">
						<h2>👤 Basic Info</h2>

						<div class="fg">
							<label class="fl" for="runner-id">Runner ID</label>
							<input id="runner-id" type="text" class="fi" value={runnerId} disabled />
							<p class="fh">Your unique identifier (cannot be changed)</p>
						</div>

						<div class="form-row">
							<div class="fg fg--flex">
								<label class="fl" for="display-name">Display Name *</label>
								<input id="display-name" type="text" class="fi" bind:value={displayName} maxlength="50" required />
								<p class="fh">The name shown on your profile</p>
							</div>
							<div class="fg">
								<label class="fl" for="pronouns">Pronouns</label>
								<input id="pronouns" type="text" class="fi" bind:value={pronouns} maxlength="30" placeholder="e.g., they/them" />
							</div>
						</div>

						<div class="form-row">
							<div class="fg fg--flex">
								<label class="fl" for="location">Location</label>
								<div class="typeahead">
									<input
										id="location"
										type="text"
										class="fi"
										value={locationSearch}
										oninput={(e) => { locationSearch = (e.target as HTMLInputElement).value; location = ''; locationOpen = true; }}
										onclick={() => locationOpen = !locationOpen}
										onblur={() => setTimeout(() => locationOpen = false, 200)}
										placeholder="Search country…"
										autocomplete="off"
									/>
									{#if location}
										<button type="button" class="typeahead__clear" onclick={clearLocation} title="Clear">✕</button>
									{/if}
									{#if locationOpen}
										{@const matches = filteredCountries(locationSearch)}
										{#if matches.length > 0}
											<ul class="typeahead__list">
												{#each matches as c}
													<li>
														<button type="button" class="typeahead__option" class:typeahead__option--active={c.code === location} onmousedown={() => selectLocation(c)}>
															{c.flag} {c.name}
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<ul class="typeahead__list"><li class="typeahead__empty">No countries found</li></ul>
										{/if}
									{/if}
								</div>
							</div>
							<div class="fg fg--flex">
								<label class="fl" for="representing">Representing</label>
								<div class="typeahead">
									<input
										id="representing"
										type="text"
										class="fi"
										value={representingSearch}
										oninput={(e) => { representingSearch = (e.target as HTMLInputElement).value; representing = ''; representingOpen = true; }}
										onclick={() => representingOpen = !representingOpen}
										onblur={() => setTimeout(() => representingOpen = false, 200)}
										placeholder="Same as location…"
										autocomplete="off"
									/>
									{#if representing}
										<button type="button" class="typeahead__clear" onclick={clearRepresenting} title="Clear">✕</button>
									{/if}
									{#if representingOpen}
										{@const matches = filteredCountries(representingSearch)}
										{#if matches.length > 0}
											<ul class="typeahead__list">
												{#each matches as c}
													<li>
														<button type="button" class="typeahead__option" class:typeahead__option--active={c.code === representing} onmousedown={() => selectRepresenting(c)}>
															{c.flag} {c.name}
														</button>
													</li>
												{/each}
											</ul>
										{:else}
											<ul class="typeahead__list"><li class="typeahead__empty">No countries found</li></ul>
										{/if}
									{/if}
								</div>
								<p class="fh">Show a different flag on your profile (solidarity, heritage, etc.)</p>
							</div>
						</div>

						<div class="fg">
							<label class="fl" for="bio">Bio</label>
							<textarea id="bio" class="fi" bind:value={bio} rows="4" maxlength="1000" placeholder="Tell others about yourself..."></textarea>
							<p class="fh">{bioCount}/1000 characters</p>
						</div>

						<div class="fg">
							<label class="fl" for="status-msg">Status Message</label>
							<input id="status-msg" type="text" class="fi" bind:value={statusMessage} maxlength="100" placeholder="What are you working on?" />
							<p class="fh">Short status shown on your profile</p>
						</div>

						<div class="fg">
							<label class="fl">Privacy</label>
							<label class="toggle-row">
								<input type="checkbox" class="toggle-check" bind:checked={hideActivity} />
								<span class="toggle-slider"></span>
								<span class="toggle-label">Hide Activity tab on my profile</span>
							</label>
							<p class="fh">When enabled, other visitors won't see your Activity timeline.</p>
						</div>
					</div>
				{/if}

				<!-- ═══ CUSTOMIZE ═══ -->
				{#if activeTab === 'customize'}
					<div class="card tab-card">
						<h2>🎨 Customize</h2>
						<p class="muted mb-3">Update your avatar, banner, and appearance.</p>

						<!-- Avatar -->
						<div class="fg">
							<label class="fl">Avatar</label>
							<div class="avatar-upload">
								<div class="avatar-upload__preview">
									{#if avatarUrl}
										<img src={avatarUrl} alt="Avatar preview" />
									{:else}
										<div class="avatar-upload__placeholder">👤</div>
									{/if}
								</div>
								<div class="avatar-upload__controls">
									<label class="btn btn--small btn--upload">
										📤 Upload Image
										<input type="file" accept="image/png,image/jpeg" onchange={handleAvatarUpload} hidden />
									</label>
									{#if avatarUrl}
										<button type="button" class="btn btn--small btn--outline" onclick={removeAvatar} disabled={uploading}>
											🗑️ Remove
										</button>
									{/if}
									{#if uploading}
										<span class="muted">Uploading...</span>
									{/if}
									{#if uploadMsg}
										<span class="muted">{uploadMsg}</span>
									{/if}
									<p class="fh mt-2">PNG or JPG, max 2MB. Square images work best.</p>
								</div>
							</div>
						</div>

						<!-- Banner: Custom URL -->
						<div class="fg">
							<label class="fl" for="banner-url">Banner Image URL</label>
							<input id="banner-url" type="url" class="fi" bind:value={bannerUrl}
								oninput={() => { bannerIsGradient = false; bannerGradient = ''; }}
								placeholder="https://example.com/banner.jpg" />
							<p class="fh">Paste your own image URL, or pick a preset below.</p>
						</div>

						<!-- Banner: Preset Groups (accordion) -->
						<div class="fg">
							<label class="fl">🎨 Banner Presets</label>
							<div class="preset-accordion">
								{#each BANNER_PRESETS as group}
									<div class="preset-group">
										<button
											type="button"
											class="preset-group__toggle"
											class:preset-group__toggle--open={openPresetGroup === group.group}
											onclick={() => openPresetGroup = openPresetGroup === group.group ? null : group.group}
										>{group.group} <span class="preset-group__chevron">{openPresetGroup === group.group ? '▲' : '▼'}</span></button>
										{#if openPresetGroup === group.group}
											<div class="preset-grid">
												{#each group.items as item}
													<button
														type="button"
														class="preset-swatch"
														class:preset-swatch--active={bannerGradient === item.gradient}
														title={item.label}
														onclick={() => selectPreset(item.gradient)}
													>
														<div class="preset-swatch__preview" style="background:{item.gradient}"></div>
														<span class="preset-swatch__label">{item.label}</span>
													</button>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>

						<!-- Banner: Display Options -->
						<div class="fg">
							<label class="fl">🖼️ Banner Display Options</label>
							<div class="banner-opts">
								<div class="banner-opt-row">
									<span class="banner-opt-label">Position</span>
									<div class="banner-opt-btns">
										{#each [['above','⬆️ Above Profile'],['background','🌅 Page Background']] as [val,lbl]}
											<button type="button" class="opt-btn" class:opt-btn--active={bannerMode === val} onclick={() => bannerMode = val as 'above'|'background'}>{lbl}</button>
										{/each}
									</div>
								</div>
								<div class="banner-opt-row">
									<span class="banner-opt-label">Fit</span>
									<div class="banner-opt-btns">
										{#each [['cover','Crop & Fill'],['contain','Show Full'],['fill','Stretch']] as [val,lbl]}
											<button type="button" class="opt-btn" class:opt-btn--active={bannerSize === val} onclick={() => bannerSize = val as 'cover'|'contain'|'fill'}>{lbl}</button>
										{/each}
									</div>
								</div>
								<div class="banner-opt-row">
									<span class="banner-opt-label">Align</span>
									<div class="banner-opt-btns">
										{#each [['top','Top'],['center','Center'],['bottom','Bottom']] as [val,lbl]}
											<button type="button" class="opt-btn" class:opt-btn--active={bannerPosition === val} onclick={() => bannerPosition = val as 'top'|'center'|'bottom'}>{lbl}</button>
										{/each}
									</div>
								</div>
								<div class="banner-opt-row">
									<span class="banner-opt-label">Opacity <strong>{Math.round(bannerOpacity * 100)}%</strong></span>
									<input type="range" min="0.1" max="1" step="0.05" bind:value={bannerOpacity} class="banner-opacity-slider" />
								</div>
							</div>
						</div>

						<!-- Theme link -->
						<div class="fg">
							<label class="fl">Colors & Theme</label>
							<p class="fh">Customize your accent color, background, and font in the <a href="/profile/theme">Theme Editor</a>.</p>
						</div>
					</div>
				{/if}

				<!-- ═══ SOCIALS ═══ -->
				{#if activeTab === 'socials'}
					<div class="card tab-card">
						<h2>🔗 Social Links</h2>
						<p class="muted mb-3">Add links to your streaming and social accounts.</p>

						<div class="form-row">
							<div class="fg fg--flex">
								<label class="fl" for="s-twitch">Twitch</label>
								<input id="s-twitch" type="url" class="fi" bind:value={socialTwitch} placeholder="https://twitch.tv/username" />
							</div>
							<div class="fg fg--flex">
								<label class="fl" for="s-youtube">YouTube</label>
								<input id="s-youtube" type="url" class="fi" bind:value={socialYoutube} placeholder="https://youtube.com/@channel" />
							</div>
						</div>

						<div class="form-row">
							<div class="fg fg--flex">
								<label class="fl" for="s-discord">Discord</label>
								<input id="s-discord" type="url" class="fi" bind:value={socialDiscord} placeholder="https://discord.gg/invite" />
							</div>
							<div class="fg fg--flex">
								<label class="fl" for="s-twitter">Twitter/X</label>
								<input id="s-twitter" type="url" class="fi" bind:value={socialTwitter} placeholder="https://twitter.com/username" />
							</div>
						</div>

						<div class="form-row">
							<div class="fg fg--flex">
								<label class="fl" for="s-bluesky">Bluesky</label>
								<input id="s-bluesky" type="url" class="fi" bind:value={socialBluesky} placeholder="https://bsky.app/profile/handle" />
							</div>
							<div class="fg fg--flex">
								<label class="fl" for="s-instagram">Instagram</label>
								<input id="s-instagram" type="url" class="fi" bind:value={socialInstagram} placeholder="https://instagram.com/username" />
							</div>
						</div>

						<div class="form-row">
							<div class="fg fg--flex">
								<label class="fl" for="s-speedrun">Speedrun.com</label>
								<input id="s-speedrun" type="url" class="fi" bind:value={socialSpeedruncom} placeholder="https://speedrun.com/users/username" />
							</div>
							<div class="fg fg--flex">
								<label class="fl" for="s-steam">Steam</label>
								<input id="s-steam" type="url" class="fi" bind:value={socialSteam} placeholder="https://steamcommunity.com/id/username" />
							</div>
						</div>

						<!-- Approved other links (read-only) -->
						{#if existingApprovedOther.length > 0}
							<div class="other-section">
								<label class="fl">Approved Other Links</label>
								{#each existingApprovedOther as link}
									<div class="other-approved">✅ <a href={link} target="_blank" rel="noopener">{link}</a></div>
								{/each}
							</div>
						{/if}

						<!-- Pending other links (read-only) -->
						{#if existingPendingOther.length > 0}
							<div class="other-section">
								<label class="fl">Pending Approval</label>
								{#each existingPendingOther as link}
									<div class="other-pending">⏳ {link}</div>
								{/each}
							</div>
						{/if}

						<!-- Add new other links -->
						<div class="other-section">
							<label class="fl">Other Links</label>
							<div class="approval-notice">
								<span>⚠️</span>
								<span>Other links require moderator approval before appearing on your profile.</span>
							</div>
							{#each otherLinks as link, i}
								<div class="other-link-row">
									<input type="url" class="fi" bind:value={otherLinks[i]} placeholder="https://example.com" />
									{#if otherLinks.length > 1}
										<button type="button" class="btn btn--small btn--outline" onclick={() => removeOtherLink(i)}>✕</button>
									{/if}
								</div>
							{/each}
							{#if otherLinks.length < 3}
								<button type="button" class="btn btn--small mt-2" onclick={addOtherLink}>+ Add Link</button>
							{/if}
							<p class="fh">Up to 3 additional links (must be valid URLs)</p>
						</div>
					</div>
				{/if}

				<!-- ═══ GOALS ═══ -->
				{#if activeTab === 'goals'}
					<div class="card tab-card">
						<h2>🎯 Personal Goals</h2>
						<p class="muted mb-3">Set personal challenges and milestones. These are visible on your profile.</p>

						{#if goals.length === 0}
							<p class="muted">No goals yet. Add one below!</p>
						{/if}

						{#each goals as goal, i}
							<div class="goal-item">
								<div class="goal-item__header">
									<span class="goal-item__number">#{i + 1}</span>
									<button type="button" class="goal-item__remove" onclick={() => removeGoal(i)}>✕</button>
								</div>
								<div class="goal-item__body">
									<div class="form-row">
										<div class="fg" style="flex:0 0 70px">
											<label class="fl" for="goal-icon-{i}">Icon</label>
											<input id="goal-icon-{i}" type="text" class="fi goal-icon-input" bind:value={goals[i].icon} maxlength="2" placeholder="🎯" />
										</div>
										<div class="fg fg--flex">
											<label class="fl" for="goal-title-{i}">Title *</label>
											<input id="goal-title-{i}" type="text" class="fi" bind:value={goals[i].title} maxlength="100" placeholder="e.g., 100 Hitless Runs" />
										</div>
									</div>

									<div class="fg">
										<label class="fl" for="goal-desc-{i}">Description</label>
										<textarea id="goal-desc-{i}" class="fi" bind:value={goals[i].description} maxlength="300" rows="2" placeholder="Describe your goal..."></textarea>
									</div>

									<div class="form-row">
										<div class="fg fg--flex">
											<label class="fl" for="goal-game-{i}">Game</label>
											<div class="typeahead">
												<input
													id="goal-game-{i}"
													type="text"
													class="fi"
													value={getGoalSearchText(i)}
													oninput={(e) => { goalSearchText[i] = (e.target as HTMLInputElement).value; goalDropdownOpen[i] = true; }}
													onclick={() => goalDropdownOpen[i] = !goalDropdownOpen[i]}
													onblur={() => handleGoalSearchBlur(i)}
													placeholder="Search for a game..."
													autocomplete="off"
												/>
												{#if goals[i].game}
													<button type="button" class="typeahead__clear" onclick={() => clearGoalGame(i)} title="Clear">✕</button>
												{/if}
												{#if goalDropdownOpen[i]}
													{@const matches = filteredGames(getGoalSearchText(i))}
													{#if matches.length > 0}
														<ul class="typeahead__list">
															{#each matches as g}
																<li>
																	<button type="button" class="typeahead__option" class:typeahead__option--active={g.id === goals[i].game} onmousedown={() => selectGoalGame(i, g)}>
																		{g.name}
																	</button>
																</li>
															{/each}
														</ul>
													{:else}
														<ul class="typeahead__list"><li class="typeahead__empty">No games found</li></ul>
													{/if}
												{/if}
											</div>
										</div>
										<div class="fg">
											<label class="fl" for="goal-status-{i}">Status</label>
											<select id="goal-status-{i}" class="fi" bind:value={goals[i].completed}>
												<option value={false}>In Progress</option>
												<option value={true}>Completed</option>
											</select>
										</div>
									</div>

									<div class="form-row goal-progress">
										<div class="fg">
											<label class="fl" for="goal-current-{i}">Current</label>
											<input id="goal-current-{i}" type="number" class="fi" bind:value={goals[i].current} min="0" onchange={() => handleProgressChange(i)} />
										</div>
										<div class="fg">
											<label class="fl" for="goal-total-{i}">Total</label>
											<input id="goal-total-{i}" type="number" class="fi" bind:value={goals[i].total} min="0" />
										</div>
										<div class="fg fg--flex">
											<label class="fl" for="goal-date-{i}">Date Completed</label>
											<input id="goal-date-{i}" type="date" class="fi" bind:value={goals[i].date} disabled={!goals[i].completed} />
										</div>
									</div>
								</div>
							</div>
						{/each}

						{#if goals.length < 10}
							<button type="button" class="btn btn--small mt-3" onclick={addGoal}>+ Add Personal Goal</button>
						{/if}
						<p class="fh">Up to 10 personal goals.</p>
					</div>
				{/if}

				<!-- ═══ HIGHLIGHTS ═══ -->
				{#if activeTab === 'highlights'}
					<div class="card tab-card">
						<h2>📌 Highlights</h2>
						<p class="muted mb-3">Pin up to 3 highlights to the top of your profile — a single run or an entire playlist.</p>

						{#if highlights.length === 0}
							<p class="muted">No highlights yet. Add one below!</p>
						{/if}

						{#each highlights as hl, i}
							<div class="highlight-item">
								<div class="highlight-item__header">
									<span class="highlight-item__number">
										#{i + 1} — {hl.type === 'playlist' ? '🎬 Playlist' : '🎮 Single Run'}
									</span>
									<div class="highlight-item__header-actions">
										<button
											type="button"
											class="btn btn--small"
											class:btn--outline={hl.type !== 'run'}
											onclick={() => highlights[i] = { ...highlights[i], type: 'run' }}
										>🎮 Run</button>
										<button
											type="button"
											class="btn btn--small"
											class:btn--outline={hl.type !== 'playlist'}
											onclick={() => highlights[i] = { ...highlights[i], type: 'playlist' }}
										>🎬 Playlist</button>
										<button type="button" class="highlight-item__remove" onclick={() => removeHighlight(i)}>✕</button>
									</div>
								</div>
								<div class="highlight-item__body">

									{#if hl.type === 'playlist'}
										<!-- Playlist mode -->
										<div class="fg">
											<label class="fl" for="hl-title-{i}">Playlist Title *</label>
											<input id="hl-title-{i}" type="text" class="fi" bind:value={highlights[i].title} maxlength="100" placeholder="e.g., All My Hitless Runs" />
										</div>
										<div class="fg">
											<label class="fl" for="hl-playlist-{i}">Playlist URL *</label>
											<input id="hl-playlist-{i}" type="url" class="fi" bind:value={highlights[i].playlist_url} placeholder="https://youtube.com/playlist?list=..." />
											<p class="fh">YouTube playlist, Twitch collection, or any direct URL.</p>
										</div>
										<div class="fg">
											<label class="fl" for="hl-desc-{i}">Description</label>
											<textarea id="hl-desc-{i}" class="fi" bind:value={highlights[i].description} maxlength="200" rows="2" placeholder="What's in this playlist?"></textarea>
										</div>
										<div class="fg">
											<label class="fl" for="hl-cover-{i}">Cover Image URL</label>
											<input id="hl-cover-{i}" type="url" class="fi" bind:value={highlights[i].cover_url} placeholder="https://... (optional thumbnail)" />
											<p class="fh">Optional — a thumbnail shown on your profile card. Leave blank for a default look.</p>
										</div>
									{:else}
										<!-- Single run mode -->
										<div class="form-row">
											<div class="fg fg--flex">
												<label class="fl" for="hl-game-{i}">Game *</label>
												<select id="hl-game-{i}" class="fi" value={hl.game_id} onchange={(e) => setHighlightGame(i, (e.target as HTMLSelectElement).value)}>
													<option value="">Select a game...</option>
													{#each gamesList as g}
														<option value={g.id}>{g.name}</option>
													{/each}
												</select>
											</div>
										</div>

										<div class="form-row">
											<div class="fg fg--flex">
												<label class="fl" for="hl-cat-{i}">Category</label>
												<input id="hl-cat-{i}" type="text" class="fi" bind:value={highlights[i].category} maxlength="100" placeholder="e.g., All Bosses No Hit" />
											</div>
											<div class="fg fg--flex">
												<label class="fl" for="hl-ach-{i}">Achievement</label>
												<input id="hl-ach-{i}" type="text" class="fi" bind:value={highlights[i].achievement} maxlength="100" placeholder="e.g., World First" />
											</div>
										</div>

										<div class="fg">
											<label class="fl" for="hl-video-{i}">Video URL</label>
											<input id="hl-video-{i}" type="url" class="fi" bind:value={highlights[i].video_url} oninput={() => onHighlightVideoChange(i)} placeholder="https://youtube.com/watch?v=..." />
											{#if highlights[i].video_url && !isValidVideoUrl(highlights[i].video_url)}
												<p class="fh" style="color: var(--danger, #ef4444);">Must be a valid YouTube, Twitch, or Bilibili URL</p>
											{:else}
												<p class="fh">YouTube, Twitch, or Bilibili links. May require moderator approval.</p>
											{/if}
											{#if videoMeta[i]?.fetching}
												<div class="video-meta"><span class="muted">Fetching video info...</span></div>
											{/if}
											{#if videoMeta[i]?.title}
												<div class="video-meta video-meta--success">
													<span>🎬</span>
													<span class="video-meta__title">{videoMeta[i].title}</span>
												</div>
											{/if}
											{#if videoMeta[i]?.error}
												<div class="video-meta video-meta--warn"><span class="muted">{videoMeta[i].error}</span></div>
											{/if}
										</div>
									{/if}

								</div>
							</div>
						{/each}

						{#if highlights.length < 3}
							<div class="highlight-add-row">
								<button type="button" class="btn btn--small mt-3" onclick={() => addHighlight('run')}>+ Add Run</button>
								<button type="button" class="btn btn--small mt-3" onclick={() => addHighlight('playlist')}>+ Add Playlist</button>
							</div>
						{/if}
						<p class="fh">Up to 3 highlights. Mix and match runs and playlists.</p>
					</div>
				{/if}

				<!-- Save Button (visible on all tabs) -->
				<div class="form-actions">
					{#if bannedTermsWarning}
						<div class="alert alert--error">{bannedTermsWarning}</div>
					{/if}
					<button
						class="btn btn--primary"
						onclick={handleSave}
						disabled={saving || !displayName.trim() || !!bannedTermsWarning || profileApprovalStatus !== 'approved'}
					>
						{saving ? 'Saving...' : 'Save Changes'}
					</button>
					<a href={runnerId ? `/runners/${runnerId}` : '/profile'} class="btn btn--ghost">Cancel</a>
				</div>

					</div> <!-- end edit-content -->
			{/if}
		</div>
	</div>
</AuthGuard>

<style>
	.edit-page { margin: 2rem auto; }

	/* Sticky header: preview + tabs */
	.edit-sticky-header {
		position: sticky; top: 4rem; z-index: 10;
		background: var(--bg); padding-bottom: 0;
		margin-bottom: 1.5rem;
	}
	.edit-content { display: flex; flex-direction: column; gap: 1.5rem; }

	/* Loading */
	.edit-loading { text-align: center; padding: 3rem 0; }
	.spinner {
		width: 36px; height: 36px;
		border: 3px solid var(--border); border-top-color: var(--accent);
		border-radius: 50%; margin: 0 auto 1rem;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Alerts */
	.alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-size: 0.9rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }
	.alert--warning { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; }

	/* Preview card — inside sticky header */
	.preview-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 0; }
	.preview-label { font-size: 0.75rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; padding: 0.5rem 1rem 0; margin: 0; }
	.preview-shell { position: relative; background: var(--bg); }
	.preview-bg-banner { position: absolute; inset: 0; background-size: cover; background-position: center; z-index: 0; }
	.preview-top-banner { position: relative; height: 110px; overflow: hidden; }
	.preview-top-banner--empty { background: var(--surface); }
	.preview-top-banner__img { position: absolute; inset: 0; background-size: cover; background-position: center; }
	.preview-top-banner__gradient { position: absolute; inset: 0; background: linear-gradient(135deg, var(--accent), #1a1a2e); opacity: 0.6; }
	.preview-top-banner__fade { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 40%, var(--bg) 100%); }
	.preview-body {
		display: flex; align-items: center; gap: 1rem;
		padding: 0.75rem 1rem 1rem; position: relative; z-index: 1;
	}
	.preview-avatar {
		width: 64px; height: 64px; border-radius: 50%;
		border: 3px solid var(--accent); background: var(--surface);
		object-fit: cover; flex-shrink: 0;
	}
	.preview-avatar--placeholder {
		display: flex; align-items: center; justify-content: center;
		font-size: 1.75rem; color: var(--muted);
	}
	.preview-info { display: flex; align-items: baseline; gap: 0.4rem; }
	.preview-name { font-size: 1.1rem; font-weight: 700; }
	.preview-pronouns { font-size: 0.8rem; }

	/* Banner presets accordion */
	.preset-accordion { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	.preset-group { border-bottom: 1px solid var(--border); }
	.preset-group:last-child { border-bottom: none; }
	.preset-group__toggle {
		display: flex; justify-content: space-between; align-items: center;
		width: 100%; padding: 0.6rem 0.9rem; background: var(--surface);
		border: none; cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--fg);
		text-align: left;
	}
	.preset-group__toggle:hover { background: var(--bg-hover, var(--bg)); }
	.preset-group__toggle--open { color: var(--accent); }
	.preset-group__chevron { font-size: 0.7rem; color: var(--muted); }
	.preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.5rem; padding: 0.75rem; background: var(--bg); }
	.preset-swatch { display: flex; flex-direction: column; gap: 0.3rem; border: 2px solid var(--border); border-radius: 8px; overflow: hidden; cursor: pointer; background: none; padding: 0; transition: border-color 0.15s; }
	.preset-swatch:hover { border-color: var(--accent); }
	.preset-swatch--active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
	.preset-swatch__preview { width: 100%; aspect-ratio: 5/2; }
	.preset-swatch__label { font-size: 0.7rem; color: var(--fg); text-align: center; padding: 0.2rem 0.3rem 0.35rem; }
	.preset-swatch--active .preset-swatch__label { color: var(--accent); font-weight: 600; }

	/* Banner display options */
	.banner-opts { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.banner-opt-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.banner-opt-label { font-size: 0.8rem; color: var(--muted); min-width: 80px; }
	.banner-opt-btns { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.opt-btn { padding: 0.3rem 0.65rem; border-radius: 5px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: 0.8rem; cursor: pointer; }
	.opt-btn:hover { border-color: var(--accent); color: var(--fg); }
	.opt-btn--active { background: var(--accent); color: #fff; border-color: var(--accent); }
	.banner-opacity-slider { flex: 1; min-width: 120px; accent-color: var(--accent); }

	/* Card for tab content */
	.tab-card { margin-bottom: 0; }
	.card {
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 12px; padding: 1.5rem;
	}
	.card h2 { margin: 0 0 1rem; font-size: 1.15rem; }
	.mb-3 { margin-bottom: 0.75rem; }
	.mb-4 { margin-bottom: 1rem; }
	.mt-2 { margin-top: 0.5rem; }
	.mt-3 { margin-top: 0.75rem; }

	/* Form elements */
	.fg { margin-bottom: 1.25rem; }
	.fg--flex { flex: 1; }
	.fl { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
	.fi {
		width: 100%; padding: 0.6rem 0.75rem;
		border: 1px solid var(--border); border-radius: 6px;
		background: var(--bg); color: var(--fg);
		font-size: 0.95rem; font-family: inherit;
	}
	.fi:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }
	.fi:disabled { opacity: 0.5; cursor: not-allowed; }
	.fh { font-size: 0.8rem; color: var(--muted); margin-top: 0.3rem; }
	.fh a { color: var(--accent); }
	select.fi { cursor: pointer; }
	textarea.fi { resize: vertical; }

	.form-row { display: flex; gap: 1rem; }
	@media (max-width: 600px) {
		.form-row { flex-direction: column; gap: 0; }
	}

	/* Avatar upload */
	.avatar-upload { display: flex; gap: 1rem; align-items: flex-start; }
	.avatar-upload__preview {
		width: 80px; height: 80px; border-radius: 50%; overflow: hidden;
		border: 2px solid var(--border); flex-shrink: 0;
		background: var(--bg);
	}
	.avatar-upload__preview img { width: 100%; height: 100%; object-fit: cover; }
	.avatar-upload__placeholder {
		width: 100%; height: 100%; display: flex;
		align-items: center; justify-content: center;
		font-size: 2rem; color: var(--muted);
	}
	.avatar-upload__controls { display: flex; flex-direction: column; gap: 0.5rem; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; }
	.btn:hover { border-color: var(--accent); }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn--primary:hover { opacity: 0.9; }
	.btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn--outline { background: none; }
	.btn--ghost { background: none; border: none; color: var(--muted); }
	.btn--ghost:hover { color: var(--fg); }
	.btn--upload { cursor: pointer; }

	/* Other links */
	.other-section { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
	.other-link-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
	.other-link-row .fi { flex: 1; }
	.other-approved { font-size: 0.85rem; margin-bottom: 0.35rem; }
	.other-approved a { color: var(--accent); }
	.other-pending { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.35rem; }
	.approval-notice {
		display: flex; gap: 0.5rem; align-items: center;
		padding: 0.6rem 0.75rem; border-radius: 6px;
		background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.2);
		font-size: 0.85rem; color: var(--fg); margin-bottom: 1rem;
	}

	/* Goals */
	.goal-item, .highlight-item {
		background: var(--bg); border: 1px solid var(--border);
		border-radius: 8px; overflow: hidden; margin-bottom: 1rem;
	}
	.goal-item__header, .highlight-item__header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 0.5rem 0.75rem; background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.goal-item__number, .highlight-item__number {
		font-size: 0.8rem; font-weight: 600; color: var(--muted);
	}
	.goal-item__remove, .highlight-item__remove {
		background: none; border: none; color: var(--muted);
		font-size: 1.1rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 4px;
	}
	.goal-item__remove:hover, .highlight-item__remove:hover {
		background: rgba(239, 68, 68, 0.1); color: #ef4444;
	}
	.goal-item__body, .highlight-item__body { padding: 1rem; }
	.goal-item__body .fg, .highlight-item__body .fg { margin-bottom: 0.75rem; }
	.goal-item__body .fl, .highlight-item__body .fl { font-size: 0.8rem; margin-bottom: 0.25rem; }
	.goal-item__body .fi, .highlight-item__body .fi { font-size: 0.9rem; padding: 0.5rem 0.75rem; }
	.goal-icon-input { text-align: center; font-size: 1.25rem; }
	.goal-progress { padding-top: 0.5rem; border-top: 1px dashed var(--border); margin-top: 0.5rem; }

	/* Save actions */
	.form-actions {
		display: flex; gap: 0.75rem; margin-top: 2rem;
		padding-top: 1.5rem; border-top: 1px solid var(--border);
	}

	/* Toggle switch */
	.toggle-row {
		display: flex; align-items: center; gap: 0.75rem; cursor: pointer;
		padding: 0.5rem 0; user-select: none;
	}
	.toggle-check { display: none; }
	.toggle-slider {
		position: relative; width: 40px; height: 22px; flex-shrink: 0;
		background: var(--border); border-radius: 11px; transition: background 0.2s;
	}
	.toggle-slider::after {
		content: ''; position: absolute; top: 3px; left: 3px;
		width: 16px; height: 16px; border-radius: 50%;
		background: var(--fg); transition: transform 0.2s;
	}
	.toggle-check:checked + .toggle-slider { background: var(--accent); }
	.toggle-check:checked + .toggle-slider::after { transform: translateX(18px); background: #fff; }
	.toggle-label { font-size: 0.9rem; color: var(--fg); }

	/* Typeahead */
	.typeahead { position: relative; }
	.typeahead__clear {
		position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
		background: none; border: none; color: var(--muted); cursor: pointer;
		font-size: 0.85rem; padding: 2px 6px; border-radius: 4px;
	}
	.typeahead__clear:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
	.typeahead__list {
		position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
		background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
		max-height: 200px; overflow-y: auto; list-style: none; margin: 4px 0 0; padding: 4px;
		box-shadow: 0 8px 24px rgba(0,0,0,0.3);
	}
	.typeahead__option {
		display: block; width: 100%; text-align: left; padding: 0.45rem 0.65rem;
		background: none; border: none; color: var(--fg); cursor: pointer;
		font-size: 0.9rem; border-radius: 4px; font-family: inherit;
	}
	.typeahead__option:hover { background: var(--bg-hover); }
	.typeahead__option--active { color: var(--accent); font-weight: 600; }
	.typeahead__empty { padding: 0.5rem 0.65rem; color: var(--muted); font-size: 0.85rem; }

	/* Highlight header with type toggle */
	.highlight-item__header { flex-wrap: wrap; gap: 0.5rem; }
	.highlight-item__header-actions { display: flex; align-items: center; gap: 0.4rem; }
	.highlight-add-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }

	/* Video meta preview */
	.video-meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.85rem; }
	.video-meta--success { padding: 0.5rem 0.75rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; }
	.video-meta--warn { padding: 0.4rem 0.75rem; background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.15); border-radius: 6px; }
	.video-meta__title { color: var(--fg); font-weight: 500; }
</style>
