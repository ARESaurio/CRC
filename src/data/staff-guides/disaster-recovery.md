# CRC Disaster Recovery Plan

**Last updated:** March 7, 2026
**Owner:** Gary Asher (site admin)
**Contact:** privacy@challengerun.net / legal@challengerun.net

---

## 1. Infrastructure Overview

CRC runs on three services. Understanding what lives where is critical during an incident.

| Service | What it hosts | Dashboard |
|-|-|-|
| Cloudflare Pages | Static site (SvelteKit SSR), DNS, CDN, security headers, email routing | dash.cloudflare.com |
| Supabase | PostgreSQL database, auth (Discord/Twitch OAuth), storage | supabase.com/dashboard |
| Cloudflare Worker | Run submissions, admin actions, data export, account deletion | dash.cloudflare.com → Workers |

**Domain:** challengerun.net (registered and managed via Cloudflare)

---

## 2. Data Backup Strategy

### What Supabase backs up automatically

Supabase provides daily automated backups on the Pro plan and above. Check your current plan in the Supabase dashboard under Settings → Billing.

- **Free plan:** No automated backups. Point-in-time recovery not available.
- **Pro plan:** Daily backups, 7-day retention. Point-in-time recovery available.

### What you should back up manually

Even with Supabase backups, keep your own copies of critical data:

- **Database export:** Run a manual export from Supabase dashboard (Settings → Database → Backups) at least monthly. Download and store the SQL dump somewhere safe (e.g. encrypted local drive or private cloud storage).
- **Game data JSON files:** The `src/data/` directory in the repo contains game definitions. These are already version-controlled in Git.
- **Environment secrets:** Keep a secure, offline record of all secrets (Supabase URL, service key, Turnstile secret, Worker API keys, Discord/Twitch OAuth credentials). If you lose these, you lose the ability to redeploy.
- **DNS records:** Screenshot or export your Cloudflare DNS settings periodically. If the domain is ever moved, you'll need these.

### Backup retention

- Supabase automated backups: per your plan (7 days on Pro)
- Manual database exports: keep at least 3 monthly snapshots
- Git history: indefinite (GitHub retains full history)

---

## 3. Incident Response — Data Breach

This procedure follows GDPR Article 33 (72-hour notification) and Article 34 (user notification).

### Step 1: Detect and contain (first 1 hour)

1. Identify the nature of the breach (unauthorized access, data leak, compromised credentials, etc.)
2. Contain the breach immediately:
   - If credentials are compromised: rotate the affected secrets (see Section 5)
   - If a user account is compromised: suspend the account
   - If the Worker is compromised: disable the Worker route in Cloudflare
   - If the database is exposed: enable Supabase's network restrictions (Settings → Database → Network)
3. Document what you know: what happened, when, what data is affected, how many users

### Step 2: Assess severity (within 4 hours)

Determine what personal data was affected:

- **High severity:** Auth credentials, email addresses, OAuth tokens, linked account data
- **Medium severity:** Profile data (display names, bios, social links), run submissions
- **Low severity:** Publicly visible data only (profiles that are already public)

If the breach poses a risk to users' rights and freedoms (high or medium severity), proceed to Step 3. If only public data was accessed, document it but notification may not be required.

### Step 3: Notify authorities (within 72 hours)

If the breach affects EU/EEA residents and poses a risk to their rights:

1. Identify the relevant supervisory authority. If you don't know which country the affected users are in, the Irish Data Protection Commission (DPC) is a reasonable default since many tech companies use Ireland as their lead authority. Contact: https://www.dataprotection.ie/
2. File a notification including:
   - Nature of the breach
   - Categories and approximate number of affected users
   - Likely consequences
   - Measures taken to address it
   - Contact point (privacy@challengerun.net)

**Template notification email is in Section 7 below.**

### Step 4: Notify affected users (without undue delay)

If the breach is likely to result in a high risk to users:

1. Email affected users directly if you have their email addresses
2. Post a prominent notice on the Website
3. Include: what happened, what data was involved, what you've done about it, what they should do (e.g. revoke Discord/Twitch OAuth if relevant)

**Template user notification is in Section 7 below.**

### Step 5: Post-incident review (within 1 week)

1. Write a root cause analysis: what went wrong, how, why
2. Document the timeline of the incident
3. Identify preventive measures
4. Implement fixes
5. Update this disaster recovery plan if needed

---

## 4. Service Recovery

### Cloudflare Pages (site is down)

The site auto-deploys from the GitHub repo. Recovery:

1. Check Cloudflare status at https://www.cloudflarestatus.com/
2. If it's a Cloudflare outage: wait for resolution, nothing you can do
3. If a bad deploy broke the site: roll back in Cloudflare dashboard → Pages → Deployments → click a previous working deployment → "Rollback to this deployment"
4. If the Git repo is intact, you can always redeploy by pushing any commit

### Supabase (database is down or corrupted)

1. Check Supabase status at https://status.supabase.com/
2. If it's a Supabase outage: wait for resolution
3. If data is corrupted or lost:
   - Go to Supabase dashboard → Settings → Database → Backups
   - Restore from the most recent clean backup
   - If automated backups are unavailable, restore from your manual SQL dump
