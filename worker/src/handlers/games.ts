// ═══════════════════════════════════════════════════════════════════════════════
// Game Handlers — Submit, Approve, Reject, Edit, Withdraw, Support, Check
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput, sanitizeArray, isValidId, slugify } from '../lib/utils.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { supabaseQuery, insertNotification } from '../lib/supabase.js';
import { authenticateAdmin, authenticateUser } from '../lib/auth.js';
import { sendDiscordNotification, SITE_URL } from '../lib/discord.js';
import { writeGameHistory, isClaimActive } from '../lib/game-helpers.js';

export async function handleGameSubmission(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // ── 1. Authenticate user ────────────────────────────────────────────────
  const auth = await authenticateUser(env, body, request);
  if (auth.error) {
    return jsonResponse({ error: auth.error }, auth.status, env, request);
  }

  // ── 2. Validate required fields ─────────────────────────────────────────
  if (!body.game_name) {
    return jsonResponse({ error: 'Game name is required' }, 400, env, request);
  }

  // SECURITY: Sanitize game name
  const gameName = sanitizeInput(body.game_name, 200);
  if (!gameName) {
    return jsonResponse({ error: 'Invalid game name' }, 400, env, request);
  }

  // Basic submissions skip structured data validation — admins will add it during review
  const isBasicSubmission = body.submission_type === 'basic';

  if (!isBasicSubmission) {
    // At least one category (full run or mini-challenge) required
    const hasFullRun = Array.isArray(body.full_run_categories) && body.full_run_categories.some(c =>
      typeof c === 'string' ? c.trim() : (c && c.label && c.label.trim())
    );
    const hasMini = Array.isArray(body.mini_challenges) && body.mini_challenges.some(c =>
      typeof c === 'string' ? c.trim() : (c && c.label && c.label.trim())
    );
    if (!hasFullRun && !hasMini) {
      return jsonResponse({ error: 'At least 1 run category is required' }, 400, env, request);
    }

    // At least one challenge required
    if (!Array.isArray(body.challenges) || body.challenges.length === 0) {
      return jsonResponse({ error: 'At least 1 challenge type is required' }, 400, env, request);
    }
  }

  // If characters enabled, need at least 2
  if (body.character_enabled && (!Array.isArray(body.characters) || body.characters.filter(c => c && (typeof c === 'string' ? c.trim() : c.label?.trim())).length < 2)) {
    return jsonResponse({ error: 'At least 2 character options are required when characters are enabled' }, 400, env, request);
  }

  // Verify Turnstile
  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstile_token, env, ip);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Captcha verification failed' }, 403, env, request);
  }

  const gameId = body.game_id ? sanitizeInput(body.game_id, 100) : slugify(gameName);

  // Check if game_id already exists in pending_games or live games
  const existing = await supabaseQuery(env,
    `pending_games?game_id=eq.${encodeURIComponent(gameId)}&status=neq.rejected&select=id`,
    { method: 'GET' });
  if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
    return jsonResponse({ error: 'A game with this ID is already pending or approved' }, 409, env, request);
  }

  const liveGame = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(gameId)}&select=game_id`,
    { method: 'GET' });
  if (liveGame.ok && Array.isArray(liveGame.data) && liveGame.data.length > 0) {
    return jsonResponse({ error: 'This game already exists on the site' }, 409, env, request);
  }

  // ── 3. Build row matching pending_games schema ──────────────────────────
  const aliases = (body.aliases || []).map(a => sanitizeInput(a, 200)).filter(Boolean);

  const row = {
    game_id: gameId,
    game_name: gameName,
    game_name_aliases: aliases,
    platforms: body.platforms || [],
    genres: body.genres || [],
    description: body.description ? sanitizeInput(body.description, 2000) : null,
    rules: body.general_rules ? sanitizeInput(body.general_rules, 5000) : null,
    submitted_by: auth.user.id,
    submitted_at: new Date().toISOString(),
    submitter_notes: body.additional_notes ? sanitizeInput(body.additional_notes, 2000) : null,
    cover_image_url: body.cover_image_url ? sanitizeInput(body.cover_image_url, 500) : null,
    status: 'pending',
    // Rich structured data in JSONB
    game_data: {
      submission_type: isBasicSubmission ? 'basic' : 'advanced',
      timing_method: body.timing_method || 'RTA',
      character_column: {
        enabled: body.character_enabled || false,
        label: sanitizeInput(body.character_label || 'Character', 50),
      },
      characters_data: (body.characters || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
      difficulty_column: {
        enabled: body.difficulty_enabled || false,
        label: sanitizeInput(body.difficulty_label || 'Difficulty', 50),
      },
      difficulties_data: (body.difficulties || []).map(d =>
        typeof d === 'string' ? { slug: slugify(d), label: sanitizeInput(d, 100) } : d
      ),
      challenges_data: (body.challenges || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
      custom_challenge_description: body.custom_challenge_description
        ? sanitizeInput(body.custom_challenge_description, 2000)
        : null,
      restrictions_data: (body.restrictions || []).map(r =>
        typeof r === 'string' ? { slug: slugify(r), label: sanitizeInput(r, 100) } : r
      ),
      glitches_data: (body.glitches || []).map(g =>
        typeof g === 'string'
          ? { slug: slugify(g), label: sanitizeInput(g, 100) }
          : {
              slug: g.slug || slugify(g.label || ''),
              label: sanitizeInput(g.label || '', 100),
              ...(g.description ? { description: sanitizeInput(g.description, 1000) } : {}),
            }
      ),
      nmg_rules: body.nmg_rules ? sanitizeInput(body.nmg_rules, 3000) : null,
      full_runs: (body.full_run_categories || []).map(c =>
        typeof c === 'string'
          ? { slug: slugify(c), label: sanitizeInput(c, 100) }
          : {
              slug: c.slug || slugify(c.label || ''),
              label: sanitizeInput(c.label || '', 100),
              ...(c.description ? { description: sanitizeInput(c.description, 2000) } : {}),
              ...(c.exceptions ? { exceptions: sanitizeInput(c.exceptions, 2000) } : {}),
              ...(c.fixed_loadout ? { fixed_loadout: c.fixed_loadout } : {}),
            }
      ),
      mini_challenges: (body.mini_challenges || []).map(mc => {
        if (typeof mc === 'string') return { slug: slugify(mc), label: sanitizeInput(mc, 100), children: [] };
        return {
          slug: mc.slug || slugify(mc.label || ''),
          label: sanitizeInput(mc.label || '', 100),
          ...(mc.description ? { description: sanitizeInput(mc.description, 2000) } : {}),
          ...(mc.exceptions ? { exceptions: sanitizeInput(mc.exceptions, 2000) } : {}),
          children: (mc.children || []).map(ch =>
            typeof ch === 'string'
              ? { slug: slugify(ch), label: sanitizeInput(ch, 100) }
              : {
                  slug: ch.slug || slugify(ch.label || ''),
                  label: sanitizeInput(ch.label || '', 100),
                  ...(ch.description ? { description: sanitizeInput(ch.description, 2000) } : {}),
                  ...(ch.exceptions ? { exceptions: sanitizeInput(ch.exceptions, 2000) } : {}),
                  ...(ch.fixed_loadout ? { fixed_loadout: ch.fixed_loadout } : {}),
                }
          ),
        };
      }),
      custom_genres: (body.custom_genres || []).map(g => sanitizeInput(g, 60)).filter(Boolean),
      custom_platforms: (body.custom_platforms || []).map(p => sanitizeInput(p, 60)).filter(Boolean),
      glitch_doc_links: body.glitch_doc_links || null,
      involvement: body.involvement || [],
    },
  };

  // ── 4. Insert ───────────────────────────────────────────────────────────
  const result = await supabaseQuery(env, 'pending_games', {
    method: 'POST',
    body: row,
  });

  if (!result.ok) {
    console.error('Supabase insert error:', result.data);
    return jsonResponse({ error: 'Failed to save game submission' }, 500, env, request);
  }

  // ── 5. Discord notification ─────────────────────────────────────────────
  await sendDiscordNotification(env, 'games', {
    title: isBasicSubmission ? '🎮 New Game Submitted (Basic)' : '🎮 New Game Submitted',
    url: `${SITE_URL}/admin/games`,
    color: 0x5865f2,
    fields: [
      { name: 'Game', value: gameName, inline: true },
      { name: 'ID', value: gameId, inline: true },
      ...(isBasicSubmission
        ? [{ name: 'Type', value: '📝 Basic — needs structured data', inline: true }]
        : [
            { name: 'Categories', value: `${(body.full_run_categories || []).length} full, ${(body.mini_challenges || []).length} mini`, inline: true },
            { name: 'Challenges', value: `${(body.challenges || []).length} selected`, inline: true },
          ]),
      { name: 'Platforms', value: `${(body.platforms || []).length} selected`, inline: true },
      ...(body.custom_genres && body.custom_genres.length > 0
        ? [{ name: 'Custom Genres', value: body.custom_genres.join(', '), inline: true }]
        : []),
      { name: 'Review', value: `[Open Admin Panel](${SITE_URL}/admin/games)`, inline: false },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({
    ok: true,
    game_id: gameId,
    message: 'Game submitted for review',
  }, 200, env, request);
}

export async function handleApproveGame(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const gameId = body.game_id;
  if (!gameId) return jsonResponse({ error: 'Missing game_id' }, 400, env, request);

  // SECURITY: Validate ID format
  if (!isValidId(gameId)) {
    return jsonResponse({ error: 'Invalid game_id format' }, 400, env, request);
  }

  // Fetch pending game
  const gameResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !gameResult.data?.length) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const game = gameResult.data[0];
  const gd = game.game_data || {};

  // Look up submitter's runner_id for credits
  let submitterRunnerId = null;
  if (game.submitted_by) {
    const profileResult = await supabaseQuery(env,
      `profiles?user_id=eq.${encodeURIComponent(game.submitted_by)}&select=runner_id`,
      { method: 'GET' });
    if (profileResult.ok && profileResult.data?.length) {
      submitterRunnerId = profileResult.data[0].runner_id;
    }
  }

  const now = new Date().toISOString();
  const initial = (game.game_id || 'x')[0].toLowerCase();

  // Build credits array
  const credits = [];
  if (submitterRunnerId) {
    credits.push({
      name: submitterRunnerId,
      runner_id: submitterRunnerId,
      role: 'Game submission',
    });
  }

  // Merge custom genres/platforms into the main arrays
  const mergedGenres = [...new Set([...(game.genres || []), ...(gd.custom_genres || [])])];
  const mergedPlatforms = [...new Set([...(game.platforms || []), ...(gd.custom_platforms || [])])];

  // Default challenge types if none were submitted
  const DEFAULT_CHALLENGES = [
    { slug: 'hitless', label: 'Hitless' },
    { slug: 'damageless', label: 'Damageless' },
    { slug: 'deathless', label: 'Deathless' },
    { slug: 'flawless', label: 'Flawless' },
    { slug: 'blindfolded', label: 'Blindfolded' },
    { slug: 'minimalist', label: 'Minimalist' },
    { slug: 'pacifist', label: 'Pacifist' },
    { slug: 'speedrun', label: 'Speedrun' },
  ];

  const challengesData = (gd.challenges_data && gd.challenges_data.length > 0)
    ? gd.challenges_data
    : DEFAULT_CHALLENGES;
  const usingDefaultChallenges = !(gd.challenges_data && gd.challenges_data.length > 0);

  // Build resources_data — seed with glitch docs if provided
  const resourcesData = [];
  if (gd.glitch_doc_links) {
    resourcesData.push({
      name: 'Glitch Documentation',
      url: gd.glitch_doc_links.startsWith('http') ? gd.glitch_doc_links : null,
      description: gd.glitch_doc_links.startsWith('http') ? null : gd.glitch_doc_links,
      type: 'documentation',
    });
  }

  // Append default challenges note to general rules if using defaults
  let generalRules = game.rules || '';
  if (usingDefaultChallenges && generalRules) {
    generalRules += '\n\n> **Note:** This game is using CRC\'s default challenge types. Game moderators can customize these in the Game Editor.';
  } else if (usingDefaultChallenges) {
    generalRules = '> **Note:** This game is using CRC\'s default challenge types. Game moderators can customize these in the Game Editor.';
  }

  // Insert into the live `games` table — pull rich data from game_data JSONB
  const gamesInsert = await supabaseQuery(env, 'games', {
    method: 'POST',
    body: {
      game_id: game.game_id,
      game_name: game.game_name,
      game_name_aliases: game.game_name_aliases || [],
      status: (body.approve_as === 'Community Review') ? 'Community Review' : 'Active',
      reviewers: [],
      is_modded: false,
      base_game: null,
      genres: mergedGenres,
      platforms: mergedPlatforms,
      tabs: {
        overview: true, runs: true, rules: true,
        history: true, resources: true, forum: true,
        extra_1: false, extra_2: false,
      },
      general_rules: generalRules,
      challenges_data: challengesData,
      restrictions_data: gd.restrictions_data || [],
      glitches_data: gd.glitches_data || [],
      full_runs: gd.full_runs || [],
      mini_challenges: gd.mini_challenges || [],
      player_made: [],
      character_column: gd.character_column || { enabled: false, label: 'Character' },
      characters_data: gd.characters_data || [],
      difficulty_column: gd.difficulty_column || { enabled: false, label: 'Difficulty' },
      difficulties_data: gd.difficulties_data || [],
      timing_method: gd.timing_method || 'RTA',
      nmg_rules: gd.nmg_rules || null,
      glitch_doc_links: gd.glitch_doc_links || null,
      resources_data: resourcesData,
      community_achievements: [],
      credits: credits,
      cover: game.cover_image_url || `/img/games/${initial}/${game.game_id}.jpg`,
      cover_position: 'center',
      content: game.description || `${game.game_name} challenge runs.`,
    },
  });

  if (!gamesInsert.ok) {
    console.error('Failed to insert approved game:', gamesInsert.data);
    return jsonResponse({ error: 'Failed to approve game. Please try again.' }, 500, env, request);
  }

  // Update pending_games status
  await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}`, {
      method: 'PATCH',
      body: {
        status: 'approved',
        reviewed_by: auth.user.id,
        reviewed_at: now,
        reviewer_notes: body.notes || null,
      },
    });

  // Discord notification
  await sendDiscordNotification(env, 'games', {
    title: '🎮 Game Approved',
    url: `${SITE_URL}/games/${game.game_id}`,
    color: 0x28a745,
    fields: [
      { name: 'Game', value: game.game_name, inline: true },
      { name: 'ID', value: game.game_id, inline: true },
      { name: 'View', value: `[Game Page](${SITE_URL}/games/${game.game_id})`, inline: false },
    ],
    footer: { text: 'Game page is live immediately' },
    timestamp: now,
  });

  // History audit
  writeGameHistory(env, {
    game_id: game.game_id,
    action: 'game_approved',
    note: `Game "${game.game_name}" approved and published`,
    actor_id: auth.user.id,

  });

  // In-app notification to submitter
  await insertNotification(env, game.submitted_by, 'game_approved',
    `${game.game_name} has been approved!`,
    {
      message: body.notes || null,
      link: `/games/${game.game_id}`,
      metadata: { game_id: game.game_id },
    }
  );

  return jsonResponse({
    ok: true,
    message: 'Game approved — visible on site immediately',
  }, 200, env, request);
}

