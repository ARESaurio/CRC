<script lang="ts">
	import { showCookieSettings } from '$stores/consent';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	const year = new Date().getFullYear();
</script>

<footer class="site-footer">
	<div class="footer-content">
		<div class="footer-grid">
			<div class="footer-section">
				<a href={localizeHref('/')} class="footer-brand">CRC</a>
				<p class="footer-tagline">{m.footer_tagline()}</p>
				<p class="footer-description">
					{m.footer_description()}
				</p>
				<p class="footer-description">
					{m.footer_copyright_notice()}
				</p>
			</div>

			<div class="footer-section">
				<h4 class="footer-heading">{m.footer_explore()}</h4>
				<ul class="footer-links">
					<li><a href={localizeHref('/games')}>{m.nav_games()}</a></li>
					<li><a href={localizeHref('/runners')}>{m.nav_runners()}</a></li>
					<li><a href={localizeHref('/news')}>{m.nav_news()}</a></li>
				</ul>
			</div>

			<div class="footer-section">
				<h4 class="footer-heading">{m.footer_resources()}</h4>
				<ul class="footer-links">
					<li><a href={localizeHref('/rules')}>{m.nav_rules()}</a></li>
					<li><a href={localizeHref('/glossary')}>{m.nav_glossary()}</a></li>
					<li><a href={localizeHref('/support')}>{m.nav_support()}</a></li>
					<li><a href={localizeHref('/support#contact')}>{m.footer_contact_us()}</a></li>
					<li><a href="/feed.xml">{m.nav_rss_feed()}</a></li>
				</ul>
			</div>

			<div class="footer-section">
				<h4 class="footer-heading">{m.footer_legal()}</h4>
				<ul class="footer-links">
					<li><a href={localizeHref('/legal/privacy')}>{m.footer_privacy_policy()}</a></li>
					<li><a href={localizeHref('/legal/terms')}>{m.footer_terms_of_service()}</a></li>
					<li><a href={localizeHref('/legal/cookies')}>{m.footer_cookie_policy()}</a></li>
					<li><a href={localizeHref('/guidelines')}>{m.footer_community_guidelines()}</a></li>
					<li><button class="footer-link-btn" onclick={() => showCookieSettings.set(true)}>{m.footer_cookie_settings()}</button></li>
				</ul>
			</div>
		</div>

		<div class="footer-bottom">
			<p>{m.footer_copyright({ year: String(year) })}</p>
		</div>
	</div>
</footer>
