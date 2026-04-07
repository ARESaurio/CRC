<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { debugRole, debugGame } from '$stores/debug';
	import { getDebugableRoles, realRoleToDebugId } from '$lib/permissions';
	import { supabase } from '$lib/supabase';
	import type { DebugRoleId, DebugGameInfo } from '$stores/debug';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, Send, RefreshCw, X, Eye, KeyRound, ClipboardList, MessageSquare, Gamepad2, Upload, ArrowLeft, Shield, Ban} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { showToast } from '$stores/toast';

	let checking = $state(true);
	let authorized = $state(false);
	let activeTab = $state<'simulation' | 'permissions' | 'session' | 'messaging'>('simulation');
	
	let actualRoleId = $state<DebugRoleId>('user');
	let runnerId = $state('—');
	let userId = $state('—');

	// ── Game picker for mod/verifier simulation ──
	let allGames = $state<{ game_id: string; game_name: string }[]>([]);
	let gameInputValue = $state('');
	let gameFilterText = $state('');
	let filteredGames = $derived.by(() => {
		const q = gameFilterText.trim().toLowerCase();
		if (!q) return allGames.slice(0, 20);
		return allGames.filter(g =>
			g.game_name.toLowerCase().includes(q) || g.game_id.toLowerCase().includes(q)
		).slice(0, 20);
	});

	async function loadGames() {
		try {
			const { data } = await supabase
				.from('games')
				.select('game_id, game_name')
				.order('game_name');
			if (data) allGames = data;
		} catch { /* ignore */ }
	}

	function clearGame() {
		debugGame.set(null);
		gameInputValue = '';
		gameFilterText = '';
	}

	// ── Messaging Test State ──
	let msgRecipientQuery = $state('');
	let msgFilterText = $state('');
	let msgSearchResults = $state<{ user_id: string; display_name: string; avatar_url: string | null; is_staff: boolean }[]>([]);
	let msgSelectedRecipient = $state<{ user_id: string; display_name: string; avatar_url: string | null; is_staff: boolean } | null>(null);
	let msgSubject = $state('');
	let msgBody = $state('');
	let msgSending = $state(false);
	let msgTestResults = $state<{ scenario: string; status: number; body: any; time: string }[]>([]);
	let msgSearchTimeout: ReturnType<typeof setTimeout>;

	// ── Permission Check State ──
	let permUserAQuery = $state('');
	let permUserBQuery = $state('');
	let permFilterTextA = $state('');
	let permFilterTextB = $state('');
	let permUserAResults = $state<{ user_id: string; display_name: string; is_staff: boolean }[]>([]);
	let permUserBResults = $state<{ user_id: string; display_name: string; is_staff: boolean }[]>([]);
	let permUserA = $state<{ user_id: string; display_name: string; is_staff: boolean } | null>(null);
	let permUserB = $state<{ user_id: string; display_name: string; is_staff: boolean } | null>(null);
	let permSearchTimeoutA: ReturnType<typeof setTimeout>;
	let permSearchTimeoutB: ReturnType<typeof setTimeout>;

	async function searchProfiles(query: string, excludeId?: string): Promise<{ user_id: string; display_name: string; avatar_url: string | null; is_staff: boolean }[]> {
		if (query.trim().length < 2) return [];
		// Sanitize to prevent PostgREST filter injection
		const safe = query.replace(/[,().'"\\]/g, '').trim();
		if (!safe) return [];
		const { data } = await supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url, is_admin, is_super_admin, role')
			.or(`display_name.ilike.%${safe}%,runner_id.ilike.%${safe}%`)
			.limit(8);

		const results = (data || []).filter((p: any) => p.user_id !== excludeId);
		if (results.length === 0) return [];

		// Batch staff checks instead of N+1 queries
		const userIds = results.map((p: any) => p.user_id);
		const [{ data: vRows }, { data: mRows }] = await Promise.all([
			supabase.from('role_game_verifiers').select('user_id').in('user_id', userIds),
			supabase.from('role_game_moderators').select('user_id').in('user_id', userIds),
		]);
		const verifierIds = new Set((vRows || []).map((r: any) => r.user_id));
		const modIds = new Set((mRows || []).map((r: any) => r.user_id));

		return results.map((p: any) => ({
			user_id: p.user_id,
			display_name: p.display_name || 'Unknown',
			avatar_url: p.avatar_url || null,
			is_staff: !!(p.is_admin || p.is_super_admin || p.role === 'moderator' || verifierIds.has(p.user_id) || modIds.has(p.user_id)),
		}));
	}

	function handleMsgSearch() {
		clearTimeout(msgSearchTimeout);
		msgSearchTimeout = setTimeout(async () => {
			msgSearchResults = await searchProfiles(msgRecipientQuery, userId);
		}, 300);
	}

	function selectMsgRecipient(uid: string) {
		const r = msgSearchResults.find(s => s.user_id === uid);
		if (r) msgSelectedRecipient = r;
		msgRecipientQuery = '';
		msgFilterText = '';
		msgSearchResults = [];
	}

	function clearMsgRecipient() {
		msgSelectedRecipient = null;
	}

	function addTestResult(scenario: string, status: number, body: any) {
		msgTestResults = [{
			scenario,
			status,
			body,
			time: new Date().toLocaleTimeString(),
		}, ...msgTestResults].slice(0, 20);
	}

	async function sendTestAsAdmin() {
		if (!msgSelectedRecipient || !msgBody.trim()) return;
		msgSending = true;
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) { addTestResult('Admin → User', 0, { error: 'No active session' }); msgSending = false; return; }

			const res = await fetch(`${PUBLIC_WORKER_URL}/messages/create-thread`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.access_token}` },
				body: JSON.stringify({
					participant_ids: [msgSelectedRecipient.user_id],
					subject: msgSubject.trim() || `[Debug Test] ${new Date().toLocaleString()}`,
					type: 'direct',
					initial_message: msgBody.trim(),
				}),
			});
			const data = await res.json();
			addTestResult(`Admin → ${msgSelectedRecipient.display_name}`, res.status, data);
			if (res.ok && data.ok) showToast('success', `Message sent! Thread: ${data.thread_id}`);
			else showToast('error', data.error || 'Failed');
		} catch (err: any) {
			addTestResult('Admin → User', 0, { error: err?.message || 'Network error' });
			showToast('error', 'Network error');
		}
		msgSending = false;
	}

	async function sendTestNoAuth() {
		if (!msgSelectedRecipient) { showToast('error', 'Select a recipient first'); return; }
		msgSending = true;
		try {
			const res = await fetch(`${PUBLIC_WORKER_URL}/messages/create-thread`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					participant_ids: [msgSelectedRecipient.user_id],
					subject: '[Debug] No-auth test',
					type: 'direct',
					initial_message: 'This should be rejected — no auth token.',
				}),
			});
			const data = await res.json();
			addTestResult(`No Auth → ${msgSelectedRecipient.display_name}`, res.status, data);
			if (res.status === 401 || res.status === 403) showToast('success', `Correctly rejected (${res.status})`);
			else showToast('error', `Unexpected status: ${res.status}`);
		} catch (err: any) {
			addTestResult('No Auth → User', 0, { error: err?.message || 'Network error' });
		}
		msgSending = false;
	}

	async function sendTestSelfToSelf() {
		msgSending = true;
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) { addTestResult('Self → Self', 0, { error: 'No active session' }); msgSending = false; return; }

			const res = await fetch(`${PUBLIC_WORKER_URL}/messages/create-thread`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.access_token}` },
				body: JSON.stringify({
					participant_ids: [sess.user.id],
					subject: '[Debug] Self-message test',
					type: 'direct',
					initial_message: 'Testing self-to-self — should be rejected.',
				}),
			});
			const data = await res.json();
			addTestResult('Self → Self', res.status, data);
			if (data.error) showToast('success', `Correctly rejected: ${data.error}`);
			else showToast('error', 'Unexpected: self-message was allowed');
		} catch (err: any) {
			addTestResult('Self → Self', 0, { error: err?.message || 'Network error' });
		}
		msgSending = false;
	}

	// ── Permission search handlers ──
	function handlePermSearchA() {
		clearTimeout(permSearchTimeoutA);
		permSearchTimeoutA = setTimeout(async () => {
			permUserAResults = (await searchProfiles(permUserAQuery)).map(p => ({ user_id: p.user_id, display_name: p.display_name, is_staff: p.is_staff }));
		}, 300);
	}
	function handlePermSearchB() {
		clearTimeout(permSearchTimeoutB);
		permSearchTimeoutB = setTimeout(async () => {
			permUserBResults = (await searchProfiles(permUserBQuery)).map(p => ({ user_id: p.user_id, display_name: p.display_name, is_staff: p.is_staff }));
		}, 300);
	}

	function selectPermUserA(uid: string) {
		const r = permUserAResults.find(s => s.user_id === uid);
		if (r) permUserA = r;
		permUserAQuery = '';
		permFilterTextA = '';
		permUserAResults = [];
	}
	function selectPermUserB(uid: string) {
		const r = permUserBResults.find(s => s.user_id === uid);
		if (r) permUserB = r;
		permUserBQuery = '';
		permFilterTextB = '';
		permUserBResults = [];
	}

	function permissionVerdict(a: typeof permUserA, b: typeof permUserB): { allowed: boolean; reason: string } {
		if (!a || !b) return { allowed: false, reason: 'Select both users' };
		if (a.user_id === b.user_id) return { allowed: false, reason: 'Cannot message yourself' };
		if (a.is_staff) return { allowed: true, reason: `${a.display_name} is staff → can message anyone` };
		if (b.is_staff) return { allowed: true, reason: `${b.display_name} is staff → non-staff users can message staff` };
		return { allowed: false, reason: `Both ${a.display_name} and ${b.display_name} are non-staff → blocked by Worker permission check` };
	}



	const ROLES_META: Record<string, { icon: string; name: string; desc: string }> = {
		admin:     { icon: 'shield', name: 'Admin',                desc: 'Pending profiles, games, runs (view-only unless game mod). Users. Staff Guides.' },
		moderator: { icon: 'shield-check', name: 'Moderator',            desc: 'Runs queue for assigned games. Users. Debug (verifier only). Staff Guides.' },
		verifier:  { icon: 'check-circle', name: 'Verifier',             desc: 'Runs queue for assigned games only. Staff Guides.' },
		user:      { icon: 'user', name: 'User',                 desc: 'No dashboard access. Sees public site + own profile/submissions.' },
		non_user:  { icon: 'ban', name: 'Non-User (Logged Out)', desc: 'No account. Public pages only — useful to check sign-up flow.' },
	};

	// Roles this user can simulate — based on effective perspective
	// When debugging as moderator, you see what a moderator would see on this page
	let effectiveRoleId = $derived($debugRole ?? actualRoleId);
	let debuggableRoles = $derived(getDebugableRoles(effectiveRoleId));

	// Permissions matrix — columns: [Capability, Super Admin, Admin, Moderator, Verifier, User, Non-User]
	const permMatrix: [string, boolean, boolean, boolean, boolean, boolean, boolean][] = [
		// ── User capabilities ──
		['Submit runs',                   true,  true,  true,  true,  true,  false],
		['Submit games',                  true,  true,  true,  true,  true,  false],
		['Edit own profile',              true,  true,  true,  true,  true,  false],
		// ── Verifier capabilities ──
		['View runs queue',               true,  true,  true,  true,  false, false],
		['Approve runs (assigned games)', true,  true,  true,  true,  false, false],
		['View game updates',             true,  true,  true,  true,  false, false],
		['Staff guides',                  true,  true,  true,  true,  false, false],
		// ── Moderator capabilities ──
		['Game editor (assigned games)',  true,  true,  true,  false, false, false],
		['Freeze / unfreeze (assigned)',  true,  true,  true,  false, false, false],
		['Users & roles',                 true,  true,  true,  false, false, false],
		['Debug tools',                   true,  true,  true,  false, false, false],
		// ── Admin capabilities ──
		['Review pending profiles',       true,  true,  false, false, false, false],
		['Review pending games',          true,  true,  false, false, false, false],
		['Approve runs (all games)',      true,  true,  false, false, false, false],
		['Game editor (all games)',       true,  true,  false, false, false, false],
		['Freeze / unfreeze (all games)', true,  true,  false, false, false, false],
		['Review profile themes',         true,  true,  false, false, false, false],
		// ── Super Admin capabilities ──
		['Financials',                    true,  false, false, false, false, false],
		['Site health',                   true,  false, false, false, false, false],
	];

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/debug'); return; }
				const role = await checkAdminRole();
				actualRoleId = realRoleToDebugId(role);
				// Accessible by super_admin, admin, moderator
				authorized = !!(role?.superAdmin || role?.admin || role?.moderator);
				runnerId = role?.runnerId || '—';
				userId = sess?.user?.id || '—';
				checking = false;
				if (authorized) {
					loadGames();
					// Restore game picker display from store
					if ($debugGame) gameInputValue = $debugGame.game_name;
				}
			}
		});
		return unsub;
	});

	function activateDebug(role: string) {
		debugRole.set(role as DebugRoleId);
		// Clear game selection when switching to a role that doesn't use it
		if (role !== 'verifier' && role !== 'moderator') {
			debugGame.set(null);
			gameInputValue = '';
			gameFilterText = '';
		}
	}
	function exitDebug() {
		debugRole.set(null);
		gameInputValue = '';
		gameFilterText = '';
	}


