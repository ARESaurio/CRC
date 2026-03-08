// ═══════════════════════════════════════════════════════════════════════════════
// RUN HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput, sanitizeArray, isValidId, isValidSlug, isValidVideoUrl, generateSubmissionId } from '../lib/utils.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { supabaseQuery, writeGameHistory } from '../lib/supabase.js';
import { authenticateAdmin, authenticateUser } from '../lib/auth.js';
import { sendDiscordNotification, SITE_URL } from '../lib/discord.js';

// Returns true if a claim is still within its 2-week enforcement window
function isClaimActive(claimedAt) {
  if (!claimedAt) return false;
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  return (Date.now() - new Date(claimedAt).getTime()) < TWO_WEEKS_MS;
}

export async function handleRunSubmission(body, env, request) {
  // ── 1. Authenticate user ──────────────────────────────────────────────────
  const auth = await authenticateUser(env, body, request);
  if (auth.error) {
    return jsonResponse({ error: auth.error }, auth.status, env, request);
  }

  // ── 2. Look up runner profile (don't trust client-sent runner_id) ─────────
  const profileResult = await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=runner_id,status`,
    { method: 'GET' });

  if (!profileResult.ok || !Array.isArray(profileResult.data) || !profileResult.data.length) {
    return jsonResponse({ error: 'You need a runner profile to submit runs.' }, 403, env, request);
  }
  const profile = profileResult.data[0];
  if (!profile.runner_id) {
    return jsonResponse({ error: 'Your profile is missing a runner ID. Please complete your profile first.' }, 403, env, request);
  }
  if (profile.status !== 'approved') {
    return jsonResponse({ error: 'Your profile is pending approval. Submissions are locked until an admin approves your profile.' }, 403, env, request);
  }

  // ── 3. Validate required fields ───────────────────────────────────────────
  // Accept both "category" (correct DB column) and "category_slug" (legacy)
  const category = body.category || body.category_slug;
  if (!body.game_id) {
    return jsonResponse({ error: 'Missing required field: game_id' }, 400, env, request);
  }
  if (!category) {
    return jsonResponse({ error: 'Missing required field: category' }, 400, env, request);
  }
  if (!body.video_url) {
    return jsonResponse({ error: 'Missing required field: video_url' }, 400, env, request);
  }

  // ── 4. Server-side input validation ───────────────────────────────────────
  if (!isValidSlug(body.game_id, 1, 100)) {
    return jsonResponse({ error: 'Invalid game_id format' }, 400, env, request);
  }
  if (!isValidSlug(category, 1, 100)) {
    return jsonResponse({ error: 'Invalid category format' }, 400, env, request);
  }
  if (!isValidVideoUrl(body.video_url)) {
    return jsonResponse({ error: 'Invalid video URL. Must be YouTube, Twitch, or Bilibili.' }, 400, env, request);
  }

  // ── 5. Verify Turnstile CAPTCHA ───────────────────────────────────────────
  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstile_token, env, ip);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Captcha verification failed. Please try again.' }, 403, env, request);
  }

  // ── 6. Build DB row (correct column names, sanitized) ─────────────────────
  const submissionId = generateSubmissionId();
  const row = {
    game_id:              sanitizeInput(body.game_id, 100),
    runner_id:            sanitizeInput(profile.runner_id, 50),  // from DB, not client
    submitted_by:         auth.user.id,                          // from verified JWT
    category:             sanitizeInput(category, 100),
    category_tier:        sanitizeInput(body.category_tier || 'full_runs', 50),
    standard_challenges:  sanitizeArray(body.standard_challenges),
    community_challenge:  body.community_challenge ? sanitizeInput(body.community_challenge, 200) : null,
    character:            body.character ? sanitizeInput(body.character, 100) : null,
    difficulty:           body.difficulty ? sanitizeInput(body.difficulty, 100) : null,
    glitch_id:            body.glitch_id ? sanitizeInput(body.glitch_id, 50) : null,
    restrictions:         sanitizeArray(body.restrictions),
    platform:             body.platform ? sanitizeInput(body.platform, 50) : null,
    video_url:            sanitizeInput(body.video_url, 500),
    run_date:             body.run_date ? sanitizeInput(body.run_date, 10) : null,
    time_rta:             body.time_rta ? sanitizeInput(body.time_rta, 20) : null,
    time_primary:         body.time_primary ? sanitizeInput(body.time_primary, 20) : null,
    submitter_notes:      body.submitter_notes ? sanitizeInput(body.submitter_notes, 500) : null,
    additional_runners:   Array.isArray(body.additional_runners)
                            ? sanitizeArray(body.additional_runners, 10, 60)
                            : null,
    status:               'pending',
    schema_version:       body.schema_version || 7,
    submission_id:        submissionId,
    submitted_at:         new Date().toISOString(),
  };

  // ── 7. Insert into pending_runs ───────────────────────────────────────────
  const result = await supabaseQuery(env, 'pending_runs', {
    method: 'POST',
    body: row,
  });

  if (!result.ok) {
    console.error('Supabase insert error:', result.data);
    return jsonResponse({ error: 'Failed to save submission' }, 500, env, request);
  }

  // ── 8. Discord notification ───────────────────────────────────────────────
  await sendDiscordNotification(env, 'runs', {
    title: '📥 New Run Submitted',
    url: `${SITE_URL}/admin/runs`,
    color: 0xf0ad4e,
    fields: [
      { name: 'Game', value: body.game_id, inline: true },
      { name: 'Runner', value: profile.runner_id, inline: true },
      { name: 'Category', value: category, inline: true },
      { name: 'Review', value: `[Open Admin Panel](${SITE_URL}/admin/runs)`, inline: false },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({
    ok: true,
    submission_id: submissionId,
    message: 'Run submitted successfully',
  }, 200, env, request);
}

export async function handleApproveRun(body, env, request) {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const runId = body.run_id;
  if (!runId) return jsonResponse({ error: 'Missing run_id' }, 400, env, request);

  // SECURITY (Item 11): Validate ID format
  if (!isValidId(runId)) {
    return jsonResponse({ error: 'Invalid run_id format' }, 400, env, request);
  }

  // Fetch the pending run by public_id (UUID) — never expose sequential IDs
  const runResult = await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}&select=*`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }
  const run = runResult.data[0];

  // Check verifier permissions
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(run.game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
  }

  // Claim enforcement: active claims block all non-claimers except super-admins
  if (run.claimed_by && run.claimed_by !== auth.user.id && !auth.role.superAdmin && isClaimActive(run.claimed_at)) {
    return jsonResponse({ error: 'This run is claimed by another verifier.' }, 403, env, request);
  }

  const now = new Date().toISOString();

  // Parse video host and ID from URL
  let video_host = run.video_host || null;
  let video_id = run.video_id || null;
  if (run.video_url && !video_host) {
    try {
      const url = new URL(run.video_url);
      if (url.hostname.includes('youtube') || url.hostname.includes('youtu.be')) {
        video_host = 'youtube';
        video_id = url.hostname.includes('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v');
      } else if (url.hostname.includes('twitch')) {
        video_host = 'twitch';
        video_id = url.pathname.split('/').pop();
      } else if (url.hostname.includes('bilibili')) {
        video_host = 'bilibili';
        video_id = url.pathname.split('/').pop();
      }
    } catch { /* ignore parse errors */ }
  }

  // Insert into the live `runs` table
  const runsInsert = await supabaseQuery(env, 'runs', {
    method: 'POST',
    body: {
      game_id: run.game_id,
      runner_id: run.runner_id,
      category_tier: run.category_tier || 'full_runs',
      category_slug: run.category || null,            // pending_runs uses "category", not "category_slug"
      category: run.category || null,
      standard_challenges: run.standard_challenges || [],
      community_challenge: run.community_challenge || null,
      character: run.character || null,
      difficulty: run.difficulty || null,
      glitch_id: run.glitch_id || null,
      restrictions: run.restrictions || [],
      platform: run.platform || null,
      runner: run.runner_id,
      video_url: run.video_url,
      video_host,
      video_id,
      time_primary: run.time_primary || run.time_rta || null,
      time_rta: run.time_rta || null,
      timing_method_primary: run.timing_method_primary || null,
      date_completed: run.run_date || null,            // pending_runs uses "run_date", not "date_completed"
      run_time: run.time_primary || run.time_rta || null,
      additional_runners: run.additional_runners || null,
      submission_id: run.submission_id,
      submitted_at: run.submitted_at,
      date_submitted: run.run_date || null,            // pending_runs uses "run_date"
      source: run.source || 'site_form',
      runner_notes: run.submitter_notes || null,       // pending_runs uses "submitter_notes"
      status: 'approved',
      verified: false,                                   // Published only — verification is a separate step by game moderators
      verified_by: null,
      verified_at: null,
      verifier_notes: body.notes || null,
    },
  });

  if (!runsInsert.ok) {
    console.error('Failed to insert approved run:', runsInsert.data);
    return jsonResponse({ error: 'Failed to approve run. Please try again.' }, 500, env, request);
  }

  // Update pending_runs status to 'approved' (published, not verified)
  await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        status: 'approved',
        reviewed_by: auth.user.id,
        reviewed_at: now,
        verifier_notes: body.notes || null,
      },
    });

  // Discord notification
  await sendDiscordNotification(env, 'runs', {
    title: '📋 Run Published',
    url: `${SITE_URL}/games/${run.game_id}/runs`,
    color: 0x28a745,
    fields: [
      { name: 'Game', value: run.game_id, inline: true },
      { name: 'Runner', value: run.runner_id, inline: true },
      { name: 'Category', value: run.category || '—', inline: true },
      { name: 'Video', value: run.video_url || '—', inline: false },
      { name: 'Status', value: 'Published (unverified)', inline: true },
      { name: 'View', value: `[Game Runs](${SITE_URL}/games/${run.game_id}/runs) · [Runner](${SITE_URL}/runners/${run.runner_id})`, inline: false },
    ],
    timestamp: now,
  });

  await writeGameHistory(env, {
    game_id: run.game_id,
    action: 'run_approved',
    target: run.runner_id || null,
    note: run.category || null,
    actor_id: auth.user.id,
  });

  return jsonResponse({
    ok: true,
    message: 'Run published — visible on site. Awaiting game moderator verification.',
  }, 200, env, request);
}

