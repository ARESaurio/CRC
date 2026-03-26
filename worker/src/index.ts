/**
 * CRC Cloudflare Worker — Router
 *
 * All endpoint handlers are in src/handlers/.
 * Shared utilities are in src/lib/.
 * This file is the router — it parses the request and dispatches to handlers.
 *
 * Secrets (set via wrangler secret put):
 *   SUPABASE_SERVICE_KEY, TURNSTILE_SECRET,
 *   DISCORD_WEBHOOK_RUNS, DISCORD_WEBHOOK_GAMES, DISCORD_WEBHOOK_PROFILES
 */

import type { Env } from './types/index.js';

// ── Lib ──────────────────────────────────────────────────────────────────────
import { corsHeaders, jsonResponse } from './lib/cors.js';
import { checkRateLimit } from './lib/rate-limit.js';

// ── Handlers: Runs ───────────────────────────────────────────────────────────
import {
  handleRunSubmission,
  handleApproveRun,
  handleRejectRun,
  handleRequestRunChanges,
  handleEditApprovedRun,
  handleStaffEditPendingRun,
  handleVerifyRun,
  handleUnverifyRun,
  handleEditPendingRun,
  handleWithdrawPendingRun,
} from './handlers/runs.js';

// ── Handlers: Games ──────────────────────────────────────────────────────────
import {
  handleGameSubmission,
  handleApproveGame,
  handleRejectGame,
  handleRequestGameChanges,
  handleCheckGameExists,
  handleSupportGame,
  handleEditPendingGame,
  handleWithdrawPendingGame,
} from './handlers/games.js';

// ── Handlers: Game Editor ────────────────────────────────────────────────────
import {
  handleGameEditorSave,
  handleGameEditorFreeze,
  handleGameEditorDelete,
  handleGameEditorRollback,
  handleGameEditorReimport,
} from './handlers/game-editor.js';

// ── Handlers: Game Initialization ───────────────────────────────────────────
import {
  handlePropose,
  handleVote,
  handleWithdrawProposal,
  handleVolunteer,
  handleUnvolunteer,
  handleRequestApproval,
  handleFinalize,
  handleCheckEligibility,
} from './handlers/game-init.js';

// ── Handlers: Profiles ───────────────────────────────────────────────────────
import {
  handleApproveProfile,
  handleRejectProfile,
  handleRequestProfileChanges,
  handleUpdateContributions,
} from './handlers/profiles.js';

// ── Handlers: Notifications ──────────────────────────────────────────────────
import {
  handleNotify,
  handleNotifyProfileSubmitted,
  handleReviewRuleSuggestion,
} from './handlers/notifications.js';

// ── Handlers: Users ──────────────────────────────────────────────────────────
import {
  handleAssignRole,
  handleDataExport,
  handleDeleteAccount,
} from './handlers/users.js';

// ── Handlers: Messages ───────────────────────────────────────────────────────
import { handleCreateThread } from './handlers/messages.js';

// ── Handlers: Reports ────────────────────────────────────────────────────────
import { handleReport } from './handlers/reports.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, env, request);
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, env, request);
    }

    const url = new URL(request.url);
    const rawPath = url.pathname.replace(/\/+$/, '') || '/';
    // Support both /approve-profile and /admin/approve-profile
    const path = rawPath.replace(/^\/admin/, '');

    // Rate limiting
    const clientIp = request.headers.get('CF-Connecting-IP') || '';
    if (!await checkRateLimit(clientIp, path, env)) {
      return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429, env, request);
    }

    try {
      switch (path) {
        // ── Runs ─────────────────────────────────────────────────
        case '/':
        case '/submit':
          return handleRunSubmission(body, env, request);
        case '/approve':
        case '/approve-run':
          return handleApproveRun(body, env, request);
        case '/reject-run':
          return handleRejectRun(body, env, request);
        case '/request-changes':
          return handleRequestRunChanges(body, env, request);
        case '/edit-approved-run':
          return handleEditApprovedRun(body, env, request);
        case '/staff-edit-pending-run':
          return handleStaffEditPendingRun(body, env, request);
        case '/verify-run':
          return handleVerifyRun(body, env, request);
        case '/unverify-run':
          return handleUnverifyRun(body, env, request);
        case '/edit-pending-run':
          return handleEditPendingRun(body, env, request);
        case '/withdraw-pending-run':
          return handleWithdrawPendingRun(body, env, request);

        // ── Games ────────────────────────────────────────────────
        case '/submit-game':
          return handleGameSubmission(body, env, request);
        case '/check-game-exists':
          return handleCheckGameExists(body, env, request);
        case '/support-game':
          return handleSupportGame(body, env, request);
        case '/approve-game':
          return handleApproveGame(body, env, request);
        case '/reject-game':
          return handleRejectGame(body, env, request);
        case '/request-game-changes':
          return handleRequestGameChanges(body, env, request);
        case '/edit-pending-game':
          return handleEditPendingGame(body, env, request);
        case '/withdraw-pending-game':
          return handleWithdrawPendingGame(body, env, request);

        // ── Game Editor ──────────────────────────────────────────
        case '/game-editor/save':
          return handleGameEditorSave(body, env, request);
        case '/game-editor/freeze':
          return handleGameEditorFreeze(body, env, request);
        case '/game-editor/delete':
          return handleGameEditorDelete(body, env, request);
        case '/game-editor/rollback':
          return handleGameEditorRollback(body, env, request);
        case '/game-editor/reimport':
          return handleGameEditorReimport(body, env, request);

        // ── Game Initialization ──────────────────────────────────
        case '/game-init/propose':
          return handlePropose(body, env, request);
        case '/game-init/vote':
          return handleVote(body, env, request);
        case '/game-init/withdraw-proposal':
          return handleWithdrawProposal(body, env, request);
        case '/game-init/volunteer':
          return handleVolunteer(body, env, request);
        case '/game-init/unvolunteer':
          return handleUnvolunteer(body, env, request);
        case '/game-init/request-approval':
          return handleRequestApproval(body, env, request);
        case '/game-init/finalize':
          return handleFinalize(body, env, request);
        case '/game-init/check-eligibility':
          return handleCheckEligibility(body, env, request);

        // ── Profiles ─────────────────────────────────────────────
        case '/approve-profile':
          return handleApproveProfile(body, env, request);
        case '/reject-profile':
          return handleRejectProfile(body, env, request);
        case '/request-profile-changes':
          return handleRequestProfileChanges(body, env, request);
        case '/update-contributions':
          return handleUpdateContributions(body, env, request);

        // ── Notifications & Rules ────────────────────────────────
        case '/notify':
          return handleNotify(body, env, request);
        case '/notify-profile-submitted':
          return handleNotifyProfileSubmitted(body, env, request);
        case '/review-rule-suggestion':
          return handleReviewRuleSuggestion(body, env, request);

        // ── Users ────────────────────────────────────────────────
        case '/assign-role':
          return handleAssignRole(body, env, request);
        case '/export-data':
          return handleDataExport(body, env, request);
        case '/delete-account':
          return handleDeleteAccount(body, env, request);

        // ── Messages ─────────────────────────────────────────────
        case '/messages/create-thread':
          return handleCreateThread(body, env, request);

        // ── Reports ──────────────────────────────────────────────
        case '/report':
          return handleReport(body, env, request);

        default:
          return jsonResponse({ error: 'Not found' }, 404, env, request);
      }
    } catch (err) {
      console.error('Unhandled error:', err);
      return jsonResponse({ error: 'Internal error' }, 500, env, request);
    }
  },
};