</script>

<svelte:head><title>{m.admin_debug_title()}</title></svelte:head>
<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}><ArrowLeft size={14} /> {m.admin_dashboard()}</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_moderator_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h2>{m.admin_debug_heading()}</h2>
		<p class="muted mb-3">{m.admin_debug_desc()}</p>

		<Tabs.Root bind:value={activeTab}>
		<Tabs.List variant="game" flush>
			<Tabs.Trigger variant="game" value="simulation"><Eye size={14} /> Role Simulation</Tabs.Trigger>
			<Tabs.Trigger variant="game" value="permissions"><KeyRound size={14} /> Permissions</Tabs.Trigger>
			<Tabs.Trigger variant="game" value="session"><ClipboardList size={14} /> Current Session</Tabs.Trigger>
			<Tabs.Trigger variant="game" value="messaging"><MessageSquare size={14} /> Messaging</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="simulation">
			<div class="tab-body">
				<div class="card">
					<h2>{m.admin_debug_role_sim()}</h2>
				<p class="muted mb-2">Select a role below to activate debug mode. A navigation bar will appear at the top of <strong>every page</strong> on the site, letting you browse as that role. Submissions are disabled during debug mode.</p>
				{#if debuggableRoles.length === 0}
					<p class="muted">{m.admin_debug_no_roles()}</p>
				{:else}
					<div class="role-cards">
						{#each debuggableRoles as roleId}
							{@const meta = ROLES_META[roleId]}
							{#if meta}
								<button
									class="role-card"
									class:role-card--active={$debugRole === roleId}
									onclick={() => $debugRole === roleId ? exitDebug() : activateDebug(roleId)}
								>
									<span class="role-card__icon"><Icon name={meta.icon} size={16} /></span>
									<div class="role-card__info">
										<div class="role-card__name">{meta.name}</div>
										<div class="role-card__desc">{meta.desc}</div>
									</div>
									{#if $debugRole === roleId}<span class="role-card__badge">{m.admin_debug_active()}</span>{/if}
								</button>
							{/if}
						{/each}
					</div>
				{/if}
				{#if $debugRole}
					<p class="muted mt-2" style="font-size:0.85rem">Tip: Use the <strong>🗺 Navigate</strong> button in the debug bar above to quickly jump to any page on the site.</p>
				{/if}
				{#if $debugRole === 'verifier' || $debugRole === 'moderator'}
					<div class="game-picker mt-2">
						<h3 class="game-picker__title"><Gamepad2 size={14} /> Assigned Game (Optional)</h3>
						<p class="muted" style="font-size:0.85rem; margin-bottom:0.5rem">{m.admin_debug_sim_game()}</p>
						<div class="game-picker__input-wrap">
							<Combobox.Root
								class="game-picker__combobox"
								bind:inputValue={gameInputValue}
								onInputValueChange={(v: string) => { gameFilterText = v; }}
								onValueChange={(v: string) => {
									if (v) {
										const g = allGames.find(g => g.game_id === v);
										debugGame.set({ game_id: v, game_name: g?.game_name || v });
										gameInputValue = g?.game_name || v;
									}
								}}
								onOpenChange={(o: boolean) => { if (!o) gameFilterText = ''; }}
							>
								<Combobox.Input placeholder="Search games..." />
								<Combobox.Content>
									{#each filteredGames as game (game.game_id)}
										<Combobox.Item value={game.game_id} label={game.game_name} forceMount>
											<span class="game-picker__option-name">{game.game_name}</span>
											<span class="game-picker__option-id">{game.game_id}</span>
										</Combobox.Item>
									{/each}
									{#if filteredGames.length === 0 && gameFilterText.trim()}
										<div class="game-picker__empty">No matching games</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
							{#if $debugGame}
								<button class="game-picker__clear" onclick={clearGame} title="Clear selection"><X size={14} /></button>
							{/if}
						</div>
						{#if $debugGame}
							<p class="game-picker__selected">Simulating assignment to <strong>{$debugGame.game_name}</strong> <span class="mono">({$debugGame.game_id})</span></p>
						{/if}
					</div>
				{/if}
			</div>
			</div>
		</Tabs.Content>

		<Tabs.Content value="permissions">
			<div class="tab-body">
			<div class="card">
				<h2>{m.admin_debug_permissions()}</h2>
				<p class="muted mb-2">{m.admin_debug_what_access()}</p>
				<div class="table-wrap">
					<table class="perm-table">
						<thead><tr><th>{m.admin_debug_capability()}</th><th>{m.admin_debug_super_admin()}</th><th>{m.admin_debug_admin()}</th><th>{m.admin_debug_moderator()}</th><th>{m.admin_debug_verifier()}</th><th>{m.admin_debug_user()}</th><th>{m.admin_debug_non_user()}</th></tr></thead>
						<tbody>
							{#each permMatrix as [cap, ...perms]}
								<tr><td>{cap}</td>{#each perms as p}<td class={p ? 'perm-yes' : 'perm-no'}>{#if p}<CheckCircle size={14} />{:else}<XCircle size={14} />{/if}</td>{/each}</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			</div>
		</Tabs.Content>

		<Tabs.Content value="session">
			<div class="tab-body">
			<div class="card">
				<h2>{m.admin_debug_session()}</h2>
				<div class="session-grid">
					<div class="sr"><span class="sk">{m.admin_debug_actual_role()}</span><span class="sv">{actualRoleId}</span></div>
					<div class="sr"><span class="sk">{m.admin_debug_effective_role()}</span><span class="sv">{$debugRole || actualRoleId}</span></div>
					<div class="sr"><span class="sk">{m.admin_debug_mode()}</span><span class="sv">{$debugRole ? 'On' : 'Off'}</span></div>
					<div class="sr"><span class="sk">{m.admin_debug_runner_id_label()}</span><span class="sv">{runnerId}</span></div>
					<div class="sr"><span class="sk">{m.admin_debug_user_id_label()}</span><span class="sv" style="word-break:break-all">{userId}</span></div>
				</div>
			</div>
			</div>
		</Tabs.Content>

		<Tabs.Content value="messaging">
			<div class="tab-body">
				<!-- Send Test Message -->
				<div class="card">
					<h2><Upload size={14} style="display:inline-block;vertical-align:-0.125em;" /> Send Test Message</h2>
					<p class="muted mb-2">Send a real message through the Worker endpoint. This creates an actual thread in your inbox.</p>

					<!-- Recipient picker -->
					<div class="msg-test-field">
						<label class="msg-test-label">Recipient</label>
						{#if msgSelectedRecipient}
							<div class="msg-test-chip">
								<span class="msg-test-chip__name">{msgSelectedRecipient.display_name}</span>
								<span class="msg-test-chip__role" class:msg-test-chip__role--staff={msgSelectedRecipient.is_staff}>
									{msgSelectedRecipient.is_staff ? 'Staff' : 'User'}
								</span>
								<button type="button" class="msg-test-chip__remove" onclick={clearMsgRecipient}><X size={14} /></button>
							</div>
						{:else}
							<Combobox.Root
								class="debug-user-combobox"
								bind:inputValue={msgRecipientQuery}
								onInputValueChange={(v: string) => { msgFilterText = v; handleMsgSearch(); }}
								onValueChange={(v: string) => { if (v) selectMsgRecipient(v); }}
								onOpenChange={(o: boolean) => { if (!o) msgFilterText = ''; }}
							>
								<Combobox.Input placeholder="Search users by name or runner ID…" />
								<Combobox.Content>
									{#each msgSearchResults as r (r.user_id)}
										<Combobox.Item value={r.user_id} label={r.display_name} forceMount>
											<span>{r.display_name}</span>
											<span class="debug-user-role" class:debug-user-role--staff={r.is_staff}>{r.is_staff ? 'Staff' : 'User'}</span>
										</Combobox.Item>
									{/each}
									{#if msgFilterText.length >= 2 && msgSearchResults.length === 0}
										<div class="debug-combobox__empty muted">No matches.</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
						{/if}
					</div>

					<!-- Subject -->
					<div class="msg-test-field">
						<label class="msg-test-label" for="debug-msg-subject">Subject <span class="muted">(optional — defaults to timestamp)</span></label>
						<input id="debug-msg-subject" type="text" class="msg-test-input" placeholder="[Debug Test]" bind:value={msgSubject} maxlength="200" />
					</div>

					<!-- Message body -->
					<div class="msg-test-field">
						<label class="msg-test-label" for="debug-msg-body">Message</label>
						<textarea id="debug-msg-body" class="msg-test-textarea" placeholder="Test message content…" bind:value={msgBody} maxlength="2000" rows="3"></textarea>
					</div>

					<!-- Action buttons -->
					<div class="msg-test-actions">
						<Button.Root variant="accent" disabled={!msgSelectedRecipient || !msgBody.trim() || msgSending} onclick={sendTestAsAdmin}>
							{#if msgSending}Sending…{:else}<Shield size={14} /> Send as Admin{/if}
						</Button.Root>
						<Button.Root variant="outline" disabled={!msgSelectedRecipient || msgSending} onclick={sendTestNoAuth}>
							<Ban size={14} /> Send without Auth
						</Button.Root>
						<Button.Root variant="outline" disabled={msgSending} onclick={sendTestSelfToSelf}>
							<RefreshCw size={14} /> Self → Self
						</Button.Root>
					</div>
				</div>

				<!-- Permission Checker -->
				<div class="card mt-2">
					<h2><KeyRound size={14} style="display:inline-block;vertical-align:-0.125em;" /> Permission Checker</h2>
					<p class="muted mb-2">Check whether the messaging permission rules would allow User A to message User B. The Worker enforces: non-staff users can only message staff.</p>

					<div class="perm-check-grid">
						<!-- User A -->
						<div class="perm-check-col">
							<label class="msg-test-label">User A (sender)</label>
							{#if permUserA}
								<div class="msg-test-chip">
									<span class="msg-test-chip__name">{permUserA.display_name}</span>
									<span class="msg-test-chip__role" class:msg-test-chip__role--staff={permUserA.is_staff}>
										{permUserA.is_staff ? 'Staff' : 'User'}
									</span>
									<button type="button" class="msg-test-chip__remove" onclick={() => { permUserA = null; permUserAQuery = ''; }}><X size={14} /></button>
								</div>
							{:else}
								<Combobox.Root
									class="debug-user-combobox"
									bind:inputValue={permUserAQuery}
									onInputValueChange={(v: string) => { permFilterTextA = v; handlePermSearchA(); }}
									onValueChange={(v: string) => { if (v) selectPermUserA(v); }}
									onOpenChange={(o: boolean) => { if (!o) permFilterTextA = ''; }}
								>
									<Combobox.Input placeholder="Search…" />
									<Combobox.Content>
										{#each permUserAResults as r (r.user_id)}
											<Combobox.Item value={r.user_id} label={r.display_name} forceMount>
												<span>{r.display_name}</span>
												<span class="debug-user-role" class:debug-user-role--staff={r.is_staff}>{r.is_staff ? 'Staff' : 'User'}</span>
											</Combobox.Item>
										{/each}
									</Combobox.Content>
								</Combobox.Root>
							{/if}
						</div>

						<div class="perm-check-arrow">→</div>

						<!-- User B -->
						<div class="perm-check-col">
							<label class="msg-test-label">User B (recipient)</label>
							{#if permUserB}
								<div class="msg-test-chip">
									<span class="msg-test-chip__name">{permUserB.display_name}</span>
									<span class="msg-test-chip__role" class:msg-test-chip__role--staff={permUserB.is_staff}>
										{permUserB.is_staff ? 'Staff' : 'User'}
									</span>
									<button type="button" class="msg-test-chip__remove" onclick={() => { permUserB = null; permUserBQuery = ''; }}><X size={14} /></button>
								</div>
							{:else}
								<Combobox.Root
									class="debug-user-combobox"
									bind:inputValue={permUserBQuery}
									onInputValueChange={(v: string) => { permFilterTextB = v; handlePermSearchB(); }}
									onValueChange={(v: string) => { if (v) selectPermUserB(v); }}
									onOpenChange={(o: boolean) => { if (!o) permFilterTextB = ''; }}
								>
									<Combobox.Input placeholder="Search…" />
									<Combobox.Content>
										{#each permUserBResults as r (r.user_id)}
											<Combobox.Item value={r.user_id} label={r.display_name} forceMount>
												<span>{r.display_name}</span>
												<span class="debug-user-role" class:debug-user-role--staff={r.is_staff}>{r.is_staff ? 'Staff' : 'User'}</span>
											</Combobox.Item>
										{/each}
									</Combobox.Content>
								</Combobox.Root>
							{/if}
						</div>
					</div>

					{#if permUserA && permUserB}
						{@const verdict = permissionVerdict(permUserA, permUserB)}
						<div class="perm-verdict" class:perm-verdict--allowed={verdict.allowed} class:perm-verdict--blocked={!verdict.allowed}>
							<span class="perm-verdict__icon">{#if verdict.allowed}<CheckCircle size={14} />{:else}<Ban size={14} />{/if}</span>
							<div>
								<strong>{verdict.allowed ? 'Allowed' : 'Blocked'}</strong>
								<p class="perm-verdict__reason">{verdict.reason}</p>
							</div>
						</div>
					{/if}
				</div>

				<!-- Test Results Log -->
				{#if msgTestResults.length > 0}
					<div class="card mt-2">
						<div class="msg-log-header">
							<h2><ClipboardList size={14} style="display:inline-block;vertical-align:-0.125em;" /> Test Results</h2>
							<button class="btn btn--small" onclick={() => msgTestResults = []}>Clear</button>
						</div>
						<div class="msg-log">
							{#each msgTestResults as result, i (i)}
								<div class="msg-log__entry" class:msg-log__entry--ok={result.status >= 200 && result.status < 300} class:msg-log__entry--err={result.status < 200 || result.status >= 300}>
									<div class="msg-log__top">
										<span class="msg-log__scenario">{result.scenario}</span>
										<span class="msg-log__status">{result.status || 'ERR'}</span>
										<span class="msg-log__time">{result.time}</span>
									</div>
									<pre class="msg-log__body">{JSON.stringify(result.body, null, 2)}</pre>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				</div>
		</Tabs.Content>
		</Tabs.Root>

	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--text-muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	.btn { display: inline-block; padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 6px; color: var(--fg); background: transparent; cursor: pointer; font-size: 0.85rem; text-decoration: none; }
	h2 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mb-3 { margin-bottom: 1.5rem; } .mt-2 { margin-top: 1rem; }

	.role-cards { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
	.role-card { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; text-align: left; color: var(--fg); width: 100%; transition: border-color 0.15s; }
	.role-card:hover { border-color: var(--accent); }
	.role-card--active { border-color: #f0ad4e; background: rgba(245,158,11,0.05); }
	.role-card__icon { font-size: 1.5rem; flex-shrink: 0; }
	.role-card__info { flex: 1; }
	.role-card__name { font-weight: 600; margin-bottom: 0.15rem; }
	.role-card__desc { font-size: 0.8rem; color: var(--text-muted); }
	.role-card__badge { font-size: 0.65rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; background: #f0ad4e; color: #000; text-transform: uppercase; }

	.table-wrap { overflow-x: auto; }
	.perm-table { width: 100%; border-collapse: collapse; }
	.perm-table th, .perm-table td { padding: 0.5rem 0.75rem; text-align: center; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
	.perm-table th { background: var(--bg); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); }
	.perm-table td:first-child { text-align: left; }
	.perm-yes { color: #22c55e; background: rgba(34, 197, 94, 0.08); }
	.perm-no { color: #ef4444; background: rgba(239, 68, 68, 0.06); }

	.session-grid { display: flex; flex-direction: column; gap: 0; }
	.sr { display: flex; padding: 0.5rem 0; border-bottom: 1px solid var(--border); } .sr:last-child { border-bottom: none; }
	.sk { flex: 0 0 130px; font-weight: 600; color: var(--text-muted); font-size: 0.85rem; }
	.sv { flex: 1; font-size: 0.9rem; }


	/* Game picker */
	.game-picker { border-top: 1px solid var(--border); padding-top: 1rem; }
	.game-picker__title { font-size: 0.95rem; margin: 0 0 0.25rem; }
	.game-picker__input-wrap { position: relative; max-width: 400px; }
	.game-picker__clear { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.85rem; padding: 0.25rem; z-index: 1; }
	.game-picker__clear:hover { color: var(--fg); }
	:global(.game-picker__option-name) { font-weight: 500; }
	:global(.game-picker__option-id) { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; margin-left: auto; }
	.game-picker__empty { padding: 0.5rem 0.6rem; color: var(--muted); font-size: 0.8rem; }
	.game-picker__selected { font-size: 0.85rem; margin-top: 0.5rem; color: var(--accent); }
	.mono { font-family: monospace; font-size: 0.8rem; }

	/* ── Messaging Test Styles ── */
	.msg-test-field { margin-bottom: 1rem; }
	.msg-test-label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; color: var(--fg); }
	.msg-test-input, .msg-test-textarea {
		width: 100%; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit;
	}
	.msg-test-input:focus, .msg-test-textarea:focus { border-color: var(--accent); outline: none; }
	.msg-test-textarea { resize: vertical; min-height: 60px; }
	.perm-check-col { position: relative; }

	/* Combobox overrides for debug user pickers */
	:global(.debug-user-combobox .ui-combobox-input) { max-width: 100%; }
	.debug-user-role { font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 3px; background: var(--border); color: var(--text-muted); margin-left: auto; }
	.debug-user-role--staff { background: rgba(34,197,94,0.15); color: #22c55e; }
	.debug-combobox__empty { padding: 0.75rem; font-size: 0.85rem; text-align: center; }

	.msg-test-chip { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; }
	.msg-test-chip__name { font-weight: 500; }
	.msg-test-chip__role { font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 3px; background: var(--border); color: var(--text-muted); }
	.msg-test-chip__role--staff { background: rgba(34,197,94,0.15); color: #22c55e; }
	.msg-test-chip__remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; padding: 0 0.2rem; }
	.msg-test-chip__remove:hover { color: #ef4444; }

	.msg-test-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
	.btn--small { font-size: 0.75rem; padding: 0.25rem 0.5rem; background: transparent; border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); cursor: pointer; }
	.btn--small:hover { color: var(--fg); border-color: var(--accent); }

	/* Permission checker */
	.perm-check-grid { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 1rem; }
	.perm-check-col { flex: 1; position: relative; }
	.perm-check-arrow { padding-top: 1.8rem; font-size: 1.2rem; color: var(--text-muted); flex-shrink: 0; }
	.perm-verdict { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border); }
	.perm-verdict--allowed { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.3); }
	.perm-verdict--blocked { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.3); }
	.perm-verdict__icon { font-size: 1.2rem; flex-shrink: 0; }
	.perm-verdict__reason { font-size: 0.85rem; color: var(--text-muted); margin: 0.15rem 0 0; }

	/* Test results log */
	.msg-log-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
	.msg-log-header h2 { margin: 0; }
	.msg-log { display: flex; flex-direction: column; gap: 0.5rem; }
	.msg-log__entry { padding: 0.6rem 0.75rem; border-radius: 6px; border: 1px solid var(--border); }
	.msg-log__entry--ok { border-color: rgba(34,197,94,0.3); }
	.msg-log__entry--err { border-color: rgba(239,68,68,0.3); }
	.msg-log__top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
	.msg-log__scenario { font-weight: 600; font-size: 0.85rem; flex: 1; }
	.msg-log__status { font-size: 0.75rem; font-weight: 700; font-family: monospace; padding: 0.1rem 0.35rem; border-radius: 3px; background: var(--border); }
	.msg-log__entry--ok .msg-log__status { background: rgba(34,197,94,0.15); color: #22c55e; }
	.msg-log__entry--err .msg-log__status { background: rgba(239,68,68,0.15); color: #ef4444; }
	.msg-log__time { font-size: 0.72rem; color: var(--text-muted); }
	.msg-log__body { font-size: 0.78rem; font-family: monospace; background: var(--bg); padding: 0.4rem 0.5rem; border-radius: 4px; margin: 0; overflow-x: auto; white-space: pre-wrap; word-break: break-word; color: var(--text-muted); max-height: 120px; overflow-y: auto; }

	@media (max-width: 600px) {
		.perm-check-grid { flex-direction: column; }
		.perm-check-arrow { transform: rotate(90deg); text-align: center; padding: 0; }
		.msg-test-actions { flex-direction: column; }
	}
</style>
