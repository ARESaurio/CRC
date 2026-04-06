<script lang="ts">
  import { localizeHref } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.terms_page_title()}</title></svelte:head>

<div class="page-width">
  <div class="legal-page">
    <h2>{m.terms_heading()}</h2>
    <p class="legal-updated">{m.terms_updated()}</p>
    
    <div class="legal-toc card">
      <h2>{m.terms_toc()}</h2>
      <ol>
        <li><a href="#acceptance">{m.terms_toc_acceptance()}</a></li>
        <li><a href="#eligibility">{m.terms_toc_eligibility()}</a></li>
        <li><a href="#accounts">{m.terms_toc_accounts()}</a></li>
        <li><a href="#content">{m.terms_toc_content()}</a></li>
        <li><a href="#conduct">{m.terms_toc_conduct()}</a></li>
        <li><a href="#intellectual-property">{m.terms_toc_ip()}</a></li>
        <li><a href="#third-party">{m.terms_toc_third_party()}</a></li>
        <li><a href="#disclaimers">{m.terms_toc_disclaimers()}</a></li>
        <li><a href="#limitation">{m.terms_toc_limitation()}</a></li>
        <li><a href="#indemnification">{m.terms_toc_indemnification()}</a></li>
        <li><a href="#dispute-resolution">{m.terms_toc_dispute()}</a></li>
        <li><a href="#termination">{m.terms_toc_termination()}</a></li>
        <li><a href="#changes">{m.terms_toc_changes()}</a></li>
        <li><a href="#general">{m.terms_toc_general()}</a></li>
        <li><a href="#contact">{m.terms_toc_contact()}</a></li>
      </ol>
    </div>
    
    <section id="acceptance"><h2>{m.terms_s1_heading()}</h2><p>By accessing or using Challenge Run Community ("CRC", "the Website", "we", "us"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Website.</p><p>These Terms, together with our <a href={localizeHref("/legal/privacy/")}>Privacy Policy</a> and <a href={localizeHref("/legal/cookies/")}>Cookie Policy</a>, constitute the entire agreement between you and CRC regarding your use of the Website. Your use of the Website is also subject to our <a href={localizeHref("/guidelines/")}>Community Guidelines</a>, which may be updated from time to time.</p></section>
    
    <section id="eligibility"><h2>{m.terms_s2_heading()}</h2><p>You must be at least <strong>13 years old</strong> to use this Website, or <strong>16 years old</strong> if you reside in the European Economic Area (unless your country has set a lower age under GDPR Article 8). If under 18 (or the age of majority in your jurisdiction), you must have parental or guardian consent. By using the Website, you represent that you meet these requirements.</p></section>
    
    <section id="accounts"><h2>{m.terms_s3_heading()}</h2><p>To access certain features, you may create an account using Discord or Twitch authentication. You are responsible for maintaining the security of your account and all activities that occur under it. You agree to provide accurate information and not create accounts for deceptive purposes.</p><p>You may delete your account at any time through your <a href={localizeHref("/profile/settings")}>Account Settings</a>. Upon deletion, your personal data will be deleted or anonymized in accordance with our <a href={localizeHref("/legal/privacy/#data-retention")}>Privacy Policy</a>. Run submissions will be anonymized rather than deleted to preserve community leaderboard integrity.</p><p>We may suspend or terminate accounts that violate these Terms or our <a href={localizeHref("/guidelines/")}>Community Guidelines</a>, with or without prior notice depending on the severity of the violation.</p></section>
    
    <section id="content"><h2>{m.terms_s4_heading()}</h2><p>"User Content" includes run submissions, profile information, and any other content you submit. <strong>You retain ownership of your User Content.</strong> By submitting content, you grant CRC a worldwide, non-exclusive, royalty-free license to use, display, reproduce, and distribute it in connection with operating the Website.</p><p>This license exists solely to enable us to operate the Website. We will not use your content for unrelated commercial purposes. This license terminates when you delete your content or account, except for content that has been shared with or relied upon by other users (such as verified run records).</p><p>We reserve the right to review, edit, or remove any User Content at our discretion. Content standards are described in our <a href={localizeHref("/guidelines/")}>Community Guidelines</a>.</p></section>

    <section id="conduct"><h2>{m.terms_s5_heading()}</h2><p>You agree not to use the Website in any way that violates applicable laws, infringes on the rights of others, or interferes with the proper functioning of the Website. This includes but is not limited to unauthorized access attempts, automated scraping without permission, distribution of malware, and harassment of other users. Detailed conduct expectations are described in our <a href={localizeHref("/guidelines/")}>Community Guidelines</a>.</p></section>
    
    <section id="intellectual-property"><h2>{m.terms_s6_heading()}</h2><p>The Website's design, logos, original code, and original written content are owned by CRC or its licensors. Game names, logos, and artwork displayed on the Website are trademarks and copyrighted material of their respective owners and are displayed under fair use for community discussion purposes.</p><p>If you believe content on the Website infringes your copyright, please contact us at <a href="mailto:legal@challengerun.net">legal@challengerun.net</a> with a description of the copyrighted work, the location of the infringing material, and your contact information. We will respond to valid complaints in accordance with applicable law.</p></section>
    
    <section id="third-party"><h2>{m.terms_s7_heading()}</h2><p>The Website uses and may link to or embed content from third-party services including Supabase, Cloudflare, YouTube, Twitch, and Discord. These services are governed by their own terms and privacy policies. CRC is not responsible for the content, practices, or availability of third-party services.</p></section>
    
    <section id="disclaimers"><h2>{m.terms_s8_heading()}</h2><p>THE WEBSITE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p><p>CRC is a community project operated on a volunteer basis. We do not warrant that the Website will be uninterrupted, error-free, or secure, that defects will be corrected, or that any information on the Website is complete or accurate.</p></section>
    
    <section id="limitation"><h2>{m.terms_s9_heading()}</h2><p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CRC AND ITS OPERATORS, CONTRIBUTORS, AND MODERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE WEBSITE, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, CONTENT, SUBMISSIONS, REPUTATION, OR GOODWILL.</p><p>Our total aggregate liability for any claims arising from or relating to these Terms or the Website shall not exceed <strong>$100 USD</strong> or the amount you have paid to CRC (if any) in the 12 months preceding the claim, whichever is greater.</p><p>Some jurisdictions do not allow the exclusion or limitation of certain damages. In such jurisdictions, our liability is limited to the greatest extent permitted by law.</p></section>
    
    <section id="indemnification"><h2>{m.terms_s10_heading()}</h2><p>You agree to indemnify, defend, and hold harmless CRC and its operators, contributors, and moderators from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of your use of the Website, your violation of these Terms, your User Content, or your violation of any rights of another person or entity.</p></section>
    
    <section id="dispute-resolution"><h2>{m.terms_s11_heading()}</h2><p>Before filing any formal claim, you agree to first attempt to resolve the dispute informally by contacting us at <a href="mailto:legal@challengerun.net">legal@challengerun.net</a>.</p><p>These Terms shall be governed by and construed in accordance with the laws of the <strong>State of Tennessee, United States</strong>, without regard to its conflict of law provisions. Any legal action or proceeding shall be brought exclusively in the state or federal courts located in <strong>Montgomery County, Tennessee</strong>.</p><p>To the extent permitted by applicable law, any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.</p><p>If you are a resident of the European Union, nothing in this section limits your rights under applicable EU law, including your right to bring proceedings in the courts of your country of residence.</p></section>
    
    <section id="termination"><h2>{m.terms_s12_heading()}</h2><p>You may stop using the Website and delete your account at any time. We may suspend or terminate your access for violation of these Terms, fraudulent or illegal activity, behavior that harms other users, or at our discretion if we cease operating the Website.</p><p>Upon termination, your right to use the Website ceases immediately. Your personal data will be handled in accordance with our <a href={localizeHref("/legal/privacy/#data-retention")}>Privacy Policy</a>. Provisions that should survive termination (including disclaimers, limitation of liability, indemnification, and dispute resolution) will remain in effect.</p></section>
    
    <section id="changes"><h2>{m.terms_s13_heading()}</h2><p>We reserve the right to modify these Terms at any time. Changes take effect when posted to the Website and we will update the "Last updated" date at the top of this page. For material changes, we will provide at least 30 days' notice via a prominent notice on the Website before they take effect. Your continued use of the Website after changes take effect constitutes acceptance.</p></section>
    
    <section id="general"><h2>{m.terms_s14_heading()}</h2><p>If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will continue in full force and effect. Our failure to enforce any right or provision shall not be considered a waiver. You may not assign or transfer your rights under these Terms without our prior written consent. CRC shall not be liable for any failure or delay in performance resulting from circumstances beyond our reasonable control.</p></section>
    
    <section id="contact"><h2>{m.terms_s15_heading()}</h2><p>If you have questions about these Terms, please contact us:</p><ul><li>Email: <a href="mailto:legal@challengerun.net">legal@challengerun.net</a></li><li>{m.nav_support()}: <a href={localizeHref("/support/")}>{m.nav_support()}</a></li></ul></section>
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
.legal-page ul { margin: 0.75rem 0; padding-left: 1.5rem; }
.legal-page li { margin: 0.5rem 0; }
</style>
