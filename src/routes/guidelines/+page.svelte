<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.guidelines_page_title()}</title></svelte:head>


<div class="page-width">
  <div class="legal-page">
    <h1>{m.guidelines_heading()}</h1>
    <p class="legal-updated">{m.guidelines_updated()}</p>
    <p>
      {@html m.guidelines_intro({ link_start: `<a href="${localizeHref('/legal/terms/')}">`, link_end: '</a>' })}
    </p>
    
    <div class="legal-toc card">
      <h2>{m.guidelines_toc()}</h2>
      <ol>
        <li><a href="#conduct">{m.guidelines_toc_conduct()}</a></li>
        <li><a href="#content-guidelines">{m.guidelines_toc_content()}</a></li>
        <li><a href="#submissions">{m.guidelines_toc_submissions()}</a></li>
        <li><a href="#cheating">{m.guidelines_toc_cheating()}</a></li>
        <li><a href="#verification">{m.guidelines_toc_verification()}</a></li>
        <li><a href="#moderation">{m.guidelines_toc_moderation()}</a></li>
        <li><a href="#data-protection">{m.guidelines_toc_data()}</a></li>
        <li><a href="#appeals">{m.guidelines_toc_appeals()}</a></li>
        <li><a href="#enforcement">{m.guidelines_toc_enforcement()}</a></li>
      </ol>
    </div>
    
    <section id="conduct">
      <h2>{m.guidelines_conduct_heading()}</h2>
      <p>{m.guidelines_conduct_intro()}</p>
      <ul>
        <li>{m.guidelines_conduct_harassment()}</li>
        <li>{m.guidelines_conduct_hate()}</li>
        <li>{m.guidelines_conduct_doxxing()}</li>
        <li>{m.guidelines_conduct_impersonation()}</li>
        <li>{m.guidelines_conduct_spam()}</li>
        <li>{m.guidelines_conduct_explicit()}</li>
        <li>{m.guidelines_conduct_illegal()}</li>
      </ul>
      <p>{m.guidelines_conduct_laws()}</p>
    </section>
    
    <section id="content-guidelines">
      <h2>{m.guidelines_content_heading()}</h2>
      <p>{m.guidelines_content_intro()}</p>
      <ul>
        <li>{m.guidelines_content_laws()}</li>
        <li>{m.guidelines_content_malware()}</li>
        <li>{m.guidelines_content_offensive()}</li>
      </ul>
      <p>{m.guidelines_content_reserve()}</p>
    </section>
    
    <section id="submissions">
      <h2>{m.guidelines_submissions_heading()}</h2>
      <p>{m.guidelines_submissions_intro()}</p>
      <ul>
        <li>{m.guidelines_submissions_accurate()}</li>
        <li>{m.guidelines_submissions_video()}</li>
        <li>{m.guidelines_submissions_compliance()}</li>
      </ul>
      <p>{m.guidelines_submissions_responsibility()}</p>
    </section>
    
    <section id="cheating">
      <h2>{m.guidelines_cheating_heading()}</h2>
      <p>{m.guidelines_cheating_intro()}</p>
      <ul>
        <li>{m.guidelines_cheating_fraudulent()}</li>
        <li>{m.guidelines_cheating_splicing()}</li>
        <li>{m.guidelines_cheating_tools()}</li>
        <li>{m.guidelines_cheating_misrepresent()}</li>
      </ul>
      <p>{m.guidelines_cheating_detection()}</p>
    </section>
    
    <section id="verification">
      <h2>{m.guidelines_verification_heading()}</h2>
      <p>{m.guidelines_verification_p1()}</p>
      <p>{m.guidelines_verification_p2()}</p>
    </section>
    
    <section id="moderation">
      <h2>{m.guidelines_moderation_heading()}</h2>
      <p>{m.guidelines_moderation_intro()}</p>
      <ul>
        <li>{m.guidelines_moderation_impartial()}</li>
        <li>{m.guidelines_moderation_standards()}</li>
        <li>{m.guidelines_moderation_no_abuse()}</li>
        <li>{m.guidelines_moderation_privacy()}</li>
      </ul>
      <p>{@html m.guidelines_moderation_removal({ link_start: `<a href="${localizeHref('/support/')}">`, link_end: '</a>' })}</p>
    </section>
    
    <section id="data-protection">
      <h2>{m.guidelines_data_heading()}</h2>
      <p>{m.guidelines_data_intro()}</p>
      <ul>
        <li>{m.guidelines_data_no_share()}</li>
        <li>{m.guidelines_data_mod_access()}</li>
        <li>{m.guidelines_data_no_identify()}</li>
        <li>{@html m.guidelines_data_vulnerability({ email_start: '<a href="mailto:privacy@challengerun.net">', email_end: '</a>' })}</li>
      </ul>
      <p>{@html m.guidelines_data_manage({ link_start: `<a href="${localizeHref('/profile/settings')}">`, link_end: '</a>', link_start2: `<a href="${localizeHref('/legal/privacy/')}">`, link_end2: '</a>' })}</p>
    </section>
    
    <section id="appeals">
      <h2>{m.guidelines_appeals_heading()}</h2>
      <p>{@html m.guidelines_appeals_p1({ link_start: `<a href="${localizeHref('/support/')}">`, link_end: '</a>' })}</p>
    </section>
    
    <section id="enforcement">
      <h2>{m.guidelines_enforcement_heading()}</h2>
      <p>{m.guidelines_enforcement_intro()}</p>
      <ul>
        <li>{m.guidelines_enforcement_removal()}</li>
        <li>{m.guidelines_enforcement_warning()}</li>
        <li>{m.guidelines_enforcement_suspension()}</li>
        <li>{m.guidelines_enforcement_ban()}</li>
      </ul>
      <p>{m.guidelines_enforcement_severe()}</p>
    </section>
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
