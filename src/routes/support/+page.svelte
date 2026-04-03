<script lang="ts">
	import { session } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { HelpCircle, MessageSquare, Shield, Mail, ChevronDown, Send } from 'lucide-svelte';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import * as Select from '$lib/components/ui/select/index.js';

	// Privacy request form state
	let privacyRequestType = $state('');
	let privacyEmail = $state('');
	let privacyDetails = $state('');
	let privacyCopied = $state(false);

	const privacyRequestTypes: Record<string, string> = {
		access: m.support_privacy_access(),
		export: m.support_privacy_export(),
		correction: m.support_privacy_correction(),
		deletion: m.support_privacy_deletion(),
		restriction: m.support_privacy_restriction(),
		objection: m.support_privacy_objection(),
		other: m.support_privacy_other(),
	};

	function buildMailtoLink(): string {
		const subject = encodeURIComponent(`Privacy Request: ${privacyRequestTypes[privacyRequestType] || 'General'}`);
		const body = encodeURIComponent(
			`Privacy Request Type: ${privacyRequestTypes[privacyRequestType] || privacyRequestType}\n` +
			`Contact Email: ${privacyEmail}\n` +
			`${$session ? `Authenticated User: Yes\n` : ''}` +
			`\nDetails:\n${privacyDetails}\n\n` +
			`---\nSubmitted via CRC Support Page`
		);
		return `mailto:privacy@challengerun.net?subject=${subject}&body=${body}`;
	}

	function copyRequestToClipboard() {
		const text =
			`To: privacy@challengerun.net\n` +
			`Subject: Privacy Request: ${privacyRequestTypes[privacyRequestType] || 'General'}\n\n` +
			`Privacy Request Type: ${privacyRequestTypes[privacyRequestType] || privacyRequestType}\n` +
			`Contact Email: ${privacyEmail}\n` +
			`${$session ? `Authenticated User: Yes\n` : ''}` +
			`\nDetails:\n${privacyDetails}`;
		navigator.clipboard.writeText(text);
		privacyCopied = true;
		setTimeout(() => privacyCopied = false, 2000);
	}

	let privacyFormValid = $derived(privacyRequestType && privacyEmail && privacyDetails.trim().length > 10);
</script>

<svelte:head><title>{m.support_page_title()}</title></svelte:head>

