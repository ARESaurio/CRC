<script lang="ts">
	import { showCookieSettings } from '$stores/consent';
	const year = new Date().getFullYear();
</script>

<footer class="site-footer">
	<div class="footer-content">
		<div class="footer-grid">
			<div class="footer-section">
				<a href="/" class="footer-brand">CRC</a>
				<p class="footer-tagline">Challenge Run Community</p>
				<p class="footer-description">
					A community-driven platform for challenge run speedrunners and enthusiasts.
				</p>
				<p class="footer-description">
					Game content and images are property of their respective owners.
				</p>
			</div>

			<div class="footer-section">
				<h4 class="footer-heading">Explore</h4>
				<ul class="footer-links">
					<li><a href="/games">Games</a></li>
					<li><a href="/runners">Runners</a></li>
					<li><a href="/teams">Teams</a></li>
					<li><a href="/news">News</a></li>
				</ul>
			</div>

			<div class="footer-section">
				<h4 class="footer-heading">Resources</h4>
				<ul class="footer-links">
					<li><a href="/rules">Rules</a></li>
					<li><a href="/glossary">Glossary</a></li>
					<li><a href="/support">Support</a></li>
					<li><a href="/support#contact">Contact Us</a></li>
					<li><a href="/feed.xml">RSS Feed</a></li>
				</ul>
			</div>

			<div class="footer-section">
				<h4 class="footer-heading">Legal</h4>
				<ul class="footer-links">
					<li><a href="/legal/privacy">Privacy Policy</a></li>
					<li><a href="/legal/terms">Terms of Service</a></li>
					<li><a href="/legal/cookies">Cookie Policy</a></li>
					<li><a href="/guidelines">Community Guidelines</a></li>
					<li><button class="footer-link-btn" onclick={() => showCookieSettings.set(true)}>Cookie Settings</button></li>
				</ul>
			</div>
		</div>

		<div class="footer-bottom">
			<p>&copy; {year} Challenge Run Community. All rights reserved.</p>
		</div>
	</div>
</footer>
