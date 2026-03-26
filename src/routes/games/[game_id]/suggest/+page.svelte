<script lang="ts">
	import { X } from 'lucide-svelte';
	import { session } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';

	let { data } = $props();
	const game = $derived(data.game);

	// Form state
	let suggestSection = $state('');
	let suggestType = $state('');
	let suggestDetails = $state('');
	let suggestSubmitting = $state(false);
	let suggestError = $state('');
	let suggestSuccess = $state(false);

	// Image upload
	let suggestImages = $state<File[]>([]);
	let imagePreviewUrls = $state<string[]>([]);
	const MAX_IMAGES = 5;
	const MAX_FILE_SIZE = 2 * 1024 * 1024;
	const ALLOWED_TYPES = ['image/png', 'image/jpg', 'image/jpeg'];

	const suggestBannedWarning = $derived(checkBannedTerms(suggestDetails));

	function handleImageSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		const newFiles = Array.from(input.files);
		let errorMsg = '';
		for (const file of newFiles) {
			if (suggestImages.length >= MAX_IMAGES) { errorMsg = `Maximum ${MAX_IMAGES} images allowed.`; break; }
			if (!ALLOWED_TYPES.includes(file.type)) { errorMsg = `${file.name}: Only PNG and JPG files are allowed.`; continue; }
			if (file.size > MAX_FILE_SIZE) { errorMsg = `${file.name}: File exceeds 2MB limit.`; continue; }
			suggestImages = [...suggestImages, file];
			imagePreviewUrls = [...imagePreviewUrls, URL.createObjectURL(file)];
		}
		if (errorMsg) suggestError = errorMsg;
		input.value = '';
	}

	function removeImage(index: number) {
		URL.revokeObjectURL(imagePreviewUrls[index]);
		suggestImages = suggestImages.filter((_, i) => i !== index);
		imagePreviewUrls = imagePreviewUrls.filter((_, i) => i !== index);
	}

	async function submitSuggestion(e: Event) {
		e.preventDefault();
		if (suggestBannedWarning) { suggestError = suggestBannedWarning; return; }
		suggestSubmitting = true;
		suggestError = '';

		try {
			const { data: userData } = await supabase.auth.getUser();
			if (!userData?.user) throw new Error('Not signed in');

			const uploadedUrls: string[] = [];
			if (suggestImages.length > 0) {
				const token = (await supabase.auth.getSession()).data.session?.access_token;
				if (!token) throw new Error('Not authenticated');

				for (const file of suggestImages) {
					const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
					const path = `${userData.user.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
					const uploadRes = await fetch(
						`${PUBLIC_SUPABASE_URL}/storage/v1/object/user_game_update_images/${path}`,
						{
							method: 'POST',
							headers: {
								'Authorization': `Bearer ${token}`,
								'apikey': PUBLIC_SUPABASE_ANON_KEY,
								'Content-Type': file.type,
							},
							body: file,
						}
					);
					if (!uploadRes.ok) {
						const err = await uploadRes.json().catch(() => ({}));
						throw new Error(err.message || `Image upload failed (${uploadRes.status})`);
					}
					uploadedUrls.push(`${PUBLIC_SUPABASE_URL}/storage/v1/object/public/user_game_update_images/${path}`);
				}
			}

			const insertData: Record<string, any> = {
				game_id: game.game_id,
				game_name: game.game_name,
				user_id: userData.user.id,
				section: suggestSection,
				update_type: suggestType,
				details: suggestDetails.trim(),
				status: 'pending',
				page_url: `/games/${game.game_id}`
			};
			if (uploadedUrls.length > 0) insertData.image_urls = uploadedUrls;

			const { error } = await supabase.from('game_update_requests').insert(insertData);
			if (error) throw error;
			suggestSuccess = true;
		} catch (err: any) {
			suggestError = err.message || 'Failed to submit. Please try again.';
		} finally {
			suggestSubmitting = false;
		}
	}

	function resetForm() {
		suggestSection = '';
		suggestType = '';
		suggestDetails = '';
		suggestSuccess = false;
		suggestError = '';
		imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
		suggestImages = [];
		imagePreviewUrls = [];
	}
</script>

<svelte:head>
	<title>{m.suggest_title({ name: game.game_name })}</title>
</svelte:head>

<div class="card">
	<h2 class="mb-2">{m.suggest_heading()}</h2>
	<p class="muted mb-3">{m.suggest_desc()}</p>

	{#if !$session}
		<p class="muted"><a href={localizeHref(`/sign-in?redirect=/games/${game.game_id}/suggest`)}>{m.btn_sign_in()}</a> {m.suggest_sign_in()}</p>
	{:else if suggestSuccess}
		<div class="suggest-success">
			<span>✅</span>
			<div>
				<strong>{m.suggest_success_title()}</strong>
				<p class="muted">{m.suggest_success_desc()}</p>
			</div>
		</div>
		<Button.Root size="sm" class="mt-2" onclick={resetForm}>{m.btn_submit_another()}</Button.Root>
	{:else}
		<form class="suggest-form" onsubmit={submitSuggestion}>
			<div class="suggest-form__field">
				<label class="form-label">{m.suggest_area_label()}</label>
				<Select.Root bind:value={suggestSection}>
					<Select.Trigger>{{ 'game-description': m.suggest_area_description(), 'full-runs': m.suggest_area_full_runs(), 'mini-challenges': m.suggest_area_mini(), rules: m.suggest_area_rules(), achievements: m.suggest_area_achievements(), credits: m.suggest_area_credits(), other: m.suggest_area_other() }[suggestSection] || m.suggest_area_placeholder()}</Select.Trigger>
					<Select.Content>
						<Select.Item value="game-description" label={m.suggest_area_description()} />
						<Select.Item value="full-runs" label={m.suggest_area_full_runs()} />
						<Select.Item value="mini-challenges" label={m.suggest_area_mini()} />
						<Select.Item value="rules" label={m.suggest_area_rules()} />
						<Select.Item value="achievements" label={m.suggest_area_achievements()} />
						<Select.Item value="credits" label={m.suggest_area_credits()} />
						<Select.Item value="other" label={m.suggest_area_other()} />
					</Select.Content>
				</Select.Root>
			</div>

			<div class="suggest-form__field">
				<label class="form-label">{m.suggest_type_label()}</label>
				<Select.Root bind:value={suggestType}>
					<Select.Trigger>{{ incorrect: m.suggest_type_incorrect(), missing: m.suggest_type_missing(), outdated: m.suggest_type_outdated(), typo: m.suggest_type_typo(), suggestion: m.suggest_type_suggestion() }[suggestType] || m.suggest_type_placeholder()}</Select.Trigger>
					<Select.Content>
						<Select.Item value="incorrect" label={m.suggest_type_incorrect()} />
						<Select.Item value="missing" label={m.suggest_type_missing()} />
						<Select.Item value="outdated" label={m.suggest_type_outdated()} />
						<Select.Item value="typo" label={m.suggest_type_typo()} />
						<Select.Item value="suggestion" label={m.suggest_type_suggestion()} />
					</Select.Content>
				</Select.Root>
			</div>

			<div class="suggest-form__field">
				<label class="form-label" for="suggest-details">{m.suggest_details_label()}</label>
				<textarea
					id="suggest-details"
					class="form-input"
					rows="4"
					maxlength="1000"
					required
					bind:value={suggestDetails}
					placeholder={m.suggest_details_placeholder()}
				></textarea>
				<p class="form-help">{suggestDetails.length}/1000</p>
			</div>

			<div class="suggest-form__field">
				<label class="form-label">{m.suggest_screenshots_label()} <span class="form-help-inline">({m.suggest_screenshots_hint({ max: String(MAX_IMAGES) })})</span></label>
				{#if imagePreviewUrls.length > 0}
					<div class="suggest-previews">
						{#each imagePreviewUrls as url, i}
							<div class="suggest-preview">
								<img src={url} alt="Preview {i + 1}" />
								<button type="button" class="suggest-preview__remove" onclick={() => removeImage(i)} title="Remove"><X size={14} /></button>
							</div>
						{/each}
					</div>
				{/if}
				{#if suggestImages.length < MAX_IMAGES}
					<label class="suggest-upload-btn">
						📎 {suggestImages.length > 0 ? m.suggest_add_more() : m.suggest_choose_images()}
						<input type="file" accept=".png,.jpg,.jpeg" multiple onchange={handleImageSelect} style="display:none" />
					</label>
				{/if}
			</div>

			{#if suggestBannedWarning}
				<div class="suggest-message suggest-message--error">{suggestBannedWarning}</div>
			{/if}

			{#if suggestError}
				<div class="suggest-message suggest-message--error">{suggestError}</div>
			{/if}

			<Button.Root variant="accent" type="submit" disabled={suggestSubmitting || !!suggestBannedWarning}>
				{#if suggestSubmitting}
					<span class="spinner spinner--small"></span> {m.btn_submitting()}
				{:else}
					{m.btn_submit_suggestion()}
				{/if}
			</Button.Root>
		</form>
	{/if}
</div>

<style>
	.mb-2 { margin-bottom: 0.75rem; }
	.mb-3 { margin-bottom: 1rem; }
	:global(.mt-2) { margin-top: 0.75rem; }

	.suggest-form { display: flex; flex-direction: column; gap: 0.75rem; }
	.suggest-form__field { display: flex; flex-direction: column; gap: 0.25rem; }
	.form-label { font-size: 0.85rem; font-weight: 600; }
	.form-input {
		font-size: 0.9rem; padding: 0.5rem 0.75rem; background: var(--bg);
		border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit;
	}
	.form-input:focus { outline: none; border-color: var(--accent); }
	textarea.form-input { resize: vertical; min-height: 80px; }
	.form-help { font-size: 0.75rem; color: var(--text-muted); margin: 0.15rem 0 0; }
	.form-help-inline { font-size: 0.8rem; color: var(--text-muted); font-weight: normal; }
	.suggest-message { padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; }
	.suggest-message--error { background: rgba(231, 76, 60, 0.15); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }
	.suggest-success {
		display: flex; align-items: flex-start; gap: 0.75rem; padding: 1rem;
		background: rgba(46, 204, 113, 0.1); border: 1px solid rgba(46, 204, 113, 0.25); border-radius: 6px;
	}
	.suggest-success span:first-child { font-size: 1.5rem; }
	.suggest-success p { margin: 0.25rem 0 0; font-size: 0.85rem; }
	.suggest-previews { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.suggest-preview { position: relative; width: 80px; height: 80px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
	.suggest-preview img { width: 100%; height: 100%; object-fit: cover; }
	.suggest-preview__remove { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0,0,0,0.7); color: #fff; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }
	.suggest-preview__remove:hover { background: #ef4444; }
	.suggest-upload-btn { display: inline-block; padding: 0.4rem 0.75rem; border: 1px dashed var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text-muted); cursor: pointer; transition: border-color 0.15s, color 0.15s; }
	.suggest-upload-btn:hover { border-color: var(--accent); color: var(--fg); }
	.spinner--small { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; display: inline-block; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 0.25rem; }
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