4. After restore, verify data integrity: check row counts on key tables (profiles, runs, games)

### Cloudflare Worker (submissions/admin actions broken)

1. The Worker source is in `worker/src/index.js` in the repo
2. Redeploy: `cd worker && npx wrangler deploy`
3. If secrets were lost: re-add them via `npx wrangler secret put SECRET_NAME`
4. Required secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, TURNSTILE_SECRET, ALLOWED_ORIGIN

### DNS / Domain (domain is unreachable)

1. Log into Cloudflare dashboard → DNS → verify records are intact
2. Critical records: A/CNAME for root domain pointing to Cloudflare Pages, MX records for email routing
3. If domain registration expired: renew immediately in Cloudflare Registrar
4. Keep domain auto-renew enabled at all times

---

## 5. Secret Rotation Procedures

### Rotate Supabase service key

1. Supabase dashboard → Settings → API → Service Role Key
2. Click "Generate new key"
3. Update the Worker secret: `npx wrangler secret put SUPABASE_SERVICE_KEY`
4. Paste the new key when prompted
5. The old key is immediately invalidated

### Rotate Turnstile secret

1. Cloudflare dashboard → Turnstile → your site widget → Settings
2. Regenerate the secret key
3. Update the Worker: `npx wrangler secret put TURNSTILE_SECRET`

### Invalidate all user sessions

If you suspect widespread account compromise:

```sql
-- Run in Supabase SQL Editor
-- This invalidates all refresh tokens, forcing everyone to re-authenticate
DELETE FROM auth.refresh_tokens;
```

Users will need to sign in again on their next visit.

### Revoke OAuth app tokens

- **Discord:** Go to https://discord.com/developers/applications → your CRC app → OAuth2 → regenerate client secret. Update Supabase auth provider settings with the new secret.
- **Twitch:** Go to https://dev.twitch.tv/console → your CRC app → regenerate client secret. Update Supabase auth provider settings.

After rotating OAuth secrets, update them in Supabase dashboard → Authentication → Providers → Discord/Twitch.

---

## 6. Communication Plan

### During an outage (site down, no data breach)

Post updates on your primary communication channel (Discord server, social media, etc.):

> CRC is currently experiencing issues with [describe]. We're working on it and will update when resolved. Your data is not affected.

### During a data breach

Use the templates in Section 7. Communicate via:

1. Direct email to affected users (if you have their addresses)
2. Prominent banner on the website once it's back up
3. Announcement in Discord server / social media

### After resolution

> The issue affecting CRC has been resolved as of [time]. [Brief description of what happened and what was done]. If you have questions, contact privacy@challengerun.net.

---

## 7. Notification Templates

### Template: Supervisory Authority Notification

```
Subject: Personal Data Breach Notification — Challenge Run Community

To: [Supervisory Authority]
From: privacy@challengerun.net
Date: [Date]

1. Nature of the breach:
[Describe what happened — e.g. "Unauthorized access to the database
was detected on [date] at approximately [time] UTC."]

2. Categories of data affected:
[e.g. "Email addresses, display names, and OAuth provider usernames
for approximately [N] registered users."]

3. Approximate number of affected users: [N]

4. Likely consequences:
[e.g. "Potential exposure of email addresses. No passwords are stored
by CRC — authentication is handled via OAuth (Discord/Twitch)."]

5. Measures taken:
[e.g. "Database credentials were rotated immediately. All active
sessions were invalidated. The vulnerability was patched."]

6. Contact point:
Gary Asher
privacy@challengerun.net
Challenge Run Community (challengerun.net)
```

### Template: User Notification

```
Subject: Important Security Notice — Challenge Run Community

Hi [name / "CRC user"],

We're writing to let you know about a security incident that may
have affected your CRC account.

WHAT HAPPENED
[Brief, plain-language description — e.g. "On [date], we discovered
that an unauthorized party accessed a portion of our database."]

WHAT INFORMATION WAS INVOLVED
[e.g. "Your email address and display name. No passwords were
exposed — CRC uses Discord/Twitch sign-in and does not store
passwords."]

WHAT WE'VE DONE
[e.g. "We immediately secured the database, rotated all credentials,
and invalidated all active sessions. We've also notified the
relevant data protection authority."]

WHAT YOU SHOULD DO
- Sign in again to CRC (your session was reset as a precaution)
- If you'd like, review your connected apps in Discord/Twitch
  settings and revoke CRC's access, then re-link
- Be cautious of phishing emails referencing CRC

We take your privacy seriously and sincerely apologize for this
incident. If you have questions, contact us at
privacy@challengerun.net.

— CRC Team
```

---

## 8. Review Schedule

This document should be reviewed and updated:

- After any security incident
- When infrastructure changes (new services, new secrets, plan upgrades)
- At least once every 6 months

| Last reviewed | Reviewed by | Notes |
|-|-|-|
| March 7, 2026 | Gary Asher | Initial version |
