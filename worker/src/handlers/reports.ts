// ═══════════════════════════════════════════════════════════════════════════════
// Report Handler — User-Submitted Reports
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';
import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput } from '../lib/utils.js';
import { supabaseQuery } from '../lib/supabase.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { authenticateUser } from '../lib/auth.js';
import { sendDiscordNotification } from '../lib/discord.js';

export async function handleReport(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // Authenticate — reports require sign-in
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // Validate Turnstile
  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstile_token as string | undefined, env, ip);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Captcha verification failed' }, 403, env, request);
  }

  // Validate required fields
  const reportType = sanitizeInput(body.report_type, 50);
  const reason = sanitizeInput(body.reason, 100);
  const details = sanitizeInput(body.details, 2000);

  if (!reportType || !reason) {
    return jsonResponse({ error: 'Report type and reason are required' }, 400, env, request);
  }

  const allowedTypes = ['run', 'game', 'profile', 'other'];
  if (!allowedTypes.includes(reportType)) {
    return jsonResponse({ error: 'Invalid report type' }, 400, env, request);
  }

  // Look up reporter's runner_id (best-effort)
  let reporterRunnerId: string | null = null;
  try {
    const profileResult = await supabaseQuery(env,
      `profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=runner_id`,
      { method: 'GET' });
    if (profileResult.ok && Array.isArray(profileResult.data) && profileResult.data.length > 0) {
      reporterRunnerId = (profileResult.data[0] as Record<string, unknown>).runner_id as string;
    }
  } catch { /* silent */ }

  const now = new Date().toISOString();

  const row = {
    report_type: reportType,
    reason,
    description: details || '',
    reported_item_id: body.content_id ? sanitizeInput(body.content_id, 200) : null,
    reported_user_id: body.reported_user_id ? sanitizeInput(body.reported_user_id, 200) : null,
    reported_by: auth.user.id,
    reporter_runner_id: reporterRunnerId,
    reported_at: now,
    status: 'pending',
    priority: 'normal',
    evidence_urls: Array.isArray(body.evidence_urls)
      ? (body.evidence_urls as unknown[]).slice(0, 5).map(u => sanitizeInput(u, 500)).filter(Boolean)
      : null,
    page_url: body.page_url ? sanitizeInput(body.page_url, 500) : null,
  };

  const result = await supabaseQuery(env, 'user_reports', {
    method: 'POST',
    body: row,
  });

  if (!result.ok) {
    console.error('Failed to insert report:', result.data);
    return jsonResponse({ error: 'Failed to submit report' }, 500, env, request);
  }

  // Discord notification
  await sendDiscordNotification(env, 'games', {
    title: '🚨 New Report Submitted',
    color: 0xef4444,
    fields: [
      { name: 'Type', value: reportType, inline: true },
      { name: 'Reason', value: reason, inline: true },
      ...(reporterRunnerId ? [{ name: 'Reporter', value: reporterRunnerId, inline: true }] : []),
      ...(details ? [{ name: 'Details', value: details.slice(0, 200), inline: false }] : []),
      { name: 'Review', value: `[Open Reports](https://www.challengerun.net/admin/reports)`, inline: false },
    ],
    timestamp: now,
  });

  return jsonResponse({ ok: true, message: 'Report submitted. Our team will review it.' }, 200, env, request);
}
