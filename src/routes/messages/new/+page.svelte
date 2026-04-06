<script lang="ts">
	import { X, ArrowLeft} from 'lucide-svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user } from '$stores/auth';
	import { createThread } from '$stores/messages';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { showToast } from '$stores/toast';

	let recipientQuery = $state('');
	let recipientFilterText = $state('');
	let searchResults = $state<{ user_id: string; display_name: string; avatar_url: string | null; runner_id: string | null }[]>([]);
	let selectedRecipients = $state<{ user_id: string; display_name: string; avatar_url: string | null; runner_id: string | null }[]>([]);
	let subject = $state('');
	let message = $state('');
	let sending = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;
	let isStaff = $state(false);

	// Pre-fill from query params (e.g. /messages/new?to=user_id&subject=...)
	onMount(async () => {
		if (!$user) return;

		// Check if current user is staff
		const { data: profile } = await supabase
			.from('profiles')
			.select('is_admin, is_super_admin, role')
			.eq('user_id', $user.id)
			.maybeSingle();

		if (profile) {
			isStaff = profile.is_admin || profile.is_super_admin || profile.role === 'moderator';
		}
		if (!isStaff) {
			const { data: verifier } = await supabase
				.from('role_game_verifiers')
				.select('id')
				.eq('user_id', $user.id)
				.limit(1)
				.maybeSingle();
			if (verifier) isStaff = true;
		}

		// Pre-fill recipient from URL
		const toId = $page.url.searchParams.get('to');
		if (toId) {
			const { data: recipientProfile } = await supabase
				.from('profiles')
				.select('user_id, display_name, avatar_url, runner_id')
				.eq('user_id', toId)
				.maybeSingle();
			if (recipientProfile) {
				selectedRecipients = [recipientProfile];
			}
		}

		// Pre-fill subject from URL
		const subjectParam = $page.url.searchParams.get('subject');
		if (subjectParam) subject = subjectParam;
	});

	async function searchRecipients() {
		const q = recipientQuery.trim();
		if (q.length < 2) {
			searchResults = [];
			return;
		}

		const alreadySelected = selectedRecipients.map((r) => r.user_id);

		// Search profiles by display_name or runner_id
		let query = supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url, runner_id, is_admin, is_super_admin, role')
			.or(`display_name.ilike.%${q}%,runner_id.ilike.%${q}%`)
			.eq('status', 'approved')
			.limit(8);

		const { data } = await query;

		let results = (data || [])
			.filter((p: any) => p.user_id !== $user?.id && !alreadySelected.includes(p.user_id));

		// If current user is NOT staff, only show staff recipients
		if (!isStaff) {
			// Filter: need to also check role tables for verifiers/moderators
			const staffResults = [];
			for (const p of results) {
				if (p.is_admin || p.is_super_admin || p.role === 'moderator') {
					staffResults.push(p);
					continue;
				}
				// Check verifier/moderator roles
				const { data: roleCheck } = await supabase
					.from('role_game_verifiers')
					.select('id')
					.eq('user_id', p.user_id)
					.limit(1)
					.maybeSingle();
				if (roleCheck) {
					staffResults.push(p);
					continue;
				}
				const { data: modCheck } = await supabase
					.from('role_game_moderators')
					.select('id')
					.eq('user_id', p.user_id)
					.limit(1)
					.maybeSingle();
				if (modCheck) staffResults.push(p);
			}
			results = staffResults;
		}

		searchResults = results.map((p: any) => ({
			user_id: p.user_id,
			display_name: p.display_name || p.runner_id || 'Unknown',
			avatar_url: p.avatar_url,
			runner_id: p.runner_id,
		}));
	}

	function handleSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(searchRecipients, 300);
	}

	function addRecipient(userId: string) {
		const r = searchResults.find(s => s.user_id === userId);
		if (r && !selectedRecipients.find((s) => s.user_id === r.user_id)) {
			selectedRecipients = [...selectedRecipients, r];
		}
		recipientQuery = '';
		recipientFilterText = '';
		searchResults = [];
	}

	function removeRecipient(userId: string) {
		selectedRecipients = selectedRecipients.filter((r) => r.user_id !== userId);
	}

	async function handleSubmit() {
		if (selectedRecipients.length === 0 || !message.trim()) return;
		sending = true;

		const result = await createThread({
			participant_ids: selectedRecipients.map((r) => r.user_id),
			subject: subject.trim() || undefined,
			type: selectedRecipients.length > 1 ? 'group' : 'direct',
			initial_message: message.trim(),
		});

		if (result.ok && result.thread_id) {
			showToast('success', 'Message sent!');
			goto(localizeHref(`/messages/${result.thread_id}`));
		} else {
			showToast('error', result.error || 'Failed to send message');
			sending = false;
		}
	}
