// ═══════════════════════════════════════════════════════════════════════════════
// Profile Handlers — Approve, Reject, Request Changes
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput, isValidId } from '../lib/utils.js';
import { supabaseQuery, insertNotification } from '../lib/supabase.js';
import { authenticateAdmin } from '../lib/auth.js';
import { sendDiscordNotification, SITE_URL } from '../lib/discord.js';

export async function handleApproveProfile(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const profileId = body.profile_id;
  if (!profileId) return jsonResponse({ error: 'Missing profile_id' }, 400, env, request);

  // SECURITY (Item 11): Validate ID format
  if (!isValidId(profileId)) {
    return jsonResponse({ error: 'Invalid profile_id format' }, 400, env, request);
  }

  // Fetch profile
  const profResult = await supabaseQuery(env,
    `pending_profiles?id=eq.${encodeURIComponent(profileId)}&select=*`, { method: 'GET' });
  if (!profResult.ok || !profResult.data?.length) {
    return jsonResponse({ error: 'Profile not found' }, 404, env, request);
  }
  const profile = profResult.data[0];
  const runnerId = profile.requested_runner_id;
  const now = new Date().toISOString();

  if (runnerId) {
    // Full profile — create profiles row

    // Upsert into profiles (create the approved profile row)
    const rpUpsert = await supabaseQuery(env, 'profiles', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: {
        user_id: profile.user_id,
        runner_id: runnerId,
        display_name: profile.display_name || null,
        pronouns: profile.pronouns || null,
        location: profile.location || null,
        bio: profile.bio || null,
        avatar_url: profile.avatar_url || null,
        socials: profile.socials || {},
        status: 'approved',
        approved_at: now,
        approved_by: auth.user.id,
        updated_at: now,
      },
    });

    if (!rpUpsert.ok) {
      console.error('Failed to upsert profiles:', rpUpsert.data);
    }
  }
  // If no runnerId, we just mark pending_profiles as approved below.
  // When the user later fills out the profile form, they'll be pre-approved.

  // Update pending_profiles status
  const patchResult = await supabaseQuery(env,
    `pending_profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: {
        status: 'approved',
        reviewed_by: auth.user.id,
        reviewed_at: now,
        reviewer_notes: body.notes || null,
      },
    });
  if (!patchResult.ok) {
    console.error('Failed to update pending_profiles status:', patchResult.data);
  }

  // Discord notification
  const approvalType = runnerId ? 'Profile' : 'Account (no profile yet)';
  await sendDiscordNotification(env, 'profiles', {
    title: '👤 Profile Approved',
    url: runnerId ? `${SITE_URL}/runners/${runnerId}` : `${SITE_URL}/admin/profiles`,
    color: 0x28a745,
    fields: [
      { name: 'Runner', value: profile.display_name || runnerId || 'No profile yet', inline: true },
      { name: 'ID', value: runnerId || 'N/A', inline: true },
      { name: 'Type', value: approvalType, inline: true },
      ...(runnerId ? [{ name: 'View', value: `[Runner Profile](${SITE_URL}/runners/${runnerId})`, inline: false }] : []),
    ],
    timestamp: now,
  });

  // In-app notification to user
  await insertNotification(env, profile.user_id, 'profile_approved',
    'Your profile has been approved!',
    {
      message: body.notes || null,
      link: runnerId ? `/runners/${runnerId}` : '/profile',
      metadata: { runner_id: runnerId },
    }
  );

  return jsonResponse({
    ok: true,
    message: 'Profile approved — visible on site immediately',
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /reject-profile
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleRejectProfile(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const profileId = body.profile_id;
  if (!profileId || !isValidId(profileId)) return jsonResponse({ error: 'Invalid profile_id' }, 400, env, request);

  const reason = body.reason || 'No reason provided';
  const notes = body.notes || null;
  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `pending_profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: {
        status: 'rejected',
        rejection_reason: reason,
        reviewed_by: auth.user.id,
        reviewed_at: now,
        reviewer_notes: notes,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to reject profile' }, 500, env, request);

  // Get user_id from the PATCH response (Prefer: return=representation)
  const rejectedProfile = Array.isArray(updateResult.data) ? updateResult.data[0] : null;

  await sendDiscordNotification(env, 'profiles', {
    title: '❌ Profile Rejected',
    color: 0xdc3545,
    fields: [
      { name: 'Profile ID', value: profileId, inline: true },
      { name: 'Reason', value: reason, inline: false },
      ...(notes ? [{ name: 'Notes', value: notes, inline: false }] : []),
    ],
    timestamp: now,
  });

  // In-app notification to user
  if (rejectedProfile?.user_id) {
    await insertNotification(env, rejectedProfile.user_id, 'profile_rejected',
      'Your profile was not approved',
      {
        message: reason,
        link: '/profile/submissions',
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Profile rejected.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /request-profile-changes
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleRequestProfileChanges(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const profileId = body.profile_id;
  if (!profileId || !isValidId(profileId)) return jsonResponse({ error: 'Invalid profile_id' }, 400, env, request);

  const notes = body.notes;
  if (!notes) return jsonResponse({ error: 'Notes are required' }, 400, env, request);
  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `pending_profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: {
        status: 'needs_changes',
        reviewed_by: auth.user.id,
        reviewed_at: now,
        reviewer_notes: notes,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to update profile' }, 500, env, request);

  // Get user_id from the PATCH response
  const changesProfile = Array.isArray(updateResult.data) ? updateResult.data[0] : null;

  await sendDiscordNotification(env, 'profiles', {
    title: '✏️ Profile Changes Requested',
    color: 0x17a2b8,
    fields: [
      { name: 'Profile ID', value: profileId, inline: true },
      { name: 'Notes', value: notes, inline: false },
    ],
    timestamp: now,
  });

  // In-app notification to user
  if (changesProfile?.user_id) {
    await insertNotification(env, changesProfile.user_id, 'profile_needs_changes',
      'Changes requested on your profile',
      {
        message: notes,
        link: '/profile/submissions',
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Changes requested.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /update-contributions
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleUpdateContributions(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const runnerId = body.runner_id;
  if (!runnerId || typeof runnerId !== 'string') return jsonResponse({ error: 'Missing runner_id' }, 400, env, request);

  const contributions = body.contributions;
  if (!Array.isArray(contributions)) return jsonResponse({ error: 'contributions must be an array' }, 400, env, request);

  // Validate each contribution
  const VALID_TYPES = ['guide', 'resource', 'tool', 'research', 'video', 'moderation', 'translation', 'other'];
  for (const c of contributions) {
    if (!c || typeof c !== 'object') return jsonResponse({ error: 'Each contribution must be an object' }, 400, env, request);
    if (!c.title || typeof c.title !== 'string') return jsonResponse({ error: 'Each contribution requires a title' }, 400, env, request);
    if (c.type && !VALID_TYPES.includes(c.type)) return jsonResponse({ error: `Invalid contribution type: ${c.type}. Valid: ${VALID_TYPES.join(', ')}` }, 400, env, request);
    // Sanitize fields
    c.title = sanitizeInput(c.title, 200);
    if (c.description) c.description = sanitizeInput(c.description, 500);
    if (c.url && typeof c.url === 'string') {
      try { new URL(c.url); } catch { return jsonResponse({ error: `Invalid URL: ${c.url}` }, 400, env, request); }
    }
    if (c.icon) c.icon = sanitizeInput(c.icon, 10);
  }

  const updateResult = await supabaseQuery(env,
    `profiles?runner_id=eq.${encodeURIComponent(runnerId)}`, {
      method: 'PATCH',
      body: { contributions, updated_at: new Date().toISOString() },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to update contributions' }, 500, env, request);

  return jsonResponse({ ok: true, message: 'Contributions updated.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /update-game-credit-role
// Update a runner's credit role label on a specific game.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleUpdateGameCreditRole(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const gameId = body.game_id as string;
  const runnerId = body.runner_id as string;
  const role = body.role as string;

  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);
  if (!runnerId || typeof runnerId !== 'string') return jsonResponse({ error: 'Missing runner_id' }, 400, env, request);
  if (!role || typeof role !== 'string') return jsonResponse({ error: 'Missing role' }, 400, env, request);

  const sanitizedRole = sanitizeInput(role, 100);

  // Fetch current credits
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(gameId)}&select=credits`,
    { method: 'GET' });
  if (!gameResult.ok || !gameResult.data?.length) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }

  const credits: { runner_id: string; role: string }[] = gameResult.data[0].credits || [];
  const entry = credits.find(c => c.runner_id === runnerId);
  if (!entry) {
    return jsonResponse({ error: 'Runner not found in this game\'s credits' }, 404, env, request);
  }

  entry.role = sanitizedRole;

  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(gameId)}`, {
      method: 'PATCH',
      body: { credits },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to update credit role' }, 500, env, request);

  return jsonResponse({ ok: true, message: 'Credit role updated.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /approve-other-link
// Moves a link from other_links_pending → socials.other on a profile.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleApproveOtherLink(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const profileId = body.profile_id;
  const link = body.link;
  if (!profileId || typeof profileId !== 'string') return jsonResponse({ error: 'Missing profile_id' }, 400, env, request);
  if (!link || typeof link !== 'string') return jsonResponse({ error: 'Missing link' }, 400, env, request);

  // Fetch profile
  const profResult = await supabaseQuery(env,
    `profiles?id=eq.${encodeURIComponent(profileId)}&select=id,user_id,runner_id,socials,other_links_pending`,
    { method: 'GET' });
  if (!profResult.ok || !Array.isArray(profResult.data) || profResult.data.length === 0) {
    return jsonResponse({ error: 'Profile not found' }, 404, env, request);
  }
  const profile = profResult.data[0];

  const currentPending: string[] = Array.isArray(profile.other_links_pending) ? profile.other_links_pending : [];
  if (!currentPending.includes(link)) {
    return jsonResponse({ error: 'Link not found in pending list' }, 404, env, request);
  }

  // Move link: pending → socials.other
  const socials = profile.socials || {};
  const currentOther: string[] = Array.isArray(socials.other) ? socials.other : [];
  const newOther = [...currentOther, link];
  const newPending = currentPending.filter((l: string) => l !== link);

  const updatedSocials = { ...socials, other: newOther };

  const updateResult = await supabaseQuery(env,
    `profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: {
        socials: updatedSocials,
        other_links_pending: newPending.length > 0 ? newPending : null,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to approve link' }, 500, env, request);

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'profiles',
        action: 'other_link_approved',
        record_id: profileId,
        user_id: auth.user.id,
        old_data: { link },
        new_data: { approved: true },
      },
    });
  } catch { /* best-effort */ }

  // Notify the user
  if (profile.user_id) {
    await insertNotification(env, profile.user_id, 'link_approved',
      'Your custom link has been approved',
      {
        message: link,
        link: profile.runner_id ? `/runners/${profile.runner_id}` : '/profile/edit',
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Link approved' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /reject-other-link
// Removes a link from other_links_pending without adding to socials.other.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleRejectOtherLink(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const profileId = body.profile_id;
  const link = body.link;
  if (!profileId || typeof profileId !== 'string') return jsonResponse({ error: 'Missing profile_id' }, 400, env, request);
  if (!link || typeof link !== 'string') return jsonResponse({ error: 'Missing link' }, 400, env, request);

  // Fetch profile
  const profResult = await supabaseQuery(env,
    `profiles?id=eq.${encodeURIComponent(profileId)}&select=id,user_id,runner_id,other_links_pending`,
    { method: 'GET' });
  if (!profResult.ok || !Array.isArray(profResult.data) || profResult.data.length === 0) {
    return jsonResponse({ error: 'Profile not found' }, 404, env, request);
  }
  const profile = profResult.data[0];

  const currentPending: string[] = Array.isArray(profile.other_links_pending) ? profile.other_links_pending : [];
  if (!currentPending.includes(link)) {
    return jsonResponse({ error: 'Link not found in pending list' }, 404, env, request);
  }

  const newPending = currentPending.filter((l: string) => l !== link);

  const updateResult = await supabaseQuery(env,
    `profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: {
        other_links_pending: newPending.length > 0 ? newPending : null,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to reject link' }, 500, env, request);

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'profiles',
        action: 'other_link_rejected',
        record_id: profileId,
        user_id: auth.user.id,
        old_data: { link },
        new_data: { rejected: true },
      },
    });
  } catch { /* best-effort */ }

  // Notify the user
  if (profile.user_id) {
    await insertNotification(env, profile.user_id, 'link_rejected',
      'A custom link you submitted was not approved',
      {
        message: link,
        link: '/profile/edit',
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Link rejected' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /approve-game
// ═══════════════════════════════════════════════════════════════════════════════