export async function handleRejectGame(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const gameId = body.game_id;
  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);

  const reason = body.reason || 'No reason provided';
  const notes = body.notes || null;
  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}`, {
      method: 'PATCH',
      body: {
        status: 'rejected',
        rejection_reason: reason,
        reviewed_by: auth.user.id,
        reviewed_at: now,
        reviewer_notes: notes,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to reject game' }, 500, env, request);

  // Get submitted_by from the PATCH response
  const rejectedGame = Array.isArray(updateResult.data) ? updateResult.data[0] : null;

  await sendDiscordNotification(env, 'games', {
    title: '❌ Game Rejected',
    color: 0xdc3545,
    fields: [
      { name: 'Game ID', value: gameId, inline: true },
      { name: 'Reason', value: reason, inline: false },
      ...(notes ? [{ name: 'Notes', value: notes, inline: false }] : []),
    ],
    timestamp: now,
  });

  // In-app notification to submitter
  if (rejectedGame?.submitted_by) {
    await insertNotification(env, rejectedGame.submitted_by, 'game_rejected',
      'Your game request was not approved',
      {
        message: reason,
        link: '/profile/submissions',
        metadata: { game_id: rejectedGame.game_id },
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Game rejected.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /request-game-changes
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleRequestGameChanges(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const gameId = body.game_id;
  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);

  const notes = body.notes;
  if (!notes) return jsonResponse({ error: 'Notes are required' }, 400, env, request);
  const now = new Date().toISOString();

  const updateResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}`, {
      method: 'PATCH',
      body: {
        status: 'needs_changes',
        reviewed_by: auth.user.id,
        reviewed_at: now,
        reviewer_notes: notes,
      },
    });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to update game' }, 500, env, request);

  // Get submitted_by from the PATCH response
  const changesGame = Array.isArray(updateResult.data) ? updateResult.data[0] : null;

  await sendDiscordNotification(env, 'games', {
    title: '✏️ Game Changes Requested',
    color: 0x17a2b8,
    fields: [
      { name: 'Game ID', value: gameId, inline: true },
      { name: 'Notes', value: notes, inline: false },
    ],
    timestamp: now,
  });

  // In-app notification to submitter
  if (changesGame?.submitted_by) {
    await insertNotification(env, changesGame.submitted_by, 'game_needs_changes',
      'Changes requested on your game submission',
      {
        message: notes,
        link: '/profile/submissions',
        metadata: { game_id: changesGame.game_id },
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Changes requested.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /assign-role (Manage user roles — hierarchical)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Role hierarchy levels (higher = more powerful):
 *   4 = super_admin   (can assign: admin, moderator, verifier)
 *   3 = admin         (can assign: moderator, verifier)
 *   2 = moderator     (can assign: verifier)
 *   1 = verifier      (cannot assign anyone)
 *   0 = user          (cannot assign anyone)
 */

export async function handleCheckGameExists(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  if (!body.game_name || typeof body.game_name !== 'string') {
    return jsonResponse({ error: 'game_name is required' }, 400, env, request);
  }

  const name = body.game_name.trim();
  if (!name) {
    return jsonResponse({ exists: false }, 200, env, request);
  }

  const candidateId = slugify(name);
  // SECURITY: Escape SQL ilike wildcards (% and _) to prevent wildcard injection.
  // Without this, a user submitting "%" would match all games.
  const lowerName = name.toLowerCase().replace(/%/g, '\\%').replace(/_/g, '\\_');

  // Check live games — exact slug match OR case-insensitive name match
  const liveResult = await supabaseQuery(env,
    `games?or=(game_id.eq.${encodeURIComponent(candidateId)},game_name.ilike.${encodeURIComponent(lowerName)})&select=game_id,game_name&limit=1`,
    { method: 'GET' });

  if (liveResult.ok && Array.isArray(liveResult.data) && liveResult.data.length > 0) {
    const g = liveResult.data[0];
    return jsonResponse({
      exists: true,
      where: 'live',
      game_id: g.game_id,
      game_name: g.game_name,
    }, 200, env, request);
  }

  // Check pending games (non-rejected) — exact slug match OR case-insensitive name match
  const pendingResult = await supabaseQuery(env,
    `pending_games?status=neq.rejected&or=(game_id.eq.${encodeURIComponent(candidateId)},game_name.ilike.${encodeURIComponent(lowerName)})&select=id,game_id,game_name,status&limit=1`,
    { method: 'GET' });

  if (pendingResult.ok && Array.isArray(pendingResult.data) && pendingResult.data.length > 0) {
    const pg = pendingResult.data[0];

    // Count existing supporters
    const countResult = await supabaseQuery(env,
      `pending_game_supporters?pending_game_id=eq.${encodeURIComponent(pg.id)}&select=id`,
      { method: 'GET', headers: { Prefer: 'count=exact' } });
    const supporterCount = (countResult.ok && Array.isArray(countResult.data))
      ? countResult.data.length : 0;

    return jsonResponse({
      exists: true,
      where: 'pending',
      pending_game_id: pg.id,
      game_id: pg.game_id,
      game_name: pg.game_name,
      status: pg.status,
      supporter_count: supporterCount,
    }, 200, env, request);
  }

  return jsonResponse({ exists: false }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /support-game (Add supporter contribution to pending game)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleSupportGame(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // 1. Authenticate
  const auth = await authenticateUser(env, body, request);
  if (auth.error) {
    return jsonResponse({ error: auth.error }, auth.status, env, request);
  }

  // 2. Validate
  if (!body.pending_game_id) {
    return jsonResponse({ error: 'pending_game_id is required' }, 400, env, request);
  }

  // Verify Turnstile
  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstile_token, env, ip);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Captcha verification failed' }, 403, env, request);
  }

  // 3. Verify the pending game exists and is still pending
  const gameResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(body.pending_game_id)}&status=neq.rejected&select=id,game_name`,
    { method: 'GET' });

  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Pending game not found or no longer pending' }, 404, env, request);
  }

  // 4. Check if this user is the original submitter
  const originalCheck = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(body.pending_game_id)}&submitted_by=eq.${encodeURIComponent(auth.user.id)}&select=id`,
    { method: 'GET' });
  if (originalCheck.ok && Array.isArray(originalCheck.data) && originalCheck.data.length > 0) {
    return jsonResponse({ error: 'You are the original submitter — you can edit your submission directly' }, 409, env, request);
  }

  // 5. Build supporter row
  const notes = body.notes ? sanitizeInput(body.notes, 3000) : null;
  const suggestedData = {};

  if (body.suggested_categories && Array.isArray(body.suggested_categories)) {
    suggestedData.categories = body.suggested_categories
      .filter(c => c && typeof c === 'string' && c.trim())
      .map(c => sanitizeInput(c.trim(), 200))
      .slice(0, 20);
  }
  if (body.suggested_challenges && Array.isArray(body.suggested_challenges)) {
    suggestedData.challenges = body.suggested_challenges
      .filter(c => c && typeof c === 'string' && c.trim())
      .map(c => sanitizeInput(c.trim(), 200))
      .slice(0, 20);
  }
  if (body.suggested_rules && typeof body.suggested_rules === 'string') {
    suggestedData.rules = sanitizeInput(body.suggested_rules, 3000);
  }

  const row = {
    pending_game_id: body.pending_game_id,
    user_id: auth.user.id,
    notes,
    suggested_data: suggestedData,
  };

  // 6. Upsert (update if user already contributed)
  const result = await supabaseQuery(env,
    'pending_game_supporters?on_conflict=pending_game_id,user_id', {
      method: 'POST',
      body: row,
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    });

  if (!result.ok) {
    console.error('Supporter insert error:', result.data);
    return jsonResponse({ error: 'Failed to save contribution' }, 500, env, request);
  }

  // 7. Discord notification (best-effort)
  const gameName = gameResult.data[0].game_name;
  await sendDiscordNotification(env, 'games', {
    title: '🤝 New Game Supporter',
    color: 0x57f287,
    fields: [
      { name: 'Game', value: gameName, inline: true },
      { name: 'Has Notes', value: notes ? 'Yes' : 'No', inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({ ok: true, message: 'Your contribution has been saved!' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /edit-pending-run (User edits own pending run)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleEditPendingGame(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id;
  if (!gameId) return jsonResponse({ error: 'Missing game_id' }, 400, env, request);
  if (!isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id format' }, 400, env, request);

  // Fetch by pending_games.id (UUID)
  const gameResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !gameResult.data?.length) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const game = gameResult.data[0];

  if (game.submitted_by !== auth.user.id) {
    return jsonResponse({ error: 'You can only edit your own submissions' }, 403, env, request);
  }
  if (game.status !== 'pending') {
    return jsonResponse({ error: 'Only pending submissions can be edited' }, 400, env, request);
  }
  if (game.claimed_by && isClaimActive(game.claimed_at)) {
    return jsonResponse({ error: 'This submission is currently under review and cannot be edited' }, 423, env, request);
  }

  // Build update object (allowlisted fields only)
  const updates = { updated_at: new Date().toISOString() };

  if (body.game_name !== undefined) {
    const name = sanitizeInput(body.game_name, 200);
    if (!name) return jsonResponse({ error: 'Game name cannot be empty' }, 400, env, request);
    updates.game_name = name;
  }
  if (body.aliases !== undefined)         updates.game_name_aliases = (body.aliases || []).map(a => sanitizeInput(a, 200)).filter(Boolean);
  if (body.platforms !== undefined)       updates.platforms = body.platforms || [];
  if (body.genres !== undefined)          updates.genres = body.genres || [];
  if (body.description !== undefined)     updates.description = body.description ? sanitizeInput(body.description, 2000) : null;
  if (body.rules !== undefined)           updates.rules = body.rules ? sanitizeInput(body.rules, 5000) : null;
  if (body.cover_image_url !== undefined) updates.cover_image_url = body.cover_image_url ? sanitizeInput(body.cover_image_url, 500) : null;
  if (body.submitter_notes !== undefined) updates.submitter_notes = body.submitter_notes ? sanitizeInput(body.submitter_notes, 2000) : null;

  // game_data is the full JSONB blob — if sent, replace entirely (same sanitization as submit)
  if (body.game_data !== undefined && typeof body.game_data === 'object') {
    const gd = body.game_data;
    updates.game_data = {
      timing_method: gd.timing_method || 'RTA',
      character_column: {
        enabled: gd.character_column?.enabled || false,
        label: sanitizeInput(gd.character_column?.label || 'Character', 50),
      },
      characters_data: (gd.characters_data || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
      difficulty_column: {
        enabled: gd.difficulty_column?.enabled || false,
        label: sanitizeInput(gd.difficulty_column?.label || 'Difficulty', 50),
      },
      difficulties_data: (gd.difficulties_data || []).map(d =>
        typeof d === 'string' ? { slug: slugify(d), label: sanitizeInput(d, 100) } : d
      ),
      challenges_data: (gd.challenges_data || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
      custom_challenge_description: gd.custom_challenge_description
        ? sanitizeInput(gd.custom_challenge_description, 2000)
        : null,
      restrictions_data: (gd.restrictions_data || []).map(r =>
        typeof r === 'string' ? { slug: slugify(r), label: sanitizeInput(r, 100) } : r
      ),
      glitches_data: (gd.glitches_data || []).map(g =>
        typeof g === 'string'
          ? { slug: slugify(g), label: sanitizeInput(g, 100) }
          : {
              slug: g.slug || slugify(g.label || ''),
              label: sanitizeInput(g.label || '', 100),
              ...(g.description ? { description: sanitizeInput(g.description, 1000) } : {}),
            }
      ),
      nmg_rules: gd.nmg_rules ? sanitizeInput(gd.nmg_rules, 3000) : null,
      full_runs: (gd.full_runs || []).map(c =>
        typeof c === 'string'
          ? { slug: slugify(c), label: sanitizeInput(c, 100) }
          : {
              slug: c.slug || slugify(c.label || ''),
              label: sanitizeInput(c.label || '', 100),
              ...(c.description ? { description: sanitizeInput(c.description, 2000) } : {}),
              ...(c.exceptions ? { exceptions: sanitizeInput(c.exceptions, 2000) } : {}),
              ...(c.fixed_loadout ? { fixed_loadout: c.fixed_loadout } : {}),
            }
      ),
      mini_challenges: (gd.mini_challenges || []).map(mc => {
        if (typeof mc === 'string') return { slug: slugify(mc), label: sanitizeInput(mc, 100), children: [] };
        return {
          slug: mc.slug || slugify(mc.label || ''),
          label: sanitizeInput(mc.label || '', 100),
          ...(mc.description ? { description: sanitizeInput(mc.description, 2000) } : {}),
          ...(mc.exceptions ? { exceptions: sanitizeInput(mc.exceptions, 2000) } : {}),
          children: (mc.children || []).map(ch =>
            typeof ch === 'string'
              ? { slug: slugify(ch), label: sanitizeInput(ch, 100) }
              : {
                  slug: ch.slug || slugify(ch.label || ''),
                  label: sanitizeInput(ch.label || '', 100),
                  ...(ch.description ? { description: sanitizeInput(ch.description, 2000) } : {}),
                  ...(ch.exceptions ? { exceptions: sanitizeInput(ch.exceptions, 2000) } : {}),
                  ...(ch.fixed_loadout ? { fixed_loadout: ch.fixed_loadout } : {}),
                }
          ),
        };
      }),
      custom_genres: (gd.custom_genres || []).map(g => sanitizeInput(g, 60)).filter(Boolean),
      custom_platforms: (gd.custom_platforms || []).map(p => sanitizeInput(p, 60)).filter(Boolean),
      glitch_doc_links: gd.glitch_doc_links || null,
      involvement: gd.involvement || [],
    };
  }

  // Validate game name still present
  const finalName = updates.game_name || game.game_name;
  if (!finalName) return jsonResponse({ error: 'Game name is required' }, 400, env, request);

  const patchResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}`, {
      method: 'PATCH',
      body: updates,
    });

  if (!patchResult.ok) {
    console.error('Edit pending game error:', patchResult.data);
    return jsonResponse({ error: 'Failed to update submission' }, 500, env, request);
  }

  return jsonResponse({ ok: true, message: 'Game submission updated' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /withdraw-pending-game (User withdraws own pending game)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleWithdrawPendingGame(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id;
  if (!gameId) return jsonResponse({ error: 'Missing game_id' }, 400, env, request);
  if (!isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id format' }, 400, env, request);

  const gameResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}&select=submitted_by,status,claimed_by,claimed_at`, { method: 'GET' });
  if (!gameResult.ok || !gameResult.data?.length) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const game = gameResult.data[0];

  if (game.submitted_by !== auth.user.id) {
    return jsonResponse({ error: 'You can only withdraw your own submissions' }, 403, env, request);
  }
  if (game.status !== 'pending') {
    return jsonResponse({ error: 'Only pending submissions can be withdrawn' }, 400, env, request);
  }
  if (game.claimed_by && isClaimActive(game.claimed_at)) {
    return jsonResponse({ error: 'This submission is currently under review and cannot be withdrawn' }, 423, env, request);
  }

  const deleteResult = await supabaseQuery(env,
    `pending_games?id=eq.${encodeURIComponent(gameId)}`, { method: 'DELETE' });

  if (!deleteResult.ok) {
    console.error('Withdraw pending game error:', deleteResult.data);
    return jsonResponse({ error: 'Failed to withdraw submission' }, 500, env, request);
  }

  return jsonResponse({ ok: true, message: 'Game submission withdrawn' }, 200, env, request);
}
