<script lang="ts">
  import { showCookieSettings } from '$stores/consent';
  import { localizeHref } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.privacy_page_title()}</title></svelte:head>


<div class="page-width">
  <div class="legal-page">
    <h1>{m.privacy_heading()}</h1>
    <p class="legal-updated">{m.privacy_updated()}</p>
    
    <div class="legal-toc card">
      <h2>{m.privacy_toc()}</h2>
      <ol>
        <li><a href="#introduction">{m.privacy_toc_intro()}</a></li>
        <li><a href="#data-collected">{m.privacy_toc_data_collected()}</a></li>
        <li><a href="#legal-basis">{m.privacy_toc_legal_basis()}</a></li>
        <li><a href="#how-we-use">{m.privacy_toc_how_we_use()}</a></li>
        <li><a href="#data-sharing">{m.privacy_toc_data_sharing()}</a></li>
        <li><a href="#cookies">{m.privacy_toc_cookies()}</a></li>
        <li><a href="#data-retention">{m.privacy_toc_retention()}</a></li>
        <li><a href="#your-rights">{m.privacy_toc_your_rights()}</a></li>
        <li><a href="#children">{m.privacy_toc_children()}</a></li>
        <li><a href="#security">{m.privacy_toc_security()}</a></li>
        <li><a href="#data-breach">{m.privacy_toc_breach()}</a></li>
        <li><a href="#international">{m.privacy_toc_international()}</a></li>
        <li><a href="#changes">{m.privacy_toc_changes()}</a></li>
        <li><a href="#contact">{m.privacy_toc_contact()}</a></li>
      </ol>
    </div>
    
    <section id="introduction"><h2>{m.privacy_s1_heading()}</h2><p>Welcome to Challenge Run Community ("CRC", "we", "us", or "our"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit <strong>challengerun.net</strong> (the "Website") and use our services.</p><p>By using the Website, you acknowledge the collection and use of information as described in this Privacy Policy. Where we rely on your consent for specific processing activities (such as analytics), we will ask for it separately.</p></section>
    
    <section id="data-collected"><h2>{m.privacy_s2_heading()}</h2><h3>2.1 Information You Provide</h3><p>We collect information you voluntarily provide when you:</p><ul><li><strong>Create an account:</strong> Display name, runner ID, bio, social media links, location (optional), pronouns (optional)</li><li><strong>Sign in with OAuth:</strong> Information from Discord or Twitch (username, avatar, email address)</li><li><strong>Submit runs:</strong> Game, category, completion time, video links, platform, challenge details</li><li><strong>Customize your profile:</strong> Avatar image, banner image, accent color, status message</li><li><strong>Contact support:</strong> Your message content and contact information</li></ul><h3>2.2 Information Collected Automatically</h3><p>When you access the Website, we may automatically collect:</p><ul><li><strong>Device information:</strong> Browser type, operating system, device type</li><li><strong>Usage data:</strong> Pages visited, time spent, referring URLs (via Cloudflare Web Analytics, only with your consent)</li><li><strong>IP address:</strong> Processed by Cloudflare for security purposes. We do not store raw IP addresses in our own database.</li><li><strong>Cookies and local storage:</strong> See <a href="#cookies">Section 6</a> and our <a href={localizeHref("/legal/cookies/")}>Cookie Policy</a></li></ul><h3>2.3 Information from Third Parties</h3><p>When you sign in using Discord or Twitch, we receive your username, display name, profile avatar, email address (if shared), and unique provider ID. We do not receive your password or gain the ability to post on your behalf.</p></section>
    
    <section id="legal-basis"><h2>{m.privacy_s3_heading()}</h2><p>If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, we process your personal data under the following legal bases:</p><table class="legal-table"><thead><tr><th>{m.privacy_th_activity()}</th><th>{m.privacy_th_basis()}</th></tr></thead><tbody><tr><td>Account creation, authentication, displaying your profile and runs</td><td><strong>Contract performance</strong> — necessary to provide the service</td></tr><tr><td>Essential cookies (authentication, preferences)</td><td><strong>Legitimate interest</strong> — strictly necessary for the service</td></tr><tr><td>Analytics (Cloudflare Web Analytics)</td><td><strong>Consent</strong> — only activated after you accept analytics cookies</td></tr><tr><td>Security and fraud prevention</td><td><strong>Legitimate interest</strong> — protecting the Website and its users</td></tr><tr><td>Legal compliance</td><td><strong>Legal obligation</strong> — where required by applicable law</td></tr></tbody></table><p>Where we rely on legitimate interest, we have assessed that our interests do not override your rights and freedoms. You may object to processing based on legitimate interest at any time.</p></section>
    
    <section id="how-we-use"><h2>{m.privacy_s4_heading()}</h2><p>We use the information we collect to:</p><ul><li>Provide, maintain, and improve the Website</li><li>Create and manage your account</li><li>Display your runner profile and submitted runs</li><li>Verify and moderate submissions</li><li>Respond to support requests</li><li>Detect and prevent fraud, abuse, or security issues</li><li>Comply with legal obligations</li></ul><p><strong>We do not sell your personal information to third parties. We do not use your data for advertising or profiling.</strong></p></section>
    
    <section id="data-sharing"><h2>{m.privacy_s5_heading()}</h2><h3>5.1 Public Information</h3><p>Your runner profile (display name, bio, social links, avatar, banner, location if provided), submitted runs, and achievements are publicly visible by design. You control what optional information appears on your profile and can edit or remove it at any time.</p><h3>5.2 Service Providers</h3><p>We share data with trusted third parties who help us operate the Website:</p><ul><li><strong>Supabase (Supabase Inc.)</strong> — Database hosting and authentication. <a href="https://supabase.com/privacy" target="_blank" rel="noopener">Privacy Policy</a></li><li><strong>Cloudflare (Cloudflare, Inc.)</strong> — Hosting, CDN, security, and analytics. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Privacy Policy</a></li></ul><p>These providers process data on our behalf under Data Processing Agreements (DPAs) and have their own privacy policies governing how they handle data.</p><h3>5.3 Legal Requirements</h3><p>We may disclose your information if required by law, subpoena, or court order, or if we believe in good faith that disclosure is necessary to protect rights, safety, or property, or to prevent fraud or illegal activity.</p><h3>5.4 Business Transfers</h3><p>If CRC is involved in a merger, acquisition, or sale of assets, your personal data may be transferred as part of that transaction. We would notify you before your data becomes subject to a different privacy policy.</p></section>
    
    <section id="cookies"><h2>{m.privacy_s6_heading()}</h2><p>We use cookies and similar technologies (localStorage) to operate the Website and, with your consent, to understand usage patterns. For details, see our <a href={localizeHref("/legal/cookies/")}>Cookie Policy</a>. You can manage your preferences at any time via <button class="inline-link" onclick={() => showCookieSettings.set(true)}>{m.footer_cookie_settings()}</button> in the footer.</p></section>
    
    <section id="data-retention"><h2>{m.privacy_s7_heading()}</h2><p>We retain your information based on the following schedule:</p><ul><li><strong>Active account data:</strong> Retained for as long as your account is active and needed to provide services.</li><li><strong>After account deletion:</strong> Personal data is deleted or anonymized within 30 days, except where required by law.</li><li><strong>Anonymized run records:</strong> Retained indefinitely to preserve community leaderboard integrity. Anonymized data cannot be traced back to you.</li><li><strong>Support communications:</strong> Retained for up to 2 years after resolution, then deleted.</li><li><strong>Audit and moderation logs:</strong> Retained for 1 year for accountability purposes.</li><li><strong>Backup copies:</strong> Purged within 90 days of the data being deleted from live systems.</li></ul><p>Run submissions may be <strong>anonymized</strong> (rather than deleted) to preserve the integrity of community leaderboards. Anonymized data cannot be traced back to you.</p></section>
    
    <section id="your-rights"><h2>{m.privacy_s8_heading()}</h2><h3>8.1 For All Users</h3><p>Regardless of your location, you have the right to:</p><ul><li><strong>Access:</strong> Request a copy of your personal data</li><li><strong>Correction:</strong> Update inaccurate or incomplete information</li><li><strong>Deletion:</strong> Request deletion of your account and personal data</li><li><strong>Portability:</strong> Receive your data in a commonly used, machine-readable format</li><li><strong>Withdraw consent:</strong> Where processing is based on consent, withdraw it at any time</li></ul><p>Many of these rights can be exercised directly through your <a href={localizeHref("/profile/settings")}>Account Settings</a>, where you can export your data, manage cookie preferences, and delete your account without contacting us.</p><h3>8.2 For EU/EEA/UK Residents (GDPR)</h3><p>You additionally have the right to restrict processing, object to processing based on legitimate interests, and lodge a complaint with your local supervisory authority. We do not make decisions based solely on automated processing that produce legal or similarly significant effects on you.</p><h3>8.3 For California Residents (CCPA/CPRA)</h3><p>You have the right to know what personal information we collect, request deletion, opt out of the sale or sharing of personal information, request correction, and exercise your rights without discriminatory treatment. <strong>We do not sell or share personal information</strong> as defined by the CCPA/CPRA.</p><h3>8.4 Exercising Your Rights</h3><p>Many rights can be exercised directly through your <a href={localizeHref("/profile/settings")}>Account Settings</a>. For requests that cannot be handled through self-service, contact us at <a href="mailto:privacy@challengerun.net">privacy@challengerun.net</a>. We will verify your identity before processing your request and respond within 30 days. If a request is complex, we may extend this by an additional 60 days with prior notice.</p></section>
    
    <section id="children"><h2>{m.privacy_s9_heading()}</h2><p>The Website is not intended for children under <strong>13 years of age</strong> (or under 16 where required by law). We do not knowingly collect personal information from children under these ages. If you believe a child has provided us with personal information, please contact us at <a href="mailto:privacy@challengerun.net">privacy@challengerun.net</a> and we will promptly delete such information.</p></section>
    
    <section id="security"><h2>{m.privacy_s10_heading()}</h2><p>We implement appropriate technical and organizational security measures to protect your personal data, including encryption of data in transit (TLS) and at rest, access controls restricting who can access user data, and regular review of our security practices. However, no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.</p></section>
    
    <section id="data-breach"><h2>{m.privacy_s11_heading()}</h2><p>In the event of a personal data breach that poses a risk to your rights, we will notify the relevant supervisory authority within 72 hours of becoming aware of the breach, and will notify affected users without undue delay. Notifications will describe the nature of the breach, the likely consequences, and the measures taken to address it.</p></section>
    
    <section id="international"><h2>{m.privacy_s12_heading()}</h2><p>CRC is operated from the United States. Your data is processed by our service providers in the United States and other locations.</p><p>For transfers of personal data from the EEA, UK, or Switzerland to countries without an adequacy decision from the European Commission, we rely on Standard Contractual Clauses (SCCs) as adopted by the European Commission, or our service providers' equivalent transfer mechanisms. Our primary service providers (Supabase and Cloudflare) maintain Standard Contractual Clauses and equivalent safeguards for international data transfers.</p><p>By using the Website, you acknowledge that your information may be transferred to countries that may have different data protection laws than your country of residence.</p></section>
    
    <section id="changes"><h2>{m.privacy_s13_heading()}</h2><p>We may update this Privacy Policy from time to time. We will update the "Last updated" date at the top of this page. For significant changes, we will provide a prominent notice on the Website.</p></section>
    
    <section id="contact"><h2>{m.privacy_s14_heading()}</h2><p>If you have questions about this Privacy Policy or wish to exercise your rights, please contact us:</p><ul><li>Email: <a href="mailto:privacy@challengerun.net">privacy@challengerun.net</a></li><li>{m.nav_support()}: <a href={localizeHref("/support/")}>{m.nav_support()}</a></li></ul><p>If you are in the EU/EEA and are not satisfied with our response, you have the right to lodge a complaint with your local supervisory authority.</p></section>
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
.inline-link { background: none; border: none; padding: 0; color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline; }
.inline-link:hover { opacity: 0.8; }
</style>