export async function handleRejectRun(body, env, request) {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const runId = body.run_id;
  if (!runId) return jsonResponse({ error: 'Missing run_id' }, 400, env, request);
  if (!isValidId(runId)) return jsonResponse({ error: 'Invalid run_id format' }, 400, env, request);

  // Fetch run to check game-level permissions and claim
  const runResult = await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}&select=game_id,claimed_by,claimed_at`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }
  const rejRun = runResult.data[0];

  // Check verifier permissions
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(rejRun.game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
  }

  // Claim enforcement
  if (rejRun.claimed_by && rejRun.claimed_by !== auth.user.id && !auth.role.superAdmin && isClaimActive(rejRun.claimed_at)) {
    return jsonResponse({ error: 'This run is claimed by another verifier.' }, 403, env, request);
  }

  const reason = body.reason || 'No reason provided';
  const notes = body.notes || null;
  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        status: 'rejected',
        rejection_reason: reason,
        verified_by: auth.user.id,
        verified_at: now,
        verifier_notes: notes,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to reject run' }, 500, env, request);

  await sendDiscordNotification(env, 'runs', {
    title: '❌ Run Rejected',
    url: `${SITE_URL}/admin/runs`,
    color: 0xdc3545,
    fields: [
      { name: 'Run ID', value: runId, inline: true },
      { name: 'Game', value: rejRun.game_id || '—', inline: true },
      { name: 'Reason', value: reason, inline: false },
      ...(notes ? [{ name: 'Notes', value: notes, inline: false }] : []),
    ],
    timestamp: now,
  });

  await writeGameHistory(env, {
    game_id: rejRun.game_id,
    action: 'run_rejected',
    target: runId,
    note: reason,
    actor_id: auth.user.id,
  });

  return jsonResponse({ ok: true, message: 'Run rejected.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /request-changes (request changes on a run)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleRequestRunChanges(body, env, request) {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const runId = body.run_id;
  if (!runId) return jsonResponse({ error: 'Missing run_id' }, 400, env, request);
  if (!isValidId(runId)) return jsonResponse({ error: 'Invalid run_id format' }, 400, env, request);

  const notes = body.notes;
  if (!notes) return jsonResponse({ error: 'Notes are required' }, 400, env, request);

  // Fetch run to check game-level permissions and claim
  const runResult = await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}&select=game_id,claimed_by,claimed_at`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }
  const chgRun = runResult.data[0];

  // Check verifier permissions
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(chgRun.game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
  }

  // Claim enforcement
  if (chgRun.claimed_by && chgRun.claimed_by !== auth.user.id && !auth.role.superAdmin && isClaimActive(chgRun.claimed_at)) {
    return jsonResponse({ error: 'This run is claimed by another verifier.' }, 403, env, request);
  }

  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        status: 'needs_changes',
        verified_by: auth.user.id,
        verified_at: now,
        verifier_notes: notes,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to update run' }, 500, env, request);

  await sendDiscordNotification(env, 'runs', {
    title: '✏️ Run Changes Requested',
    color: 0x17a2b8,
    fields: [
      { name: 'Run ID', value: runId, inline: true },
      { name: 'Notes', value: notes, inline: false },
    ],
    timestamp: now,
  });

  await writeGameHistory(env, {
    game_id: chgRun.game_id,
    action: 'run_changes_requested',
    target: runId,
    note: notes,
    actor_id: auth.user.id,
  });

  return jsonResponse({ ok: true, message: 'Changes requested.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /edit-approved-run (Edit a run in the live `runs` table)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleEditApprovedRun(body, env, request) {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const runId = body.run_id;
  if (!runId) return jsonResponse({ error: 'Missing run_id' }, 400, env, request);
  if (!isValidId(runId)) return jsonResponse({ error: 'Invalid run_id format' }, 400, env, request);

  const edits = body.edits;
  if (!edits || typeof edits !== 'object' || Object.keys(edits).length === 0) {
    return jsonResponse({ error: 'No edits provided' }, 400, env, request);
  }

  // Fetch the approved run to verify it exists + check game permissions
  const runResult = await supabaseQuery(env,
    `runs?public_id=eq.${encodeURIComponent(runId)}&select=*`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }
  const run = runResult.data[0];

  // Check verifier permissions (verifiers can only edit runs for their assigned games)
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(run.game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
  }

  // Whitelist of allowed fields to edit on approved runs
  const ALLOWED_FIELDS = [
    'category_tier', 'category_slug', 'category',
    'character', 'difficulty', 'standard_challenges', 'glitch_id', 'restrictions',
    'time_primary', 'time_rta', 'run_time', 'date_completed', 'date_submitted',
    'video_url', 'platform', 'runner_notes', 'verifier_notes'
  ];

  // Build sanitized update payload
  const updates = {};
  for (const [key, value] of Object.entries(edits)) {
    if (!ALLOWED_FIELDS.includes(key)) continue;

    // Type validation per field
    if (['standard_challenges', 'restrictions'].includes(key)) {
      if (!Array.isArray(value)) continue;
      if (value.some(v => typeof v !== 'string' || v.length > 100)) continue;
      updates[key] = value;
    } else if (typeof value === 'string') {
      if (value.length > 500) continue;
      updates[key] = value || null;
    } else if (value === null) {
      updates[key] = null;
    }
  }

  // If category_slug is updated, keep category in sync
  if (updates.category_slug && !updates.category) {
    updates.category = updates.category_slug;
  }
  if (updates.category && !updates.category_slug) {
    updates.category_slug = updates.category;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: 'No valid edits after validation' }, 400, env, request);
  }

  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `runs?public_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: updates,
    });

  if (!updateResult.ok) {
    console.error('Failed to edit approved run:', updateResult.data);
    return jsonResponse({ error: 'Failed to update run. Please try again.' }, 500, env, request);
  }

  // Discord notification
  const changedFields = Object.keys(updates);
  await sendDiscordNotification(env, 'runs', {
    title: '✏️ Approved Run Edited',
    url: `${SITE_URL}/games/${run.game_id}/runs`,
    color: 0x17a2b8,
    fields: [
      { name: 'Game', value: run.game_id, inline: true },
      { name: 'Runner', value: run.runner_id, inline: true },
      { name: 'Fields Changed', value: changedFields.join(', '), inline: false },
      ...(body.notes ? [{ name: 'Notes', value: body.notes, inline: false }] : []),
    ],
    timestamp: now,
  });

  return jsonResponse({
    ok: true,
    message: `Run updated (${changedFields.length} field${changedFields.length !== 1 ? 's' : ''}).`,
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /verify-run (Game mod confirms run is legitimate)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleVerifyRun(body, env, request) {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // Verifiers + admins can verify runs
  if (!auth.role.verifier && !auth.role.admin) {
    return jsonResponse({ error: 'Verifier or admin required' }, 403, env, request);
  }

  const runId = body.run_id;
  if (!runId || !isValidId(runId)) return jsonResponse({ error: 'Invalid run_id' }, 400, env, request);

  // Fetch the run to check it exists and get game_id
  const runResult = await supabaseQuery(env,
    `runs?public_id=eq.${encodeURIComponent(runId)}&select=public_id,game_id,runner_id,verified`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }
  const run = runResult.data[0];

  // Verifiers can only verify runs for their assigned games
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(run.game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
  }

  if (run.verified) {
    return jsonResponse({ error: 'Run is already verified' }, 400, env, request);
  }

  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `runs?public_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        verified: true,
        verified_by: auth.role.runnerId || auth.user.id,
        verified_at: now,
      },
    });

  if (!updateResult.ok) {
    console.error('Failed to verify run:', updateResult.data);
    return jsonResponse({ error: 'Failed to verify run. Please try again.' }, 500, env, request);
  }

  await sendDiscordNotification(env, 'runs', {
    title: '🏆 Run Verified',
    url: `${SITE_URL}/games/${run.game_id}/runs`,
    color: 0x28a745,
    fields: [
      { name: 'Game', value: run.game_id, inline: true },
      { name: 'Runner', value: run.runner_id, inline: true },
      { name: 'Verified By', value: auth.role.runnerId || 'Admin', inline: true },
      ...(body.notes ? [{ name: 'Notes', value: body.notes, inline: false }] : []),
      { name: 'View', value: `[Game Runs](${SITE_URL}/games/${run.game_id}/runs) · [Runner](${SITE_URL}/runners/${run.runner_id})`, inline: false },
    ],
    timestamp: now,
  });

  return jsonResponse({ ok: true, message: 'Run verified.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /unverify-run (Revoke verification — mod needs to re-review)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleUnverifyRun(body, env, request) {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // Verifiers + admins can unverify runs
  if (!auth.role.verifier && !auth.role.admin) {
    return jsonResponse({ error: 'Verifier or admin required' }, 403, env, request);
  }

  const runId = body.run_id;
  if (!runId || !isValidId(runId)) return jsonResponse({ error: 'Invalid run_id' }, 400, env, request);

  const reason = body.reason;
  if (!reason) return jsonResponse({ error: 'Reason is required when unverifying a run' }, 400, env, request);

  // Fetch the run
  const runResult = await supabaseQuery(env,
    `runs?public_id=eq.${encodeURIComponent(runId)}&select=public_id,game_id,runner_id,verified`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }
  const run = runResult.data[0];

  // Verifiers can only unverify runs for their assigned games
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(run.game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
  }

  if (!run.verified) {
    return jsonResponse({ error: 'Run is not currently verified' }, 400, env, request);
  }

  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `runs?public_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        verified: false,
        verified_by: null,
        verified_at: null,
      },
    });

  if (!updateResult.ok) {
    console.error('Failed to unverify run:', updateResult.data);
    return jsonResponse({ error: 'Failed to unverify run. Please try again.' }, 500, env, request);
  }

  await sendDiscordNotification(env, 'runs', {
    title: '🔄 Run Verification Revoked',
    url: `${SITE_URL}/admin/runs`,
    color: 0xffc107,
    fields: [
      { name: 'Game', value: run.game_id, inline: true },
      { name: 'Runner', value: run.runner_id, inline: true },
      { name: 'Revoked By', value: auth.role.runnerId || 'Admin', inline: true },
      { name: 'Reason', value: reason, inline: false },
    ],
    timestamp: now,
  });

  return jsonResponse({ ok: true, message: 'Verification revoked.' }, 200, env, request);
}

