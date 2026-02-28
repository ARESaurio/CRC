<script lang="ts">
</script>

<svelte:head><title>Support | Challenge Run Community</title></svelte:head>

<div class="page-width">
	<h1>Support</h1>
	<p class="muted">Get help, submit content, or connect with the Challenge Run Community.</p>

	<section class="support-grid">
		<div class="card">
			<h2>📥 Submit Content</h2>
			<p>Help grow the CRC database by submitting runs and games.</p>
			<ul class="support-links">
				<li><a href="/submit">Submit a Run</a> — Record your achievement with video proof</li>
				<li><a href="/submit-game">Request a New Game</a> — Suggest a game to add to CRC</li>
			</ul>
		</div>

		<div class="card">
			<h2>💬 Connect</h2>
			<p>Join the community and get help from other runners.</p>
			<ul class="support-links">
				<li><a href="https://discord.gg/challengerun" target="_blank" rel="noopener">Discord Server</a> — Chat, ask questions, and find running partners</li>
			</ul>
		</div>

		<div class="card">
			<h2>❓ Frequently Asked Questions</h2>

			<details class="faq-item">
				<summary>How do I submit a run?</summary>
				<p>Go to the <a href="/submit">Submit a Run</a> page, select your game and category, enter your runner name, paste your video URL (YouTube or Twitch), and submit. A verifier will review your run and approve it if it meets the requirements.</p>
			</details>

			<details class="faq-item">
				<summary>What counts as a "hit" vs "damage"?</summary>
				<p>A <strong>hit</strong> is any contact from an enemy or hazard. <strong>Damage</strong> is health loss. These can differ — a blocked attack may be a hit but not damage. Each game defines these specifically on its rules page. See our <a href="/glossary">Glossary</a> for general definitions.</p>
			</details>

			<details class="faq-item">
				<summary>What video proof do I need?</summary>
				<p>A full, unedited recording of your run showing the claimed challenge. The video must be hosted on YouTube or Twitch. Make sure the game audio and visuals are clear enough to verify. Split-screen or multi-monitor recordings should clearly show the game window.</p>
			</details>

			<details class="faq-item">
				<summary>How long does verification take?</summary>
				<p>Verification times depend on game moderator availability and video length. Most runs are reviewed within a few days. Complex or long runs may take longer. You can check your submission status on the admin dashboard if you have an account.</p>
			</details>

			<details class="faq-item">
				<summary>Can I submit runs for a game not on CRC?</summary>
				<p>Yes! Use the <a href="/submit-game">Request a New Game</a> form. Include the game name, suggested categories, and any challenge definitions specific to that game. An admin will review and add it to the platform.</p>
			</details>

			<details class="faq-item">
				<summary>How do I create a runner profile?</summary>
				<p>Sign in with Discord or Twitch, then visit <a href="/profile/create">Create Profile</a>. Choose a runner ID (this is permanent), add your display name, bio, and social links. Your profile will be reviewed by an admin before going public.</p>
			</details>

			<details class="faq-item">
				<summary>Can I edit or delete my data?</summary>
				<p>Yes. You can edit your profile through account settings. To request a full data export or deletion, use the data export feature in your profile settings or contact us using the information below. We comply with GDPR and CCPA. See our <a href="/legal/privacy">Privacy Policy</a> for details.</p>
			</details>
		</div>

		<div class="card" id="contact">
			<h2>📧 Contact</h2>
			<p>For support requests, privacy inquiries, or issues not covered above:</p>
			<ul class="support-links">
				<li><strong>General support:</strong> Join our Discord or email <em>support@challengerun.net</em></li>
				<li><strong>Privacy requests:</strong> <em>privacy@challengerun.net</em></li>
				<li><strong>Legal inquiries:</strong> <em>legal@challengerun.net</em></li>
			</ul>
			<p class="muted" style="margin-top: 0.75rem; font-size: 0.85rem;">Response times vary. Discord is fastest for general questions.</p>
		</div>

		<div class="card">
			<h2>📚 Resources</h2>
			<ul class="support-links">
				<li><a href="/rules">General Rules</a> — Universal rules that apply to all games on CRC</li>
				<li><a href="/guidelines">Community Guidelines</a> — Code of conduct for the community</li>
				<li><a href="/glossary">Glossary</a> — Definitions for challenge run terminology</li>
				<li><a href="/legal/terms">Terms of Service</a></li>
				<li><a href="/legal/privacy">Privacy Policy</a></li>
				<li><a href="/legal/cookies">Cookie Policy</a></li>
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

	/* FAQ */
	.faq-item {
		border-bottom: 1px solid var(--border);
		padding: 0.75rem 0;
	}
	.faq-item:last-child { border-bottom: none; }
	.faq-item summary {
		cursor: pointer;
		font-weight: 600;
		line-height: 1.5;
		color: var(--fg);
	}
	.faq-item summary:hover { color: var(--accent); }
	.faq-item p {
		margin: 0.5rem 0 0;
		padding-left: 1rem;
		font-size: 0.9rem;
		color: var(--muted);
		line-height: 1.6;
	}
	.faq-item p a { color: var(--accent); }
</style>
