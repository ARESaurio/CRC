/**
 * CRC Cloudflare Worker
 *
 * Endpoints:
 *   POST /                 Run submission (public, Turnstile-protected)
 *   POST /submit-game      Game submission (public, Turnstile-protected)
 *   POST /approve           Approve a pending run   (admin, JWT-verified)
 *   POST /approve-profile   Approve a pending profile (admin, JWT-verified)
 *   POST /approve-game      Approve a pending game  (admin, JWT-verified)
 *   POST /export-data       User data export        (authenticated, own data only)
 *
 * Secrets (set via wrangler secret put):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *   TURNSTILE_SECRET, VERIFY_API_KEY (optional)
 *   DISCORD_WEBHOOK_RUNS (optional), DISCORD_WEBHOOK_GAMES (optional),
 *   DISCORD_WEBHOOK_PROFILES (optional)
 *
 * No longer needed (Phase 3 — approvals write to Supabase, not GitHub):
 *   GITHUB_TOKEN, GITHUB_REPO
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

function corsHeaders(env, request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim());
  // SECURITY (Item 8): Only allow localhost in development mode
  const isDev = env.ENVIRONMENT === 'development';
  const isAllowed = allowed.includes(origin) ||
    (isDev && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowed[0] || 'https://www.challengerun.net',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body, status, env, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT SANITIZATION & VALIDATION (Items 10, 11)
// ═══════════════════════════════════════════════════════════════════════════════

/** Strip HTML tags and enforce max length */
function sanitizeInput(str, maxLength = 500) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')        // Strip HTML tags
    .replace(/javascript:/gi, '')    // Strip JS protocol
    .replace(/on\w+\s*=/gi, '')      // Strip event handlers
    .trim()
    .slice(0, maxLength);
}

/** Validate that a value looks like an integer ID (Item 11) */
function isValidId(id) {
  if (typeof id === 'number') return Number.isInteger(id) && id > 0;
  if (typeof id === 'string') {
    // Accept positive integers
    if (/^\d+$/.test(id) && parseInt(id) > 0) return true;
    // Accept UUIDs
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return true;
    // Accept slug-style IDs (e.g. "gary-asher", "hades-2")
    if (/^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$/i.test(id)) return true;
  }
  return false;
}

/** Validate that a URL is an allowed https video URL */
function isValidVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const allowedHosts = [
      'youtube.com', 'm.youtube.com', 'youtu.be',
      'twitch.tv', 'm.twitch.tv', 'player.twitch.tv',
      'bilibili.com', 'nicovideo.jp'
    ];
    return allowedHosts.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/** Validate a slug (lowercase alphanumeric + hyphens) */
function isValidSlug(s, minLen = 1, maxLen = 100) {
  if (!s || typeof s !== 'string') return false;
  return s.length >= minLen && s.length <= maxLen && /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(s);
}

/** Sanitize an array of strings */
function sanitizeArray(arr, maxItems = 20, maxItemLen = 200) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxItems).map(item =>
    typeof item === 'string' ? sanitizeInput(item, maxItemLen) : ''
  ).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING (Item 7) — combine with Cloudflare Rate Limiting Rules
// ═══════════════════════════════════════════════════════════════════════════════

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMITS = {
  '/': 5,               // 5 submissions/min/IP
  '/submit': 5,
  '/submit-game': 3,
  '/approve': 30,
  '/approve-profile': 30,
  '/reject-profile': 30,
  '/request-profile-changes': 30,
  '/approve-game': 30,
  '/notify': 10,
  '/export-data': 2,    // Heavy query — 2/min/IP
};

function checkRateLimit(ip, path) {
  const limit = RATE_LIMITS[path];
  if (!limit || !ip) return true;
  const key = `${ip}:${path}`;
  const now = Date.now();
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  const entry = rateLimitMap.get(key);
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.windowStart = now;
    return true;
  }
  entry.count++;
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap) {
      if (now - v.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
    }
  }
  return entry.count <= limit;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TURNSTILE
// ═══════════════════════════════════════════════════════════════════════════════

