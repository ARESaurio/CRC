<script lang="ts">
  import { showCookieSettings } from '$stores/consent';
  import { localizeHref } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.cookies_page_title()}</title></svelte:head>

<div class="page-width">
  <div class="legal-page">
    <h1>{m.cookies_heading()}</h1>
    <p class="legal-updated">{m.cookies_updated()}</p>
    
    <div class="legal-toc card">
      <h2>{m.cookies_toc()}</h2>
      <ol>
        <li><a href="#what-are-cookies">{m.cookies_toc_what()}</a></li>
        <li><a href="#cookies-we-use">{m.cookies_toc_we_use()}</a></li>
        <li><a href="#third-party">{m.cookies_toc_third_party()}</a></li>
        <li><a href="#your-choices">{m.cookies_toc_choices()}</a></li>
        <li><a href="#changes">{m.cookies_toc_changes()}</a></li>
        <li><a href="#contact">{m.cookies_toc_contact()}</a></li>
      </ol>
    </div>
    
    <section id="what-are-cookies"><h2>{m.cookies_s1_heading()}</h2><p>Cookies are small text files that websites place on your device to store information. They help websites remember your preferences and keep you signed in. We also use <strong>localStorage</strong> (browser-based storage) for saving preferences and consent choices.</p></section>
    
    <section id="cookies-we-use">
      <h2>{m.cookies_s2_heading()}</h2>
      
      <h3>{m.cookies_s2_essential()}</h3>
      <p>These cookies are necessary for the Website to function and cannot be disabled.</p>
      <table class="legal-table">
        <thead><tr><th>{m.cookies_th_name()}</th><th>{m.cookies_th_provider()}</th><th>{m.cookies_th_purpose()}</th><th>{m.cookies_th_duration()}</th></tr></thead>
        <tbody>
          <tr><td><code>sb-*-auth-token</code></td><td>Supabase</td><td>Keeps you signed in to your account.</td><td>7 days</td></tr>
          <tr><td><code>crc-theme</code></td><td>CRC (localStorage)</td><td>Remembers your selected theme.</td><td>Persistent until cleared</td></tr>
          <tr><td><code>crc-custom-theme</code></td><td>CRC (localStorage)</td><td>Stores your custom theme settings (accent color, background, font).</td><td>Persistent until cleared</td></tr>
          <tr><td><code>crc_cookie_consent</code></td><td>CRC (localStorage)</td><td>Stores your cookie consent preferences.</td><td>1 year</td></tr>
          <tr><td><code>cf_clearance</code></td><td>Cloudflare</td><td>Verifies you are a legitimate visitor (Turnstile challenge).</td><td>30 minutes</td></tr>
        </tbody>
      </table>
      <p><strong>Legal basis:</strong> Legitimate interest — strictly necessary to provide the service.</p>
      
      <h3>{m.cookies_s2_analytics()}</h3>
      <p>We use Cloudflare Web Analytics, a privacy-focused analytics service that does not use client-side cookies, does not track individual users across sites, and does not collect personal data. It sends a beacon request from your browser and is <strong>only loaded with your consent</strong>.</p>
      <p><strong>Legal basis:</strong> Consent.</p>
      
      <h3>{m.cookies_s2_not_used()}</h3>
      <p>We do <strong>not</strong> use advertising or marketing cookies, cross-site tracking cookies, social media tracking pixels, or cookies that sell or share your data with advertisers.</p>
    </section>
    
    <section id="third-party"><h2>{m.cookies_s3_heading()}</h2><p>The following third-party services may set cookies or process data when you use the Website:</p><ul><li><strong>Supabase</strong> — Authentication session cookies. <a href="https://supabase.com/privacy" target="_blank" rel="noopener">Privacy Policy</a></li><li><strong>Cloudflare</strong> — Security-related cookies. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Privacy Policy</a></li><li><strong>Embedded content</strong> — YouTube and Twitch embeds (for run videos) may set their own cookies. We load these using privacy-enhanced modes where available. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">YouTube</a> · <a href="https://www.twitch.tv/p/en/legal/privacy-notice/" target="_blank" rel="noopener">Twitch</a></li></ul></section>
    
    <section id="your-choices"><h2>{m.cookies_s4_heading()}</h2><p>When you first visit the Website, a cookie consent banner lets you accept all cookies, reject non-essential cookies, or manage specific categories. You can change your preferences at any time via <button class="inline-link" onclick={() => showCookieSettings.set(true)}>{m.footer_cookie_settings()}</button> in the footer, or through your browser's privacy settings.</p><p><strong>Note:</strong> Blocking essential cookies will prevent you from signing in and may affect other functionality.</p></section>
    
    <section id="changes"><h2>{m.cookies_s5_heading()}</h2><p>We may update this Cookie Policy from time to time and will update the "Last updated" date at the top. If we add new categories of non-essential cookies, we will ask for your consent again.</p></section>
    
    <section id="contact"><h2>{m.cookies_s6_heading()}</h2><p>If you have questions about this Cookie Policy, please contact us:</p><ul><li>Email: <a href="mailto:privacy@challengerun.net">privacy@challengerun.net</a></li><li>{m.nav_support()}: <a href={localizeHref("/support/")}>{m.nav_support()}</a></li></ul></section>
  </div>
</div>

<style>
.legal-page { max-width: 800px; margin: 0 auto; }
.legal-updated { color: var(--text-muted); margin-bottom: 2rem; }
.legal-toc { margin-bottom: 2rem; }
.legal-toc ol { margin: 0; padding-left: 1.5rem; }
.legal-toc li { margin: 0.35rem 0; }
.legal-page section { margin-bottom: 2.5rem; }
.legal-page h2 { margin-top: 2rem; margin-bottom: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.legal-page h3 { margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 1.1rem; }
.legal-page ul { margin: 0.75rem 0; padding-left: 1.5rem; }
.legal-page li { margin: 0.5rem 0; }
.legal-table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
.legal-table th, .legal-table td { padding: 0.75rem; text-align: left; border: 1px solid var(--border); }
.legal-table th { background: var(--surface); font-weight: 600; }
.legal-table code { font-size: 0.8rem; background: var(--bg); padding: 0.1rem 0.3rem; border-radius: 3px; }
.inline-link { background: none; border: none; padding: 0; color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline; }
.inline-link:hover { opacity: 0.8; }
</style>
