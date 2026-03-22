// ═══════════════════════════════════════════════════════════════════════════════
// Turnstile CAPTCHA Verification
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

export async function verifyTurnstile(token: string | undefined, env: Env, ip: string | null): Promise<boolean> {
  // SECURITY (Item 6): Fail closed — if secret missing, reject
  if (!env.TURNSTILE_SECRET) {
    console.error('TURNSTILE_SECRET not configured — rejecting request');
    return false;
  }
  if (!token) return false;

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: ip || '',
    }),
  });
  const data = await res.json() as { success: boolean };
  return data.success === true;
}