async function verifyTurnstile(token, env, ip) {
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
  const data = await res.json();
  return data.success === true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Service-role query helper */
async function supabaseQuery(env, path, { method = 'GET', body, headers: extra } = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
    ...extra,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

/** Verify a Supabase access token → returns user object or null */
async function verifySupabaseToken(env, accessToken) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Check if user is admin (is_admin in runner_profiles OR can_manage_moderators in moderators) */
async function isAdmin(env, userId) {
  // Check runner_profiles.is_admin
  const profile = await supabaseQuery(env,
    `runner_profiles?user_id=eq.${encodeURIComponent(userId)}&select=is_admin,runner_id`, { method: 'GET' });
  if (profile.ok && Array.isArray(profile.data) && profile.data.length > 0) {
    if (profile.data[0].is_admin === true) return { admin: true, runnerId: profile.data[0].runner_id };
  }

  // Check moderators table
  const mod = await supabaseQuery(env,
    `moderators?user_id=eq.${encodeURIComponent(userId)}&select=can_manage_moderators,assigned_games`, { method: 'GET' });
  if (mod.ok && Array.isArray(mod.data) && mod.data.length > 0) {
    return {
      admin: mod.data[0].can_manage_moderators === true,
      verifier: true,
      assignedGames: mod.data[0].assigned_games || [],
      runnerId: profile.data?.[0]?.runner_id || null,
    };
  }

  return { admin: false, verifier: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB HELPERS — REMOVED (Phase 3: approvals write to Supabase directly)
// The githubCreateFile() function previously lived here. It is no longer
// called by any approval endpoint.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// DISCORD WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════════

/** Pick the right Discord webhook URL for the notification type */
function getWebhookUrl(env, channel) {
  switch (channel) {
    case 'runs':     return env.DISCORD_WEBHOOK_RUNS;
    case 'games':    return env.DISCORD_WEBHOOK_GAMES;
    case 'profiles': return env.DISCORD_WEBHOOK_PROFILES;
    default:         return env.DISCORD_WEBHOOK_RUNS || env.DISCORD_WEBHOOK_PROFILES || env.DISCORD_WEBHOOK_GAMES;
  }
}

async function sendDiscordNotification(env, channel, embed) {
  const webhookUrl = getWebhookUrl(env, channel);
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'CRC Bot',
        embeds: [embed],
      }),
    });
  } catch (err) {
    console.error('Discord webhook error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLUG HELPER
// ═══════════════════════════════════════════════════════════════════════════════

function slugify(s) {
  return (s || '').toLowerCase()
    .replace(/['']/g, '')
    .replace(/%/g, '-percent')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

// yamlQuote — REMOVED (was only used by markdown file builders)

function generateSubmissionId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sub_${ts}_${rand}`;
}


// ═══════════════════════════════════════════════════════════════════════════════
// FILE BUILDERS — REMOVED (Phase 3: approvals write to Supabase directly)
// buildRunFileContent, buildRunFilename, buildRunnerFileContent,
// buildGameFileContent previously lived here. Approvals now INSERT into
// the Supabase `runs`, `runners`, and `games` tables.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

async function authenticateAdmin(env, body) {
  const token = body.token;
  if (!token) return { error: 'Missing token', status: 401 };

  const user = await verifySupabaseToken(env, token);
  if (!user?.id) return { error: 'Invalid or expired token', status: 401 };

  const role = await isAdmin(env, user.id);
  if (!role.admin && !role.verifier) {
    return { error: 'Insufficient permissions', status: 403 };
  }

  return { user, role };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH HELPER: Authenticate any signed-in user (no role required)
// ═══════════════════════════════════════════════════════════════════════════════

async function authenticateUser(env, body) {
  const token = body.token;
  if (!token) return { error: 'Missing token', status: 401 };

  const user = await verifySupabaseToken(env, token);
  if (!user?.id) return { error: 'Invalid or expired token', status: 401 };

  return { user };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST / (Run submission)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRunSubmission(body, env, request) {
  // Validate required fields
  const required = ['game_id', 'category_slug', 'runner_id', 'video_url'];
  for (const field of required) {
    if (!body[field]) {
      return jsonResponse({ error: `Missing required field: ${field}` }, 400, env, request);
    }
  }

  // SECURITY (Item 10): Server-side input validation
  if (!isValidSlug(body.game_id, 1, 100)) {
    return jsonResponse({ error: 'Invalid game_id format' }, 400, env, request);
  }
  if (!isValidSlug(body.runner_id, 3, 50)) {
    return jsonResponse({ error: 'Invalid runner_id format' }, 400, env, request);
  }
  if (!isValidSlug(body.category_slug, 1, 100)) {
    return jsonResponse({ error: 'Invalid category_slug format' }, 400, env, request);
  }
  if (!isValidVideoUrl(body.video_url)) {
    return jsonResponse({ error: 'Invalid video URL. Must be YouTube, Twitch, Bilibili, or Nicovideo.' }, 400, env, request);
  }

  // Verify Turnstile
  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstile_token, env, ip);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Captcha verification failed' }, 403, env, request);
  }

  // Build the Supabase row (with sanitized inputs — Item 10)
  const submissionId = generateSubmissionId();
  const row = {
    game_id: sanitizeInput(body.game_id, 100),
    runner_id: sanitizeInput(body.runner_id, 50),
    category_tier: sanitizeInput(body.category_tier || 'full_runs', 50),
    category_slug: sanitizeInput(body.category_slug, 100),
    standard_challenges: sanitizeArray(body.standard_challenges),
    community_challenge: body.community_challenge ? sanitizeInput(body.community_challenge, 200) : null,
    character: body.character ? sanitizeInput(body.character, 100) : null,
    glitch_id: body.glitch_id ? sanitizeInput(body.glitch_id, 50) : null,
    restrictions: sanitizeArray(body.restrictions),
    video_url: body.video_url,
    video_host: body.video_host ? sanitizeInput(body.video_host, 50) : null,
    video_id: body.video_id ? sanitizeInput(body.video_id, 100) : null,
    date_completed: body.date_completed ? sanitizeInput(body.date_completed, 10) : null,
    run_time: body.run_time ? sanitizeInput(body.run_time, 20) : null,
    additional_runners: body.additional_runners || null,
    status: 'pending',
    submission_id: submissionId,
    submitted_at: new Date().toISOString(),
    source: sanitizeInput(body.source || 'site_form', 30),
  };

  const result = await supabaseQuery(env, 'pending_runs', {
    method: 'POST',
    body: row,
  });

  if (!result.ok) {
    console.error('Supabase insert error:', result.data);
    return jsonResponse({ error: 'Failed to save submission' }, 500, env, request);
  }

  // Discord notification for new submission
  await sendDiscordNotification(env, 'runs', {
    title: '📥 New Run Submitted',
    color: 0xf0ad4e,
    fields: [
      { name: 'Game', value: body.game_id, inline: true },
      { name: 'Runner', value: body.runner_id, inline: true },
      { name: 'Category', value: body.category_slug, inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({
    ok: true,
    submission_id: submissionId,
    message: 'Run submitted successfully',
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /submit-game (Game submission)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleGameSubmission(body, env, request) {
  // Validate required fields
  if (!body.game_name) {
    return jsonResponse({ error: 'Game name is required' }, 400, env, request);
  }

  // SECURITY (Item 10): Sanitize game name
  const gameName = sanitizeInput(body.game_name, 200);
  if (!gameName) {
    return jsonResponse({ error: 'Invalid game name' }, 400, env, request);
  }

  // Verify Turnstile
  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstile_token, env, ip);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Captcha verification failed' }, 403, env, request);
  }

  const gameId = body.game_id ? sanitizeInput(body.game_id, 100) : slugify(gameName);

  // Check if game_id already exists in pending_games
  const existing = await supabaseQuery(env,
    `pending_games?game_id=eq.${encodeURIComponent(gameId)}&status=neq.rejected&select=id`,
    { method: 'GET' });
  if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
    return jsonResponse({ error: 'A game with this ID is already pending or approved' }, 409, env, request);
  }

  const row = {
    game_id: gameId,
    game_name: gameName,
    submitter_handle: body.submitter_handle ? sanitizeInput(body.submitter_handle, 100) : null,
    submitter_user_id: body.submitter_user_id || null,
    status: 'pending',
    submitted_at: new Date().toISOString(),
    game_data: {
      game_name_aliases: body.aliases || [],
      genres: body.genres || [],
      platforms: body.platforms || [],
      timing_method: body.timing_method || 'RTA',
      is_modded: body.is_modded || false,
      base_game: body.base_game || null,
      character_column: {
        enabled: body.character_enabled || false,
        label: body.character_label || 'Character',
      },
      characters_data: body.characters || [],
      challenges_data: (body.challenges || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: c } : c
      ),
      restrictions_data: (body.restrictions || []).map(r =>
        typeof r === 'string' ? { slug: slugify(r), label: r } : r
      ),
      glitches_data: (body.glitches || []).map(g =>
        typeof g === 'string' ? { slug: slugify(g), label: g } : g
      ),
      full_runs: (body.full_run_categories || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: c } : c
      ),
      mini_challenges: (body.mini_challenges || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: c } : c
      ),
      general_rules: body.general_rules || null,
      description: body.description || null,
    },
  };

  const result = await supabaseQuery(env, 'pending_games', {
    method: 'POST',
    body: row,
  });

  if (!result.ok) {
    console.error('Supabase insert error:', result.data);
    return jsonResponse({ error: 'Failed to save game submission' }, 500, env, request);
  }

  // Discord notification
  await sendDiscordNotification(env, 'games', {
    title: '🎮 New Game Submitted',
    color: 0x5865f2,
    fields: [
      { name: 'Game', value: body.game_name, inline: true },
      { name: 'ID', value: gameId, inline: true },
      { name: 'Categories', value: `${(body.full_run_categories || []).length} full runs`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({
    ok: true,
    game_id: gameId,
    message: 'Game submitted for review',
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /approve (Approve a run)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleApproveRun(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const runId = body.run_id;
  if (!runId) return jsonResponse({ error: 'Missing run_id' }, 400, env, request);

  // SECURITY (Item 11): Validate ID format
  if (!isValidId(runId)) {
    return jsonResponse({ error: 'Invalid run_id format' }, 400, env, request);
  }

  // Fetch the pending run
  const runResult = await supabaseQuery(env,
    `pending_runs?id=eq.${encodeURIComponent(runId)}&select=*`, { method: 'GET' });
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

  const now = new Date().toISOString();

  // Insert into the live `runs` table
  const runsInsert = await supabaseQuery(env, 'runs', {
    method: 'POST',
    body: {
      game_id: run.game_id,
      runner_id: run.runner_id,
      category_tier: run.category_tier || 'full_runs',
      category_slug: run.category_slug,
      standard_challenges: run.standard_challenges || [],
      community_challenge: run.community_challenge || null,
      character: run.character || null,
      glitch_id: run.glitch_id || null,
      restrictions: run.restrictions || [],
      runner: run.runner_id,
      video_url: run.video_url,
      video_host: run.video_host || null,
      video_id: run.video_id || null,
      time_primary: run.run_time || null,
      timing_method_primary: run.timing_method_primary || null,
      date_completed: run.date_completed || null,
      run_time: run.run_time || null,
      additional_runners: run.additional_runners || null,
      submission_id: run.submission_id,
      submitted_at: run.submitted_at,
      date_submitted: run.date_completed || null,
      source: run.source || 'site_form',
      status: 'approved',
      verified: true,
      verified_by: auth.role.runnerId || auth.user.id,
      verified_at: now,
      verifier_notes: body.notes || null,
    },
  });

  if (!runsInsert.ok) {
    console.error('Failed to insert approved run:', runsInsert.data);
    return jsonResponse({ error: 'Failed to approve run. Please try again.' }, 500, env, request);
  }

  // Update pending_runs status
  await supabaseQuery(env,
    `pending_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        status: 'verified',
        verified_by: auth.user.id,
        verified_at: now,
        verifier_notes: body.notes || null,
      },
    });

  // Discord notification
  await sendDiscordNotification(env, 'runs', {
    title: '✅ Run Approved',
    color: 0x28a745,
    fields: [
      { name: 'Game', value: run.game_id, inline: true },
      { name: 'Runner', value: run.runner_id, inline: true },
      { name: 'Category', value: run.category_slug, inline: true },
      { name: 'Video', value: run.video_url || '—', inline: false },
    ],
    timestamp: now,
  });

  return jsonResponse({
    ok: true,
    message: 'Run approved — visible on site immediately',
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /approve-profile
// ═══════════════════════════════════════════════════════════════════════════════

async function handleApproveProfile(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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
    // Full profile — create runners + runner_profiles rows
    const runnersUpsert = await supabaseQuery(env, 'runners', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: {
        runner_id: runnerId,
        runner_name: profile.display_name || runnerId,
        display_name: profile.display_name || null,
        avatar: profile.avatar_url || null,
        joined_date: new Date().toISOString().slice(0, 10),
        pronouns: profile.pronouns || null,
        location: profile.location || null,
        status: 'active',
        bio: profile.bio || null,
        socials: profile.socials || {},
        user_id: profile.user_id || null,
        updated_at: now,
      },
    });

    if (!runnersUpsert.ok) {
      console.error('Failed to upsert runner:', runnersUpsert.data);
      return jsonResponse({ error: 'Failed to approve profile. Please try again.' }, 500, env, request);
    }

    // Upsert into runner_profiles (create the approved profile row)
    const rpUpsert = await supabaseQuery(env, 'runner_profiles', {
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
      console.error('Failed to upsert runner_profiles:', rpUpsert.data);
    }
  }
  // If no runnerId, we just mark pending_profiles as approved below.
  // When the user later fills out the profile form, they'll be pre-approved.

  // Update pending_profiles status
  await supabaseQuery(env,
    `pending_profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: {
        status: 'approved',
        reviewed_by: auth.user.id,
        reviewed_at: now,
        reviewer_notes: body.notes || null,
      },
    });

  // Discord notification
  const approvalType = runnerId ? 'Profile' : 'Account (no profile yet)';
  await sendDiscordNotification(env, 'profiles', {
    title: '👤 Profile Approved',
    color: 0x28a745,
    fields: [
      { name: 'Runner', value: profile.display_name || runnerId || 'No profile yet', inline: true },
      { name: 'ID', value: runnerId || 'N/A', inline: true },
      { name: 'Type', value: approvalType, inline: true },
    ],
    timestamp: now,
  });

  return jsonResponse({
    ok: true,
    message: 'Profile approved — visible on site immediately',
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /reject-profile
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRejectProfile(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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

  return jsonResponse({ ok: true, message: 'Profile rejected.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /request-profile-changes
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRequestProfileChanges(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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

  await sendDiscordNotification(env, 'profiles', {
    title: '✏️ Profile Changes Requested',
    color: 0x17a2b8,
    fields: [
      { name: 'Profile ID', value: profileId, inline: true },
      { name: 'Notes', value: notes, inline: false },
    ],
    timestamp: now,
  });

  return jsonResponse({ ok: true, message: 'Changes requested.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /approve-game
// ═══════════════════════════════════════════════════════════════════════════════

async function handleApproveGame(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const gameId = body.game_id;
  if (!gameId) return jsonResponse({ error: 'Missing game_id' }, 400, env, request);

  // SECURITY (Item 11): Validate ID format
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
  if (game.submitter_user_id) {
    const profileResult = await supabaseQuery(env,
      `runner_profiles?user_id=eq.${encodeURIComponent(game.submitter_user_id)}&select=runner_id`,
      { method: 'GET' });
    if (profileResult.ok && profileResult.data?.length) {
      submitterRunnerId = profileResult.data[0].runner_id;
    }
  }

  const now = new Date().toISOString();
  const initial = (game.game_id || 'x')[0].toLowerCase();

  // Build credits array
  const credits = [];
  if (game.submitter_handle || submitterRunnerId) {
    credits.push({
      name: game.submitter_handle || submitterRunnerId,
      runner_id: submitterRunnerId || undefined,
      role: 'Game submission',
    });
  }

  // Insert into the live `games` table
  const gamesInsert = await supabaseQuery(env, 'games', {
    method: 'POST',
    body: {
      game_id: game.game_id,
      game_name: game.game_name,
      game_name_aliases: gd.game_name_aliases || [],
      status: 'Active',
      reviewers: [],
      is_modded: gd.is_modded || false,
      base_game: gd.base_game || null,
      genres: gd.genres || [],
      platforms: gd.platforms || [],
      tabs: {
        overview: true, runs: true, rules: true,
        history: false, resources: false, forum: false,
        extra_1: false, extra_2: false,
      },
      general_rules: gd.general_rules || '',
      challenges_data: gd.challenges_data || [],
      restrictions_data: gd.restrictions_data || [],
      glitches_data: gd.glitches_data || [],
      full_runs: gd.full_runs || [],
      mini_challenges: gd.mini_challenges || [],
      player_made: [],
      character_column: gd.character_column || { enabled: false, label: 'Character' },
      characters_data: gd.characters_data || [],
      timing_method: gd.timing_method || 'RTA',
      community_achievements: [],
      credits: credits,
      cover: `/img/games/${initial}/${game.game_id}.jpg`,
      cover_position: 'center',
      content: gd.description || `${game.game_name} challenge runs.`,
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
    color: 0x28a745,
    fields: [
      { name: 'Game', value: game.game_name, inline: true },
      { name: 'ID', value: game.game_id, inline: true },
    ],
    footer: { text: 'Game page is live immediately' },
    timestamp: now,
  });

  return jsonResponse({
    ok: true,
    message: 'Game approved — visible on site immediately',
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /notify (send Discord notification for reject/changes)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleNotify(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { action, entity_type, entity_name, entity_id, reason, notes } = body;
  if (!action || !entity_type) {
    return jsonResponse({ error: 'Missing action or entity_type' }, 400, env, request);
  }

  const colors = { rejected: 0xdc3545, needs_changes: 0x17a2b8, approved: 0x28a745 };
  const icons = { rejected: '❌', needs_changes: '✏️', approved: '✅' };
  const typeLabels = { run: '🏃 Run', profile: '👤 Profile', game: '🎮 Game' };

  const fields = [
    { name: 'Type', value: typeLabels[entity_type] || entity_type, inline: true },
    { name: 'Name', value: entity_name || entity_id || '—', inline: true },
  ];
  if (reason) fields.push({ name: 'Reason', value: reason, inline: false });
  if (notes) fields.push({ name: 'Notes', value: notes, inline: false });

  // Route to the right channel based on entity type
  const channelMap = { run: 'runs', profile: 'profiles', game: 'games' };
  const channel = channelMap[entity_type] || 'runs';

  await sendDiscordNotification(env, channel, {
    title: `${icons[action] || '📢'} ${(action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${entity_name || entity_id || 'Unknown'}`,
    color: colors[action] || 0x6c757d,
    fields,
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({ ok: true }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /export-data (User data export — GDPR/CCPA compliance)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleDataExport(body, env, request) {
  // Authenticate — any signed-in user can export their own data
  const auth = await authenticateUser(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const userId = auth.user.id;
  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    categories_collected: [
      'Profile information (display name, bio, social links)',
      'Run submissions and gaming activity',
      'Account connections (Discord, Twitch)',
      'Support communications',
      'Moderation history (if applicable)',
    ],
    sections: {},
  };

  // 1. Profile
  const profile = await supabaseQuery(env,
    `runner_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.profile = profile.ok ? (profile.data || []) : [];

  // 2. Pending profiles (in-progress profile edits)
  const pendingProfiles = await supabaseQuery(env,
    `pending_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.pending_profiles = pendingProfiles.ok ? (pendingProfiles.data || []) : [];

  // 3. Pending run submissions
  const runs = await supabaseQuery(env,
    `pending_runs?submitted_by=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.pending_runs = runs.ok ? (runs.data || []) : [];

  // 3b. Approved runs (GDPR Article 15 — all personal data must be included)
  const runnerId = profile.ok && profile.data?.[0]?.runner_id;
  if (runnerId) {
    const approvedRuns = await supabaseQuery(env,
      `runs?runner_id=eq.${encodeURIComponent(runnerId)}&select=*`, { method: 'GET' });
    exportData.sections.approved_runs = approvedRuns.ok ? (approvedRuns.data || []) : [];

    // 3c. Achievements
    const achievements = await supabaseQuery(env,
      `achievements?runner_id=eq.${encodeURIComponent(runnerId)}&select=*`, { method: 'GET' });
    exportData.sections.achievements = achievements.ok ? (achievements.data || []) : [];
  }

  // 4. Linked accounts
  const linked = await supabaseQuery(env,
    `linked_accounts?user_id=eq.${encodeURIComponent(userId)}&select=provider,provider_username,created_at`, { method: 'GET' });
  exportData.sections.linked_accounts = linked.ok ? (linked.data || []) : [];

  // 5. Game submissions
  const games = await supabaseQuery(env,
    `pending_games?submitter_user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.game_submissions = games.ok ? (games.data || []) : [];

  // 6. Game update requests
  const updates = await supabaseQuery(env,
    `game_update_requests?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.game_update_requests = updates.ok ? (updates.data || []) : [];

  // 7. Support tickets
  const tickets = await supabaseQuery(env,
    `support_tickets?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.support_tickets = tickets.ok ? (tickets.data || []) : [];

  // 8. Ticket messages
  const messages = await supabaseQuery(env,
    `ticket_messages?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.ticket_messages = messages.ok ? (messages.data || []) : [];

  // 9. Profile audit log (actions performed on this user's profile)
  if (runnerId) {
    const audit = await supabaseQuery(env,
      `profile_audit_log?runner_id=eq.${encodeURIComponent(runnerId)}&select=*`, { method: 'GET' });
    exportData.sections.audit_log = audit.ok ? (audit.data || []) : [];
  }

  // 10. Moderator record (if they are one)
  const modRecord = await supabaseQuery(env,
    `moderators?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  if (modRecord.ok && modRecord.data?.length > 0) {
    exportData.sections.moderator_record = modRecord.data;
  }

  return jsonResponse(exportData, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, env, request);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, env, request);
    }

    const url = new URL(request.url);
    const rawPath = url.pathname.replace(/\/+$/, '') || '/';
    // Support both /approve-profile and /admin/approve-profile
    const path = rawPath.replace(/^\/admin/, '');

    // SECURITY (Item 7): Rate limiting
    const clientIp = request.headers.get('CF-Connecting-IP') || '';
    if (!checkRateLimit(clientIp, path)) {
      return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429, env, request);
    }

    try {
      switch (path) {
        case '/':
        case '/submit':
          return handleRunSubmission(body, env, request);

        case '/submit-game':
          return handleGameSubmission(body, env, request);

        case '/approve':
          return handleApproveRun(body, env, request);

        case '/approve-profile':
          return handleApproveProfile(body, env, request);

        case '/reject-profile':
          return handleRejectProfile(body, env, request);

        case '/request-profile-changes':
          return handleRequestProfileChanges(body, env, request);

        case '/approve-game':
          return handleApproveGame(body, env, request);

        case '/notify':
          return handleNotify(body, env, request);

        case '/export-data':
          return handleDataExport(body, env, request);

        default:
          return jsonResponse({ error: 'Not found' }, 404, env, request);
      }
    } catch (err) {
      console.error('Unhandled error:', err);
      return jsonResponse({ error: 'Internal error' }, 500, env, request);
    }
  },
};