</script>

<svelte:head>
	<title>{m.msg_new_title()}</title>
</svelte:head>

<div class="messages-page page-width">
	<div class="messages-header">
		<a href={localizeHref('/messages')} class="back-link"><ArrowLeft size={14} /> Messages</a>
		<h2>{m.msg_new_heading()}</h2>
	</div>

	{#if !$user}
		<div class="messages-empty">
			<p>{m.msg_new_sign_in_required()}</p>
			<a href={localizeHref('/sign-in')} class="btn btn--primary">{m.msg_sign_in()}</a>
		</div>
	{:else}
		<div class="compose-form">
			<!-- Recipients -->
			<div class="compose-field">
				<label class="compose-label">{m.msg_new_to()}</label>
				<div class="compose-recipients">
					{#each selectedRecipients as r (r.user_id)}
						<span class="recipient-chip">
							<img class="recipient-chip__avatar" src={r.avatar_url || '/img/site/default-runner.png'} alt="" />
							{r.display_name}
							<button type="button" class="recipient-chip__remove" onclick={() => removeRecipient(r.user_id)}><X size={14} /></button>
						</span>
					{/each}
					<div class="recipient-search">
						<Combobox.Root
							class="recipient-combobox"
							bind:inputValue={recipientQuery}
							onInputValueChange={(v: string) => { recipientFilterText = v; handleSearchInput(); }}
							onValueChange={(v: string) => { if (v) addRecipient(v); }}
							onOpenChange={(o: boolean) => { if (!o) recipientFilterText = ''; }}
						>
							<Combobox.Input placeholder={selectedRecipients.length === 0 ? (isStaff ? 'Search runners…' : 'Search staff…') : 'Add another…'} />
							<Combobox.Content>
								{#each searchResults as r (r.user_id)}
									<Combobox.Item value={r.user_id} label={r.display_name} forceMount>
										<img class="recipient-result__avatar" src={r.avatar_url || '/img/site/default-runner.png'} alt="" />
										<span>{r.display_name}</span>
										{#if r.runner_id}
											<span class="recipient-result__id">@{r.runner_id}</span>
										{/if}
									</Combobox.Item>
								{/each}
								{#if recipientFilterText.length >= 2 && searchResults.length === 0}
									<div class="recipient-combobox__empty muted">No matches found.</div>
								{/if}
							</Combobox.Content>
						</Combobox.Root>
					</div>
				</div>
				{#if !isStaff}
					<p class="compose-hint">{m.msg_new_hint()}</p>
				{/if}
			</div>

			<!-- Subject -->
			<div class="compose-field">
				<label class="compose-label" for="msg-subject">Subject <span class="muted">(optional)</span></label>
				<input
					id="msg-subject"
					type="text"
					class="compose-input"
					placeholder="What's this about?"
					bind:value={subject}
					maxlength="200"
				/>
			</div>

			<!-- Message -->
			<div class="compose-field">
				<label class="compose-label" for="msg-content">{m.msg_new_message()}</label>
				<textarea
					id="msg-content"
					class="compose-textarea"
					placeholder="Type your message…"
					bind:value={message}
					maxlength="2000"
					rows="6"
				></textarea>
				<span class="compose-charcount">{message.length}/2000</span>
			</div>

			<!-- Submit -->
			<div class="compose-actions">
				<Button.Root
					variant="accent"
					disabled={selectedRecipients.length === 0 || !message.trim() || sending}
					onclick={handleSubmit}
				>
					{sending ? 'Sending…' : 'Send Message'}
				</Button.Root>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.recipient-combobox .ui-combobox-input) { max-width: 100%; }
	.recipient-result__avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.recipient-result__id { font-size: 0.78rem; color: var(--muted); margin-left: auto; }
	.recipient-combobox__empty { padding: 0.75rem; font-size: 0.85rem; text-align: center; }
</style>
