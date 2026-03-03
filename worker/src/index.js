/**
 * CRC Cloudflare Worker
 *
 * Endpoints:
 *   POST /                 Run submission (public, Turnstile-protected)
 *   POST /submit-game      Game submission (public, Turnstile-protected)
 *   POST /approve           Approve a pending run   (admin, JWT-verified)
 *   POST /approve-profile   Approve a pending profile (admin, JWT-verified)
 *   POST /approve-game      Approve a pending game  (admin, JWT-verified)
 *   POST /assign-role       Assign user roles       (moderator+, hierarchical)
 *   POST /export-data       User data export        (authenticated, own data only)
 *   POST /game-editor/save     Game editor save     (admin/moderator, field-restricted)
 *   POST /game-editor/freeze   Freeze/unfreeze game (admin only)
 *   POST /game-editor/delete   Delete game          (super admin only)
 *   POST /game-editor/rollback Rollback to snapshot  (admin/moderator)
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
      'bilibili.com'
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
// RATE LIMITING (Item 7) — KV-backed global rate limiting
// ═══════════════════════════════════════════════════════════════════════════════
// Primary: Cloudflare KV (global, persists across isolate restarts)
// Fallback: In-memory Map (per-isolate, resets on cold start)
// KV is eventually consistent (~60s), which is acceptable for rate limiting —
// worst case a few extra requests sneak through during propagation.

const rateLimitMap = new Map(); // fallback when KV is unavailable
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_TTL = 120;       // KV TTL in seconds (2x window for safety)
const RATE_LIMITS = {
  '/': 5,               // 5 submissions/min/IP
  '/submit': 5,
  '/submit-game': 3,
  '/approve': 30,
  '/approve-run': 30,
  '/reject-run': 30,
  '/request-changes': 30,
  '/edit-approved-run': 20,
  '/verify-run': 30,
  '/unverify-run': 10,
  '/approve-profile': 30,
  '/reject-profile': 30,
  '/request-profile-changes': 30,
  '/approve-game': 30,
  '/assign-role': 10,
  '/notify': 10,
  '/export-data': 2,    // Heavy query — 2/min/IP
  '/game-editor/save': 20,      // 20 saves/min/IP
  '/game-editor/freeze': 10,
  '/game-editor/delete': 3,
  '/game-editor/rollback': 5,
};

async function checkRateLimit(ip, path, env) {
  const limit = RATE_LIMITS[path];
  if (!limit || !ip) return true;
  const key = `rl:${ip}:${path}`;
  const now = Date.now();

  // ── Try KV first (global rate limiting) ──────────────────────────────────
  if (env.RATE_LIMIT_KV) {
    try {
      const raw = await env.RATE_LIMIT_KV.get(key);
      let entry = raw ? JSON.parse(raw) : null;

      if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        // New window — reset counter
        entry = { count: 1, windowStart: now };
      } else {
        entry.count++;
      }

      // Write back (non-blocking — don't await, fire and forget)
      env.RATE_LIMIT_KV.put(key, JSON.stringify(entry), { expirationTtl: RATE_LIMIT_TTL });

      return entry.count <= limit;
    } catch (err) {
      console.error('KV rate limit error, falling back to in-memory:', err);
      // Fall through to in-memory
    }
  }

  // ── Fallback: in-memory per-isolate rate limiting ────────────────────────
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

/** Check user roles: admin, moderator, verifier (with per-game assignments) */
async function isAdmin(env, userId) {
  const encodedUserId = encodeURIComponent(userId);

  // Query profile and both role tables in parallel
  const [profile, verifierResult, moderatorResult] = await Promise.all([
    supabaseQuery(env,
      `profiles?user_id=eq.${encodedUserId}&select=is_admin,is_super_admin,runner_id,role`, { method: 'GET' }),
    supabaseQuery(env,
      `role_game_verifiers?user_id=eq.${encodedUserId}&select=game_id`, { method: 'GET' }),
    supabaseQuery(env,
      `role_game_moderators?user_id=eq.${encodedUserId}&select=game_id`, { method: 'GET' })
  ]);

  // Collect per-game assignments
  const verifierGameIds = (verifierResult.ok && Array.isArray(verifierResult.data))
    ? verifierResult.data.map(r => r.game_id).filter(Boolean) : [];
  const moderatorGameIds = (moderatorResult.ok && Array.isArray(moderatorResult.data))
    ? moderatorResult.data.map(r => r.game_id).filter(Boolean) : [];
  const assignedGames = [...new Set([...verifierGameIds, ...moderatorGameIds])];

  // Build role flags from profile
  let isAdminFlag = false;
  let isSuperAdmin = false;
  let isModerator = false;
  let runnerId = null;

  if (profile.ok && Array.isArray(profile.data) && profile.data.length > 0) {
    const p = profile.data[0];
    isSuperAdmin = p.is_super_admin === true;
    isAdminFlag = p.is_admin === true || isSuperAdmin;
    isModerator = p.role === 'moderator';
    runnerId = p.runner_id;
  }

  const hasVerifierRole = verifierGameIds.length > 0;
  const hasModeratorRole = moderatorGameIds.length > 0 || isModerator;

  return {
    admin: isAdminFlag,
    superAdmin: isSuperAdmin,
    moderator: hasModeratorRole,
    verifier: hasVerifierRole,
    runnerId,
    assignedGames
  };
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
  if (!role.admin && !role.verifier && !role.moderator) {
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
  // ── 1. Authenticate user ──────────────────────────────────────────────────
  const auth = await authenticateUser(env, body);
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
    glitch_id:            body.glitch_id ? sanitizeInput(body.glitch_id, 50) : null,
    restrictions:         sanitizeArray(body.restrictions),
    platform:             body.platform ? sanitizeInput(body.platform, 50) : null,
    video_url:            body.video_url,
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
    color: 0xf0ad4e,
    fields: [
      { name: 'Game', value: body.game_id, inline: true },
      { name: 'Runner', value: profile.runner_id, inline: true },
      { name: 'Category', value: category, inline: true },
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
  // ── 1. Authenticate user ────────────────────────────────────────────────
  const auth = await authenticateUser(env, body);
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
    status: 'pending',
    // Rich structured data in JSONB
    game_data: {
      timing_method: body.timing_method || 'RTA',
      character_column: {
        enabled: body.character_enabled || false,
        label: sanitizeInput(body.character_label || 'Character', 50),
      },
      characters_data: (body.characters || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
      challenges_data: (body.challenges || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
      restrictions_data: (body.restrictions || []).map(r =>
        typeof r === 'string' ? { slug: slugify(r), label: sanitizeInput(r, 100) } : r
      ),
      glitches_data: (body.glitches || []).map(g =>
        typeof g === 'string' ? { slug: slugify(g), label: sanitizeInput(g, 100) } : g
      ),
      full_runs: (body.full_run_categories || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
      mini_challenges: (body.mini_challenges || []).map(c =>
        typeof c === 'string' ? { slug: slugify(c), label: sanitizeInput(c, 100) } : c
      ),
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
    title: '🎮 New Game Submitted',
    color: 0x5865f2,
    fields: [
      { name: 'Game', value: gameName, inline: true },
      { name: 'ID', value: gameId, inline: true },
      { name: 'Categories', value: `${(body.full_run_categories || []).length} full, ${(body.mini_challenges || []).length} mini`, inline: true },
      { name: 'Platforms', value: `${(body.platforms || []).length} selected`, inline: true },
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

  const now = new Date().toISOString();

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
      glitch_id: run.glitch_id || null,
      restrictions: run.restrictions || [],
      runner: run.runner_id,
      video_url: run.video_url,
      video_host: run.video_host || null,
      video_id: run.video_id || null,
      time_primary: run.time_primary || run.time_rta || null,
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
    color: 0x28a745,
    fields: [
      { name: 'Game', value: run.game_id, inline: true },
      { name: 'Runner', value: run.runner_id, inline: true },
      { name: 'Category', value: run.category || '—', inline: true },
      { name: 'Video', value: run.video_url || '—', inline: false },
      { name: 'Status', value: 'Published (unverified)', inline: true },
    ],
    timestamp: now,
  });

  return jsonResponse({
    ok: true,
    message: 'Run published — visible on site. Awaiting game moderator verification.',
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

  // Insert into the live `games` table — pull rich data from game_data JSONB
  const gamesInsert = await supabaseQuery(env, 'games', {
    method: 'POST',
    body: {
      game_id: game.game_id,
      game_name: game.game_name,
      game_name_aliases: game.game_name_aliases || [],
      status: 'Active',
      reviewers: [],
      is_modded: false,
      base_game: null,
      genres: game.genres || [],
      platforms: game.platforms || [],
      tabs: {
        overview: true, runs: true, rules: true,
        history: false, resources: false, forum: false,
        extra_1: false, extra_2: false,
      },
      general_rules: game.rules || '',
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
// ENDPOINT: POST /reject-run
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRejectRun(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const runId = body.run_id;
  if (!runId) return jsonResponse({ error: 'Missing run_id' }, 400, env, request);
  if (!isValidId(runId)) return jsonResponse({ error: 'Invalid run_id format' }, 400, env, request);

  // Fetch run to check game-level permissions
  const runResult = await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}&select=game_id`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }

  // Check verifier permissions
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(runResult.data[0].game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
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
    color: 0xdc3545,
    fields: [
      { name: 'Run ID', value: runId, inline: true },
      { name: 'Reason', value: reason, inline: false },
      ...(notes ? [{ name: 'Notes', value: notes, inline: false }] : []),
    ],
    timestamp: now,
  });

  return jsonResponse({ ok: true, message: 'Run rejected.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /request-changes (request changes on a run)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRequestRunChanges(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const runId = body.run_id;
  if (!runId) return jsonResponse({ error: 'Missing run_id' }, 400, env, request);
  if (!isValidId(runId)) return jsonResponse({ error: 'Invalid run_id format' }, 400, env, request);

  const notes = body.notes;
  if (!notes) return jsonResponse({ error: 'Notes are required' }, 400, env, request);

  // Fetch run to check game-level permissions
  const runResult = await supabaseQuery(env,
    `pending_runs?public_id=eq.${encodeURIComponent(runId)}&select=game_id`, { method: 'GET' });
  if (!runResult.ok || !runResult.data?.length) {
    return jsonResponse({ error: 'Run not found' }, 404, env, request);
  }

  // Check verifier permissions
  if (auth.role.verifier && !auth.role.admin) {
    if (!auth.role.assignedGames?.includes(runResult.data[0].game_id)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
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

  return jsonResponse({ ok: true, message: 'Changes requested.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /edit-approved-run (Edit a run in the live `runs` table)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleEditApprovedRun(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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
    'character', 'standard_challenges', 'glitch_id', 'restrictions',
    'time_primary', 'run_time', 'date_completed', 'date_submitted',
    'video_url', 'runner_notes', 'verifier_notes'
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

async function handleVerifyRun(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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
    color: 0x28a745,
    fields: [
      { name: 'Game', value: run.game_id, inline: true },
      { name: 'Runner', value: run.runner_id, inline: true },
      { name: 'Verified By', value: auth.role.runnerId || 'Admin', inline: true },
      ...(body.notes ? [{ name: 'Notes', value: body.notes, inline: false }] : []),
    ],
    timestamp: now,
  });

  return jsonResponse({ ok: true, message: 'Run verified.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /unverify-run (Revoke verification — mod needs to re-review)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleUnverifyRun(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /reject-game
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRejectGame(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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

  return jsonResponse({ ok: true, message: 'Game rejected.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /request-game-changes
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRequestGameChanges(body, env, request) {
  const auth = await authenticateAdmin(env, body);
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

  await sendDiscordNotification(env, 'games', {
    title: '✏️ Game Changes Requested',
    color: 0x17a2b8,
    fields: [
      { name: 'Game ID', value: gameId, inline: true },
      { name: 'Notes', value: notes, inline: false },
    ],
    timestamp: now,
  });

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
function getRoleLevel(roleObj) {
  if (roleObj.superAdmin) return 4;
  if (roleObj.admin) return 3;
  if (roleObj.moderator) return 2;
  if (roleObj.verifier) return 1;
  return 0;
}

function targetRoleLevel(roleName) {
  switch (roleName) {
    case 'admin': return 3;
    case 'moderator': return 2;
    case 'verifier': return 1;
    case 'user': return 0;
    default: return -1;
  }
}

async function handleAssignRole(body, env, request) {
  // 1. Authenticate the caller
  const token = body.token;
  if (!token) return jsonResponse({ error: 'Missing token' }, 401, env, request);

  const callerUser = await verifySupabaseToken(env, token);
  if (!callerUser?.id) return jsonResponse({ error: 'Invalid or expired token' }, 401, env, request);

  const callerRole = await isAdmin(env, callerUser.id);
  const callerLevel = getRoleLevel(callerRole);

  // Minimum: moderator can assign verifier
  if (callerLevel < 2) {
    return jsonResponse({ error: 'Insufficient permissions. Moderator or higher required.' }, 403, env, request);
  }

  // 2. Validate input
  const { target_user_id, new_role, game_ids } = body;
  if (!target_user_id || typeof target_user_id !== 'string') {
    return jsonResponse({ error: 'Missing target_user_id' }, 400, env, request);
  }
  if (!new_role || typeof new_role !== 'string') {
    return jsonResponse({ error: 'Missing new_role' }, 400, env, request);
  }

  const validRoles = ['admin', 'moderator', 'verifier', 'user'];
  if (!validRoles.includes(new_role)) {
    return jsonResponse({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, 400, env, request);
  }

  // 3. Cannot assign super_admin
  if (new_role === 'super_admin') {
    return jsonResponse({ error: 'Cannot assign super_admin role via this endpoint' }, 403, env, request);
  }

  // 4. Caller can only assign roles STRICTLY below their own level
  const newLevel = targetRoleLevel(new_role);
  if (newLevel >= callerLevel) {
    return jsonResponse({ error: 'Cannot assign a role equal to or above your own' }, 403, env, request);
  }

  // 5. Cannot modify someone at or above your own level
  const targetRole = await isAdmin(env, target_user_id);
  const targetCurrentLevel = getRoleLevel(targetRole);
  if (targetCurrentLevel >= callerLevel) {
    return jsonResponse({ error: 'Cannot modify a user at or above your own role level' }, 403, env, request);
  }

  // 6. Cannot modify yourself
  if (target_user_id === callerUser.id) {
    return jsonResponse({ error: 'Cannot change your own role' }, 403, env, request);
  }

  // 7. Apply the role change
  try {
    // Build profile update based on new role
    let profileUpdate = {};
    switch (new_role) {
      case 'admin':
        profileUpdate = { is_admin: true, is_super_admin: false, role: 'admin' };
        break;
      case 'moderator':
        profileUpdate = { is_admin: false, is_super_admin: false, role: 'moderator' };
        break;
      case 'verifier':
        profileUpdate = { is_admin: false, is_super_admin: false, role: 'verifier' };
        break;
      case 'user':
        profileUpdate = { is_admin: false, is_super_admin: false, role: null };
        break;
    }

    // Update profiles table
    const profileRes = await supabaseQuery(env,
      `profiles?user_id=eq.${encodeURIComponent(target_user_id)}`,
      { method: 'PATCH', body: profileUpdate }
    );
    if (!profileRes.ok) {
      return jsonResponse({ error: 'Failed to update profile role' }, 500, env, request);
    }

    // Handle game verifiers table
    if (new_role === 'verifier' && Array.isArray(game_ids) && game_ids.length > 0) {
      // Clear existing verifier assignments for this user
      await supabaseQuery(env,
        `role_game_verifiers?user_id=eq.${encodeURIComponent(target_user_id)}`,
        { method: 'DELETE' }
      );
      // Insert new game assignments
      const rows = game_ids.map(gid => ({ user_id: target_user_id, game_id: sanitizeInput(gid, 100) }));
      await supabaseQuery(env, 'role_game_verifiers', {
        method: 'POST',
        body: rows,
        headers: { Prefer: 'resolution=merge-duplicates' }
      });
    } else if (new_role !== 'verifier') {
      // If demoting away from verifier, or promoting above it, clear verifier assignments
      await supabaseQuery(env,
        `role_game_verifiers?user_id=eq.${encodeURIComponent(target_user_id)}`,
        { method: 'DELETE' }
      );
    }

    return jsonResponse({
      ok: true,
      message: `Role updated to ${new_role}`,
      assigned_by: callerRole.runnerId || callerUser.id,
    }, 200, env, request);

  } catch (err) {
    console.error('assign-role error:', err);
    return jsonResponse({ error: 'Internal error during role assignment' }, 500, env, request);
  }
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
// GAME EDITOR ENDPOINTS — Server-side validation for game data changes
// ═══════════════════════════════════════════════════════════════════════════════

/** Fields that only admins (not moderators/verifiers) can change */
const GAME_ADMIN_ONLY_FIELDS = ['game_name', 'game_name_aliases', 'status'];

/** All allowed game data fields — anything not in this list is stripped */
const GAME_ALLOWED_FIELDS = [
  'game_name', 'game_name_aliases', 'status', 'timing_method',
  'genres', 'platforms', 'cover', 'cover_position',
  'full_runs', 'mini_challenges', 'player_made',
  'general_rules', 'challenges_data', 'glitches_data',
  'restrictions_data', 'character_column', 'characters_data',
  'additional_tabs', 'community_achievements', 'credits',
  'is_modded', 'base_game', 'tabs', 'layout', 'reviewers'
];

/** Verify caller has game editor access for a specific game */
async function checkGameEditorAccess(env, userId, gameId) {
  const role = await isAdmin(env, userId);

  // Admins and super admins can edit any game
  if (role.admin) return { allowed: true, role, isAdmin: true };

  // Moderators can edit games they're assigned to
  if (role.moderator) {
    const modCheck = await supabaseQuery(env,
      `role_game_moderators?user_id=eq.${encodeURIComponent(userId)}&game_id=eq.${encodeURIComponent(gameId)}&select=id`,
      { method: 'GET' });
    if (modCheck.ok && Array.isArray(modCheck.data) && modCheck.data.length > 0) {
      return { allowed: true, role, isAdmin: false };
    }
  }

  return { allowed: false, role, isAdmin: false };
}

// ── POST /game-editor/save ──────────────────────────────────────────────────

async function handleGameEditorSave(body, env, request) {
  // 1. Authenticate
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { game_id, section_name, updates } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (!section_name || typeof section_name !== 'string') {
    return jsonResponse({ error: 'Missing section_name' }, 400, env, request);
  }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return jsonResponse({ error: 'Missing or invalid updates' }, 400, env, request);
  }

  // 2. Check game-level access
  const access = await checkGameEditorAccess(env, auth.user.id, game_id);
  if (!access.allowed) {
    return jsonResponse({ error: 'No access to this game' }, 403, env, request);
  }

  // 3. Strip disallowed fields
  const sanitized = {};
  for (const key of Object.keys(updates)) {
    // Only allow known game fields
    if (!GAME_ALLOWED_FIELDS.includes(key)) continue;
    // Strip admin-only fields for non-admins
    if (!access.isAdmin && GAME_ADMIN_ONLY_FIELDS.includes(key)) continue;
    sanitized[key] = updates[key];
  }

  if (Object.keys(sanitized).length === 0) {
    return jsonResponse({ error: 'No valid fields to update' }, 400, env, request);
  }

  // 4. Check freeze state
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });

  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  if (currentGame.frozen_at && !access.isAdmin) {
    return jsonResponse({ error: 'Game is frozen. Only admins can edit frozen games.' }, 403, env, request);
  }

  // 5. Create snapshot (best-effort)
  try {
    await supabaseQuery(env, 'game_snapshots', {
      method: 'POST',
      body: {
        game_id,
        snapshot_data: currentGame,
        created_by: auth.user.id,
        description: `Before ${section_name} edit`
      }
    });
  } catch { /* best-effort */ }

  // 6. Update game
  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, {
      method: 'PATCH',
      body: sanitized,
      headers: { Prefer: 'return=representation' }
    });

  if (!updateResult.ok) {
    return jsonResponse({ error: 'Save failed', detail: updateResult.data }, 500, env, request);
  }

  // 7. Audit log (best-effort)
  const oldData = {};
  for (const key of Object.keys(sanitized)) oldData[key] = currentGame[key];
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: `game_${section_name}_edited`,
        record_id: game_id,
        user_id: auth.user.id,
        old_data: oldData,
        new_data: sanitized
      }
    });
  } catch { /* best-effort */ }

  const updatedGame = Array.isArray(updateResult.data) ? updateResult.data[0] : updateResult.data;
  return jsonResponse({ ok: true, message: `${section_name} saved`, game: updatedGame }, 200, env, request);
}

// ── POST /game-editor/freeze ────────────────────────────────────────────────

async function handleGameEditorFreeze(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // Only admins can freeze/unfreeze
  if (!auth.role.admin) {
    return jsonResponse({ error: 'Admin required to freeze/unfreeze' }, 403, env, request);
  }

  const { game_id, freeze } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (typeof freeze !== 'boolean') {
    return jsonResponse({ error: 'Missing freeze (boolean)' }, 400, env, request);
  }

  // Get current game state
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  // Create pre-freeze snapshot if freezing
  if (freeze) {
    try {
      await supabaseQuery(env, 'game_snapshots', {
        method: 'POST',
        body: {
          game_id,
          snapshot_data: currentGame,
          created_by: auth.user.id,
          description: 'Pre-freeze snapshot (automatic)'
        }
      });
    } catch { /* best-effort */ }
  }

  const updates = freeze
    ? { frozen_at: new Date().toISOString(), frozen_by: auth.user.id }
    : { frozen_at: null, frozen_by: null };

  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, {
      method: 'PATCH',
      body: updates
    });

  if (!updateResult.ok) {
    return jsonResponse({ error: 'Freeze/unfreeze failed' }, 500, env, request);
  }

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: freeze ? 'game_frozen' : 'game_unfrozen',
        record_id: game_id,
        user_id: auth.user.id,
        old_data: { frozen_at: currentGame.frozen_at },
        new_data: updates
      }
    });
  } catch { /* best-effort */ }

  return jsonResponse({
    ok: true,
    message: freeze ? 'Game frozen' : 'Game unfrozen',
    frozen_at: freeze ? updates.frozen_at : null,
    frozen_by: freeze ? updates.frozen_by : null
  }, 200, env, request);
}

// ── POST /game-editor/delete ────────────────────────────────────────────────

async function handleGameEditorDelete(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // Only super admins can delete games
  if (!auth.role.superAdmin) {
    return jsonResponse({ error: 'Super admin required to delete games' }, 403, env, request);
  }

  const { game_id, confirm_game_id } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (confirm_game_id !== game_id) {
    return jsonResponse({ error: 'Confirmation game_id does not match' }, 400, env, request);
  }

  // Get current game for snapshot + audit
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  // Pre-deletion snapshot
  try {
    await supabaseQuery(env, 'game_snapshots', {
      method: 'POST',
      body: {
        game_id,
        snapshot_data: currentGame,
        created_by: auth.user.id,
        description: 'Pre-deletion snapshot (automatic)'
      }
    });
  } catch { /* best-effort */ }

  // Delete
  const deleteResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, { method: 'DELETE' });

  if (!deleteResult.ok) {
    return jsonResponse({ error: 'Delete failed' }, 500, env, request);
  }

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: 'game_deleted',
        record_id: game_id,
        user_id: auth.user.id,
        old_data: currentGame,
        new_data: null
      }
    });
  } catch { /* best-effort */ }

  return jsonResponse({ ok: true, message: 'Game deleted' }, 200, env, request);
}

// ── POST /game-editor/rollback ──────────────────────────────────────────────

async function handleGameEditorRollback(body, env, request) {
  const auth = await authenticateAdmin(env, body);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { game_id, snapshot_id } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (!snapshot_id || typeof snapshot_id !== 'string') {
    return jsonResponse({ error: 'Missing snapshot_id' }, 400, env, request);
  }

  // Check game-level access
  const access = await checkGameEditorAccess(env, auth.user.id, game_id);
  if (!access.allowed) {
    return jsonResponse({ error: 'No access to this game' }, 403, env, request);
  }

  // Get current game state for backup snapshot
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  // Fetch snapshot data
  const snapResult = await supabaseQuery(env,
    `game_snapshots?id=eq.${encodeURIComponent(snapshot_id)}&game_id=eq.${encodeURIComponent(game_id)}&select=snapshot_data`,
    { method: 'GET' });
  if (!snapResult.ok || !Array.isArray(snapResult.data) || snapResult.data.length === 0) {
    return jsonResponse({ error: 'Snapshot not found' }, 404, env, request);
  }

  const restored = snapResult.data[0].snapshot_data;
  // Remove non-data fields
  delete restored.created_at;
  delete restored.updated_at;

  // Create backup snapshot of current state
  try {
    await supabaseQuery(env, 'game_snapshots', {
      method: 'POST',
      body: {
        game_id,
        snapshot_data: currentGame,
        created_by: auth.user.id,
        description: `Pre-rollback backup (rolling back to snapshot ${snapshot_id.slice(0, 8)})`
      }
    });
  } catch { /* best-effort */ }

  // Apply rollback
  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, {
      method: 'PATCH',
      body: restored,
      headers: { Prefer: 'return=representation' }
    });

  if (!updateResult.ok) {
    return jsonResponse({ error: 'Rollback failed' }, 500, env, request);
  }

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: 'game_rollback',
        record_id: game_id,
        user_id: auth.user.id,
        old_data: { snapshot_id },
        new_data: { rolled_back_to: snapshot_id }
      }
    });
  } catch { /* best-effort */ }

  const updatedGame = Array.isArray(updateResult.data) ? updateResult.data[0] : updateResult.data;
  return jsonResponse({ ok: true, message: 'Rollback successful', game: updatedGame }, 200, env, request);
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
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
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
      `game_achievements?runner_id=eq.${encodeURIComponent(runnerId)}&select=*`, { method: 'GET' });
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

  // 8. Support messages
  const messages = await supabaseQuery(env,
    `support_messages?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.support_messages = messages.ok ? (messages.data || []) : [];

  // 9. Profile audit log (actions performed on this user's profile)
  if (runnerId) {
    const audit = await supabaseQuery(env,
      `audit_profile_log?runner_id=eq.${encodeURIComponent(runnerId)}&select=*`, { method: 'GET' });
    exportData.sections.audit_log = audit.ok ? (audit.data || []) : [];
  }

  // 10. Moderator/admin record (reuses profile query from section 1)
  if (profile.ok && profile.data?.length > 0) {
    const p = profile.data[0];
    if (p.is_admin || p.is_super_admin || p.role === 'moderator') {
      exportData.sections.moderator_record = profile.data;
    }
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
    if (!await checkRateLimit(clientIp, path, env)) {
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
        case '/approve-run':
          return handleApproveRun(body, env, request);

        case '/reject-run':
          return handleRejectRun(body, env, request);

        case '/request-changes':
          return handleRequestRunChanges(body, env, request);

        case '/edit-approved-run':
          return handleEditApprovedRun(body, env, request);

        case '/verify-run':
          return handleVerifyRun(body, env, request);

        case '/unverify-run':
          return handleUnverifyRun(body, env, request);

        case '/approve-profile':
          return handleApproveProfile(body, env, request);

        case '/reject-profile':
          return handleRejectProfile(body, env, request);

        case '/request-profile-changes':
          return handleRequestProfileChanges(body, env, request);

        case '/approve-game':
          return handleApproveGame(body, env, request);

        case '/reject-game':
          return handleRejectGame(body, env, request);

        case '/request-game-changes':
          return handleRequestGameChanges(body, env, request);

        case '/assign-role':
          return handleAssignRole(body, env, request);

        case '/notify':
          return handleNotify(body, env, request);

        case '/export-data':
          return handleDataExport(body, env, request);

        case '/game-editor/save':
          return handleGameEditorSave(body, env, request);

        case '/game-editor/freeze':
          return handleGameEditorFreeze(body, env, request);

        case '/game-editor/delete':
          return handleGameEditorDelete(body, env, request);

        case '/game-editor/rollback':
          return handleGameEditorRollback(body, env, request);

        default:
          return jsonResponse({ error: 'Not found' }, 404, env, request);
      }
    } catch (err) {
      console.error('Unhandled error:', err);
      return jsonResponse({ error: 'Internal error' }, 500, env, request);
    }
  },
};