<div class="page-width">
	<h1>{m.support_heading()}</h1>
	<p class="muted">{m.support_desc()}</p>

	<section class="support-grid">
		<div class="card">
			<h2>{m.support_submit_content()}</h2>
			<p>{m.support_submit_content_desc()}</p>
			<ul class="support-links">
				<li><a href={localizeHref('/submit')}>{m.submit_heading()}</a> — {m.support_submit_run_desc()}</li>
				<li><a href={localizeHref('/submit-game')}>{m.btn_submit_game_request()}</a> — {m.support_request_game_desc()}</li>
			</ul>
		</div>

		<div class="card">
			<h2>{m.support_connect()}</h2>
			<p>{m.support_connect_desc()}</p>
			<ul class="support-links">
				<li><a href="https://discord.gg/challengerun" target="_blank" rel="noopener">Discord Server</a> — {m.support_discord_desc()}</li>
			</ul>
		</div>

		<!-- Staff Section -->
		<div class="card" id="staff">
			<h2>{m.support_staff()}</h2>
			<p>{m.support_staff_desc()}</p>

			<div class="staff-roles">
				<div class="staff-role">
					<div class="staff-role__header">
						<span class="staff-role__icon">⭐</span>
						<strong>{m.support_super_admins()}</strong>
					</div>
					<p>{m.support_super_admins_desc()}</p>
				</div>

				<div class="staff-role">
					<div class="staff-role__header">
						<span class="staff-role__icon">🛡️</span>
						<strong>{m.support_admins()}</strong>
					</div>
					<p>{m.support_admins_desc()}</p>
				</div>

				<div class="staff-role">
					<div class="staff-role__header">
						<span class="staff-role__icon">👁️</span>
						<strong>{m.support_game_mods()}</strong>
					</div>
					<p>{m.support_game_mods_desc()}</p>
				</div>

				<div class="staff-role">
					<div class="staff-role__header">
						<span class="staff-role__icon">✅</span>
						<strong>{m.support_verifiers()}</strong>
					</div>
					<p>{m.support_verifiers_desc()}</p>
				</div>
			</div>

			<p class="staff-note muted">{@html m.support_join_team({ link_start: '<a href="https://discord.gg/challengerun" target="_blank" rel="noopener">', link_end: '</a>' })}</p>
		</div>

		<div class="card">
			<h2>{m.support_faq()}</h2>

			<Accordion.Root type="multiple" class="faq-accordion">
				<Accordion.Item value="submit" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_submit_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{@html m.support_faq_submit_a({ link_start: `<a href="${localizeHref('/submit')}">`, link_end: '</a>' })}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="hit" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_hit_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{@html m.support_faq_hit_a({ bold_start: '<strong>', bold_end: '</strong>', link_start: `<a href="${localizeHref('/glossary')}">`, link_end: '</a>' })}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="video" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_video_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{m.support_faq_video_a()}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="verify" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_verify_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{m.support_faq_verify_a()}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="new-game" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_new_game_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{@html m.support_faq_new_game_a({ link_start: `<a href="${localizeHref('/submit-game')}">`, link_end: '</a>' })}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="profile" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_profile_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{@html m.support_faq_profile_a({ link_start: `<a href="${localizeHref('/profile/create')}">`, link_end: '</a>' })}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="data" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_data_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{@html m.support_faq_data_a({ link_start: `<a href="${localizeHref('/profile/settings')}">`, link_end: '</a>' })}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="suggest" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_suggest_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{@html m.support_faq_suggest_a({ bold_start: '<strong>', bold_end: '</strong>' })}</p></Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="moderation" class="faq-item">
					<Accordion.Trigger class="faq-trigger">{m.support_faq_moderation_q()}</Accordion.Trigger>
					<Accordion.Content><p class="faq-answer">{@html m.support_faq_moderation_a({ discord_start: '<a href="https://discord.gg/challengerun" target="_blank" rel="noopener">', discord_end: '</a>', email_start: '<a href="mailto:support@challengerun.net">', email_end: '</a>' })}</p></Accordion.Content>
				</Accordion.Item>
			</Accordion.Root>
		</div>

		<!-- Privacy Request Form -->
		<div class="card" id="privacy">
			<h2>{m.support_privacy()}</h2>
			<p>{m.support_privacy_desc()} {#if $session}{@html m.support_privacy_settings_hint({ link_start: `<a href="${localizeHref('/profile/settings')}">`, link_end: '</a>' })}{/if}</p>

			<div class="privacy-form">
				<div class="privacy-form__field">
					<label class="form-label" for="privacy-type">{m.support_privacy_type()}</label>
					<Select.Root bind:value={privacyRequestType}>
						<Select.Trigger>{privacyRequestType ? privacyRequestTypes[privacyRequestType] : m.support_privacy_type_placeholder()}</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label={m.support_privacy_type_placeholder()} />
							{#each Object.entries(privacyRequestTypes) as [value, label]}
								<Select.Item {value} {label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="privacy-form__field">
					<label class="form-label" for="privacy-email">{m.support_privacy_email()}</label>
					<input id="privacy-email" type="email" class="form-input" bind:value={privacyEmail} placeholder="you@example.com" />
					<p class="form-help">{m.support_privacy_email_hint()}</p>
				</div>

				<div class="privacy-form__field">
					<label class="form-label" for="privacy-details">{m.support_privacy_details()}</label>
					<textarea
						id="privacy-details"
						class="form-input"
						rows="4"
						bind:value={privacyDetails}
						placeholder={m.support_privacy_details_placeholder()}
					></textarea>
					<p class="form-help">{m.support_privacy_details_hint()}</p>
				</div>

				{#if privacyRequestType === 'export' && $session}
					<div class="privacy-hint">
						<span>👁️</span>
						<p>{@html m.support_privacy_export_hint({ link_start: `<a href="${localizeHref('/profile/settings')}">`, link_end: '</a>' })}</p>
					</div>
				{/if}

				{#if privacyRequestType === 'deletion' && $session}
					<div class="privacy-hint">
						<span>👁️</span>
						<p>{@html m.support_privacy_delete_hint({ link_start: `<a href="${localizeHref('/profile/settings')}">`, link_end: '</a>' })}</p>
					</div>
				{/if}

				<div class="privacy-form__actions">
					<a
						href={privacyFormValid ? buildMailtoLink() : undefined}
						class="btn btn--primary"
						class:disabled={!privacyFormValid}
						onclick={(e: MouseEvent) => { if (!privacyFormValid) e.preventDefault(); }}
					>
						{m.support_privacy_open_email()}
					</a>
					<button
						class="btn btn--outline"
						disabled={!privacyFormValid}
						onclick={copyRequestToClipboard}
					>
						{privacyCopied ? m.support_privacy_copied() : m.support_privacy_copy()}
					</button>
				</div>
				<p class="form-help" style="margin-top: 0.5rem;">{@html m.support_privacy_mailto_hint({ bold_start: '<strong>', bold_end: '</strong>' })}</p>
			</div>
		</div>

		<div class="card" id="contact">
			<h2>{m.support_contact()}</h2>
			<p>{m.support_contact_desc()}</p>
			<ul class="support-links">
				<li><strong>{m.support_contact_general()}</strong> {m.support_contact_general_desc({ email: 'support@challengerun.net' })}</li>
				<li><strong>{m.support_contact_privacy()}</strong> {@html m.support_contact_privacy_desc({ email: '<em>privacy@challengerun.net</em>', link_start: '<a href="#privacy">', link_end: '</a>' })}</li>
				<li><strong>{m.support_contact_legal()}</strong> <em>legal@challengerun.net</em></li>
			</ul>
			<p class="muted" style="margin-top: 0.75rem; font-size: 0.85rem;">{m.support_contact_response()}</p>
		</div>

		<div class="card">
			<h2>{m.support_resources()}</h2>
			<ul class="support-links">
				<li><a href={localizeHref('/rules')}>{m.nav_rules()}</a> — {m.support_resources_rules()}</li>
				<li><a href={localizeHref('/guidelines')}>{m.nav_guidelines()}</a> — {m.support_resources_guidelines()}</li>
				<li><a href={localizeHref('/glossary')}>{m.nav_glossary()}</a> — {m.support_resources_glossary()}</li>
				<li><a href={localizeHref('/legal/terms')}>{m.footer_terms_of_service()}</a></li>
				<li><a href={localizeHref('/legal/privacy')}>{m.footer_privacy_policy()}</a></li>
				<li><a href={localizeHref('/legal/cookies')}>{m.footer_cookie_policy()}</a></li>
			</ul>
		</div>
	</section>
</div>

<style>
	.support-grid {
		display: grid;
		gap: 1.5rem;
		margin-top: 2rem;
	}
	.card h2 {
		margin: 0 0 0.75rem;
		font-size: 1.2rem;
	}
	.card p { line-height: 1.6; }
	.support-links {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 0;
	}
	.support-links li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
		line-height: 1.5;
	}
	.support-links li:last-child { border-bottom: none; }
	.support-links a { color: var(--accent); }

	/* Staff roles */
	.staff-roles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin: 1rem 0;
	}
	.staff-role {
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.staff-role__header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.35rem;
	}
	.staff-role__icon { font-size: 1.1rem; }
	.staff-role p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--muted);
		line-height: 1.5;
	}
	.staff-note {
		font-size: 0.85rem;
		margin: 0;
	}
	.staff-note :global(a) { color: var(--accent); }
	@media (max-width: 600px) {
		.staff-roles { grid-template-columns: 1fr; }
	}

	/* FAQ Accordion */
	:global(.faq-accordion) { display: flex; flex-direction: column; }
	:global(.faq-item) { border-bottom: 1px solid var(--border); }
	:global(.faq-item:last-child) { border-bottom: none; }
	:global(.faq-trigger) { font-weight: 600; line-height: 1.5; }
	:global(.faq-trigger:hover) { color: var(--accent); }
	.faq-answer {
		margin: 0;
		padding-left: 1rem;
		font-size: 0.9rem;
		color: var(--muted);
		line-height: 1.6;
	}
	:global(.faq-answer a) { color: var(--accent); }

	/* Privacy request form */
	.privacy-form {
		margin-top: 1rem;
	}
	.privacy-form__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
	}
	.form-label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.form-input {
		font-size: 0.9rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--fg);
		font-family: inherit;
	}
	.form-input:focus { outline: none; border-color: var(--accent); }
	textarea.form-input { resize: vertical; min-height: 80px; }
	.form-help {
		font-size: 0.75rem;
		color: var(--muted);
		margin: 0.15rem 0 0;
	}
	.privacy-hint {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.65rem 0.85rem;
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.2);
		border-radius: 6px;
		margin-bottom: 0.75rem;
	}
	.privacy-hint span { font-size: 1rem; flex-shrink: 0; }
	.privacy-hint p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.privacy-hint :global(a) { color: var(--accent); }
	.privacy-form__actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: none;
		color: var(--fg);
		cursor: pointer;
		font-size: 0.9rem;
		text-decoration: none;
		font-family: inherit;
	}
	.btn--primary {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.btn--primary:hover { opacity: 0.9; color: #fff; }
	.btn--outline { background: none; }
	.btn.disabled, .btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		pointer-events: none;
	}
</style>
