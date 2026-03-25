// ═══════════════════════════════════════════════════════════════════════════════
// Game Initialization Handlers — Rough Draft, Proposals, Voting, Merge, Volunteers
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput, isValidId } from '../lib/utils.js';
import { supabaseQuery, insertNotification } from '../lib/supabase.js';
import { authenticateUser, authenticateAdmin } from '../lib/auth.js';
import { writeGameHistory } from '../lib/game-helpers.js';
import { sendDiscordNotification, SITE_URL } from '../lib/discord.js';

// ── Section IDs (must match frontend consensus.ts) ──────────────────────────
const VALID_SECTIONS = [
  'overview', 'categories', 'rules', 'challenges',
  'restrictions', 'characters', 'difficulties', 'achievements',
];

// ═══════════════════════════════════════════════════════════════════════════════
// ELIGIBILITY CHECK
// A user is eligible to participate if they are:
//   1. The original game submitter, OR
//   2. A runner with 1+ published (approved) run for this game
// ═══════════════════════════════════════════════════════════════════════════════

async function checkEligibility(env: Env, userId: string, gameId: string): Promise<{ eligible: boolean; reason?: string }> {
  // Check if user is the original submitter
  const pendingResult = await supabaseQuery(env,
    `pending_games?game_id=eq.${encodeURIComponent(gameId)}&select=submitted_by&limit=1`,
    { method: 'GET' });
  if (pendingResult.ok && Array.isArray(pendingResult.data) && pendingResult.data.length > 0) {
    if (pendingResult.data[0].submitted_by === userId) {
      return { eligible: true };
    }
  }

  // Check if user has 1+ published run for this game
  // First get the user's runner_id from profiles
  const profileResult = await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=runner_id`,
    { method: 'GET' });
  if (!profileResult.ok || !Array.isArray(profileResult.data) || profileResult.data.length === 0) {
    return { eligible: false, reason: 'No profile found' };
  }
  const runnerId = profileResult.data[0].runner_id;
  if (!runnerId) {
    return { eligible: false, reason: 'No runner profile' };
  }

  // Check for published runs
  const runsResult = await supabaseQuery(env,
    `runs?game_id=eq.${encodeURIComponent(gameId)}&runner_id=eq.${encodeURIComponent(runnerId)}&select=id&limit=1`,
    { method: 'GET' });
  if (runsResult.ok && Array.isArray(runsResult.data) && runsResult.data.length > 0) {
    return { eligible: true };
  }

  return { eligible: false, reason: 'You need at least 1 published run for this game to participate' };
}

// Also check admin/super admin — they bypass eligibility
async function checkEligibilityOrAdmin(env: Env, userId: string, gameId: string): Promise<{ eligible: boolean; isAdmin: boolean; reason?: string }> {
  // Quick admin check
  const profileResult = await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=is_admin,is_super_admin`,
    { method: 'GET' });
  if (profileResult.ok && Array.isArray(profileResult.data) && profileResult.data.length > 0) {
    const p = profileResult.data[0];
    if (p.is_admin || p.is_super_admin) {
      return { eligible: true, isAdmin: true };
    }
  }

  const result = await checkEligibility(env, userId, gameId);
  return { ...result, isAdmin: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED ROUGH DRAFT
// Called by handleApproveGame when approving to Community Review.
// Builds the initial rough draft from the submission + approved game data.
// ═══════════════════════════════════════════════════════════════════════════════

export async function seedRoughDraft(env: Env, gameId: string, gameData: Record<string, unknown>, pendingGameData: Record<string, unknown>): Promise<void> {
  const gd = (pendingGameData as any)?.game_data || {};

  const draftData = {
    overview: {
      content: (gameData.content as string) || (pendingGameData as any)?.description || '',
    },
    categories: {
      full_runs: (gameData.full_runs as any[]) || gd.full_runs || [],
      mini_challenges: (gameData.mini_challenges as any[]) || gd.mini_challenges || [],
      player_made: (gameData.player_made as any[]) || [],
    },
    rules: {
      general_rules: (gameData.general_rules as string) || (pendingGameData as any)?.rules || '',
    },
    challenges: {
      challenges_data: (gameData.challenges_data as any[]) || gd.challenges_data || [],
      glitches_data: (gameData.glitches_data as any[]) || gd.glitches_data || [],
      nmg_rules: (gameData.nmg_rules as string) || gd.nmg_rules || '',
      glitch_doc_links: (gameData.glitch_doc_links as string) || gd.glitch_doc_links || '',
    },
    restrictions: {
      restrictions_data: (gameData.restrictions_data as any[]) || gd.restrictions_data || [],
    },
    characters: {
      character_column: (gameData.character_column as any) || gd.character_column || { enabled: false, label: 'Character' },
      characters_data: (gameData.characters_data as any[]) || gd.characters_data || [],
    },
    difficulties: {
      difficulty_column: (gameData.difficulty_column as any) || gd.difficulty_column || { enabled: false, label: 'Difficulty' },
      difficulties_data: (gameData.difficulties_data as any[]) || gd.difficulties_data || [],
    },
    achievements: {
      community_achievements: (gameData.community_achievements as any[]) || [],
    },
  };

  await supabaseQuery(env, 'game_rough_draft', {
    method: 'POST',
    body: {
      game_id: gameId,
      version: 1,
      draft_data: draftData,
      seeded_from: 'submission',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET ELIGIBLE PARTICIPANTS COUNT
// Used for dynamic vote threshold (80% of active participants or 3, whichever is smaller)
// ═══════════════════════════════════════════════════════════════════════════════

async function getEligibleParticipantCount(env: Env, gameId: string): Promise<number> {
  // Count distinct users who have created proposals or voted for this game
  const proposalUsers = await supabaseQuery(env,
    `draft_proposals?game_id=eq.${encodeURIComponent(gameId)}&status=neq.withdrawn&select=user_id`,
    { method: 'GET' });
  const voteUsers = await supabaseQuery(env,
    `draft_proposal_votes?game_id=eq.${encodeURIComponent(gameId)}&select=user_id`,
    { method: 'GET' });

  const uniqueUsers = new Set<string>();
  if (proposalUsers.ok && Array.isArray(proposalUsers.data)) {
    for (const r of proposalUsers.data) uniqueUsers.add(r.user_id);
  }
  if (voteUsers.ok && Array.isArray(voteUsers.data)) {
    for (const r of voteUsers.data) uniqueUsers.add(r.user_id);
  }

  return uniqueUsers.size;
}

function getAcceptThreshold(participantCount: number): number {
  if (participantCount <= 3) return 3;
  return Math.ceil(participantCount * 0.8);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/propose
// Submit a proposal to change one section of the rough draft.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handlePropose(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id as string;
  const section = body.section as string;
  const proposedData = body.proposed_data;
  const title = body.title as string;
  const notes = body.notes as string | undefined;

  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);
  if (!section || !VALID_SECTIONS.includes(section)) return jsonResponse({ error: 'Invalid section' }, 400, env, request);
  if (!proposedData || typeof proposedData !== 'object') return jsonResponse({ error: 'Missing proposed_data' }, 400, env, request);
  if (!title?.trim()) return jsonResponse({ error: 'Missing title' }, 400, env, request);

  // Check eligibility
  const elig = await checkEligibilityOrAdmin(env, auth.user.id, gameId);
  if (!elig.eligible) return jsonResponse({ error: elig.reason || 'Not eligible' }, 403, env, request);

  // Get current rough draft version
  const draftResult = await supabaseQuery(env,
    `game_rough_draft?game_id=eq.${encodeURIComponent(gameId)}&select=version`,
    { method: 'GET' });
  if (!draftResult.ok || !Array.isArray(draftResult.data) || draftResult.data.length === 0) {
    return jsonResponse({ error: 'No rough draft found for this game' }, 404, env, request);
  }
  const baseVersion = draftResult.data[0].version;

  // Check for existing open proposal from this user on this section
  const existingResult = await supabaseQuery(env,
    `draft_proposals?game_id=eq.${encodeURIComponent(gameId)}&user_id=eq.${encodeURIComponent(auth.user.id)}&section=eq.${encodeURIComponent(section)}&status=eq.open&select=id`,
    { method: 'GET' });
  if (existingResult.ok && Array.isArray(existingResult.data) && existingResult.data.length > 0) {
    return jsonResponse({ error: 'You already have an open proposal for this section. Withdraw it first or wait for it to be resolved.' }, 409, env, request);
  }

  const result = await supabaseQuery(env, 'draft_proposals', {
    method: 'POST',
    body: {
      game_id: gameId,
      user_id: auth.user.id,
      section,
      proposed_data: proposedData,
      title: sanitizeInput(title, 200),
      notes: notes ? sanitizeInput(notes, 2000) : null,
      base_version: baseVersion,
      status: 'open',
    },
  });

  if (!result.ok) {
    return jsonResponse({ error: 'Failed to create proposal' }, 500, env, request);
  }

  return jsonResponse({ ok: true, proposal: Array.isArray(result.data) ? result.data[0] : result.data }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/vote
// Vote accept/reject on a proposal. Auto-merges if threshold is met.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleVote(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const proposalId = body.proposal_id as string;
  const vote = body.vote as string;
  const gameId = body.game_id as string;

  if (!proposalId) return jsonResponse({ error: 'Missing proposal_id' }, 400, env, request);
  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);
  if (!vote || !['accept', 'reject'].includes(vote)) return jsonResponse({ error: 'Vote must be accept or reject' }, 400, env, request);

  // Check eligibility
  const elig = await checkEligibilityOrAdmin(env, auth.user.id, gameId);
  if (!elig.eligible) return jsonResponse({ error: elig.reason || 'Not eligible' }, 403, env, request);

  // Verify proposal exists and is open
  const proposalResult = await supabaseQuery(env,
    `draft_proposals?id=eq.${encodeURIComponent(proposalId)}&select=*`,
    { method: 'GET' });
  if (!proposalResult.ok || !Array.isArray(proposalResult.data) || proposalResult.data.length === 0) {
    return jsonResponse({ error: 'Proposal not found' }, 404, env, request);
  }
  const proposal = proposalResult.data[0];
  if (proposal.status !== 'open') {
    return jsonResponse({ error: 'Proposal is no longer open for voting' }, 400, env, request);
  }
  if (proposal.game_id !== gameId) {
    return jsonResponse({ error: 'Proposal does not belong to this game' }, 400, env, request);
  }

  // Can't vote on your own proposal
  if (proposal.user_id === auth.user.id) {
    return jsonResponse({ error: 'You cannot vote on your own proposal' }, 400, env, request);
  }

  // Upsert vote (if user already voted, update their vote)
  const existingVote = await supabaseQuery(env,
    `draft_proposal_votes?proposal_id=eq.${encodeURIComponent(proposalId)}&user_id=eq.${encodeURIComponent(auth.user.id)}&select=id,vote`,
    { method: 'GET' });

  if (existingVote.ok && Array.isArray(existingVote.data) && existingVote.data.length > 0) {
    const existing = existingVote.data[0];
    if (existing.vote === vote) {
      // Same vote — remove it (toggle off)
      await supabaseQuery(env,
        `draft_proposal_votes?id=eq.${encodeURIComponent(existing.id)}`,
        { method: 'DELETE' });
      return jsonResponse({ ok: true, action: 'removed', merged: false }, 200, env, request);
    }
    // Different vote — update
    await supabaseQuery(env,
      `draft_proposal_votes?id=eq.${encodeURIComponent(existing.id)}`,
      { method: 'PATCH', body: { vote } });
  } else {
    // New vote
    await supabaseQuery(env, 'draft_proposal_votes', {
      method: 'POST',
      body: {
        proposal_id: proposalId,
        game_id: gameId,
        user_id: auth.user.id,
        vote,
      },
    });
  }

  // Check if threshold is met for auto-merge
  const votesResult = await supabaseQuery(env,
    `draft_proposal_votes?proposal_id=eq.${encodeURIComponent(proposalId)}&select=vote`,
    { method: 'GET' });

  let acceptCount = 0;
  let rejectCount = 0;
  if (votesResult.ok && Array.isArray(votesResult.data)) {
    for (const v of votesResult.data) {
      if (v.vote === 'accept') acceptCount++;
      else rejectCount++;
    }
  }

  // The proposer's implicit accept counts
  acceptCount += 1;

  const participantCount = await getEligibleParticipantCount(env, gameId);
  const threshold = getAcceptThreshold(participantCount);

  let merged = false;

  if (acceptCount >= threshold) {
    // Auto-merge!
    merged = await mergeProposal(env, proposal, auth.user.id);
  }

  return jsonResponse({
    ok: true,
    action: 'voted',
    vote,
    accept_count: acceptCount,
    reject_count: rejectCount,
    threshold,
    merged,
  }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MERGE LOGIC
// Applies a proposal's data to the rough draft, bumps version, saves history.
// ═══════════════════════════════════════════════════════════════════════════════

async function mergeProposal(env: Env, proposal: any, triggeredBy: string): Promise<boolean> {
  // Get current rough draft
  const draftResult = await supabaseQuery(env,
    `game_rough_draft?game_id=eq.${encodeURIComponent(proposal.game_id)}&select=*`,
    { method: 'GET' });
  if (!draftResult.ok || !Array.isArray(draftResult.data) || draftResult.data.length === 0) {
    return false;
  }
  const draft = draftResult.data[0];
  const oldDraftData = { ...draft.draft_data };
  const newVersion = draft.version + 1;

  // Save history snapshot (the CURRENT state before merge)
  await supabaseQuery(env, 'draft_history', {
    method: 'POST',
    body: {
      game_id: proposal.game_id,
      version: draft.version,
      draft_data: oldDraftData,
      proposal_id: proposal.id,
      section_changed: proposal.section,
      change_summary: proposal.title,
      merged_by: triggeredBy,
    },
  });

  // Apply proposal data to the section
  const updatedDraftData = { ...oldDraftData };
  updatedDraftData[proposal.section] = proposal.proposed_data;

  // Update rough draft
  const updateResult = await supabaseQuery(env,
    `game_rough_draft?game_id=eq.${encodeURIComponent(proposal.game_id)}`, {
      method: 'PATCH',
      body: {
        draft_data: updatedDraftData,
        version: newVersion,
        updated_at: new Date().toISOString(),
      },
    });

  if (!updateResult.ok) return false;

  // Mark proposal as accepted
  await supabaseQuery(env,
    `draft_proposals?id=eq.${encodeURIComponent(proposal.id)}`, {
      method: 'PATCH',
      body: {
        status: 'accepted',
        merged_at: new Date().toISOString(),
      },
    });

  // Notify the proposal author
  await insertNotification(env, proposal.user_id, 'proposal_accepted',
    `Your proposal "${proposal.title}" was accepted!`,
    {
      message: `Merged into the rough draft (v${newVersion})`,
      link: `/games/${proposal.game_id}/forum`,
      metadata: { game_id: proposal.game_id, section: proposal.section },
    }
  );

  // Game history
  await writeGameHistory(env, {
    game_id: proposal.game_id,
    action: 'proposal_merged',
    target: proposal.section,
    note: `Proposal "${proposal.title}" merged into rough draft (v${newVersion})`,
    actor_id: triggeredBy,
  });

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/withdraw-proposal
// Withdraw your own open proposal.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleWithdrawProposal(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const proposalId = body.proposal_id as string;
  if (!proposalId) return jsonResponse({ error: 'Missing proposal_id' }, 400, env, request);

  const proposalResult = await supabaseQuery(env,
    `draft_proposals?id=eq.${encodeURIComponent(proposalId)}&select=user_id,status`,
    { method: 'GET' });
  if (!proposalResult.ok || !Array.isArray(proposalResult.data) || proposalResult.data.length === 0) {
    return jsonResponse({ error: 'Proposal not found' }, 404, env, request);
  }
  const proposal = proposalResult.data[0];

  if (proposal.user_id !== auth.user.id) {
    return jsonResponse({ error: 'You can only withdraw your own proposals' }, 403, env, request);
  }
  if (proposal.status !== 'open') {
    return jsonResponse({ error: 'Only open proposals can be withdrawn' }, 400, env, request);
  }

  await supabaseQuery(env,
    `draft_proposals?id=eq.${encodeURIComponent(proposalId)}`, {
      method: 'PATCH',
      body: { status: 'withdrawn', updated_at: new Date().toISOString() },
    });

  return jsonResponse({ ok: true, message: 'Proposal withdrawn' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/volunteer
// Volunteer for Game Moderator or Verifier role.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleVolunteer(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id as string;
  const role = body.role as string;

  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);
  if (!role || !['moderator', 'verifier'].includes(role)) return jsonResponse({ error: 'Role must be moderator or verifier' }, 400, env, request);

  // Must be eligible participant
  const elig = await checkEligibility(env, auth.user.id, gameId);
  if (!elig.eligible) return jsonResponse({ error: elig.reason || 'Not eligible. Only participants in the initialization discussion can volunteer.' }, 403, env, request);

  // Insert (will fail with unique constraint if already volunteered)
  const result = await supabaseQuery(env, 'game_role_volunteers', {
    method: 'POST',
    body: {
      game_id: gameId,
      user_id: auth.user.id,
      role,
    },
  });

  if (!result.ok) {
    const errorText = JSON.stringify(result.data);
    if (errorText.includes('duplicate') || errorText.includes('unique') || errorText.includes('23505')) {
      return jsonResponse({ error: 'You have already volunteered for this role' }, 409, env, request);
    }
    return jsonResponse({ error: 'Failed to volunteer' }, 500, env, request);
  }

  return jsonResponse({ ok: true, message: `Volunteered as ${role}` }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/unvolunteer
// Remove your volunteer signup.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleUnvolunteer(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id as string;
  const role = body.role as string;

  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);
  if (!role || !['moderator', 'verifier'].includes(role)) return jsonResponse({ error: 'Invalid role' }, 400, env, request);

  await supabaseQuery(env,
    `game_role_volunteers?game_id=eq.${encodeURIComponent(gameId)}&user_id=eq.${encodeURIComponent(auth.user.id)}&role=eq.${encodeURIComponent(role)}`,
    { method: 'DELETE' });

  return jsonResponse({ ok: true, message: 'Volunteer signup removed' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/request-approval
// Participants request that the game be reviewed for final approval.
// Checks: 1 moderator volunteer, 1 verifier volunteer required.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleRequestApproval(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id as string;
  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);

  // Must be eligible
  const elig = await checkEligibility(env, auth.user.id, gameId);
  if (!elig.eligible) return jsonResponse({ error: elig.reason || 'Not eligible' }, 403, env, request);

  // Verify game is in Community Review status
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(gameId)}&select=status,game_name`,
    { method: 'GET' });
  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  if (gameResult.data[0].status !== 'Community Review') {
    return jsonResponse({ error: 'Game is not in Community Review status' }, 400, env, request);
  }

  // Check volunteer requirements
  const volResult = await supabaseQuery(env,
    `game_role_volunteers?game_id=eq.${encodeURIComponent(gameId)}&select=role`,
    { method: 'GET' });
  const volunteers = (volResult.ok && Array.isArray(volResult.data)) ? volResult.data : [];
  const hasMod = volunteers.some((v: any) => v.role === 'moderator');
  const hasVerifier = volunteers.some((v: any) => v.role === 'verifier');

  const missing: string[] = [];
  if (!hasMod) missing.push('1 Game Moderator volunteer');
  if (!hasVerifier) missing.push('1 Game Verifier volunteer');

  if (missing.length > 0) {
    return jsonResponse({
      ok: false,
      error: `Cannot request approval yet. Still needed: ${missing.join(' and ')}.`,
      missing,
    }, 400, env, request);
  }

  // Check not already requested
  const draftResult = await supabaseQuery(env,
    `game_rough_draft?game_id=eq.${encodeURIComponent(gameId)}&select=approval_requested`,
    { method: 'GET' });
  if (draftResult.ok && Array.isArray(draftResult.data) && draftResult.data.length > 0) {
    if (draftResult.data[0].approval_requested) {
      return jsonResponse({ error: 'Approval has already been requested for this game' }, 409, env, request);
    }
  }

  // Mark as approval requested
  await supabaseQuery(env,
    `game_rough_draft?game_id=eq.${encodeURIComponent(gameId)}`, {
      method: 'PATCH',
      body: {
        approval_requested: true,
        approval_requested_at: new Date().toISOString(),
        approval_requested_by: auth.user.id,
      },
    });

  // Game history
  await writeGameHistory(env, {
    game_id: gameId,
    action: 'approval_requested',
    note: 'Community requested final approval for the game',
    actor_id: auth.user.id,
  });

  // Discord notification to admins
  const gameName = gameResult.data[0].game_name || gameId;
  await sendDiscordNotification(env, 'games', {
    title: '🔔 Game Ready for Final Approval',
    url: `${SITE_URL}/games/${gameId}/forum`,
    color: 0xf59e0b,
    fields: [
      { name: 'Game', value: gameName, inline: true },
      { name: 'ID', value: gameId, inline: true },
      { name: 'Action', value: `[Review on Forum](${SITE_URL}/games/${gameId}/forum)`, inline: false },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({ ok: true, message: 'Approval requested! An admin will review the game.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/finalize
// Admin finalizes the game: applies rough draft to live game, sets Active,
// assigns mod/verifier roles.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleFinalize(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const gameId = body.game_id as string;
  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);

  // Get game name + verify Community Review status
  const gameCheck = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(gameId)}&select=game_name,status`,
    { method: 'GET' });
  if (!gameCheck.ok || !Array.isArray(gameCheck.data) || gameCheck.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const gameName = gameCheck.data[0].game_name || gameId;
  if (gameCheck.data[0].status !== 'Community Review') {
    return jsonResponse({ error: 'Game is not in Community Review status' }, 400, env, request);
  }

  // Get rough draft
  const draftResult = await supabaseQuery(env,
    `game_rough_draft?game_id=eq.${encodeURIComponent(gameId)}&select=*`,
    { method: 'GET' });
  if (!draftResult.ok || !Array.isArray(draftResult.data) || draftResult.data.length === 0) {
    return jsonResponse({ error: 'No rough draft found' }, 404, env, request);
  }
  const draft = draftResult.data[0];
  const dd = draft.draft_data;

  // Apply rough draft data to the live game
  const gameUpdates: Record<string, unknown> = {
    status: 'Active',
    content: dd.overview?.content || '',
    full_runs: dd.categories?.full_runs || [],
    mini_challenges: dd.categories?.mini_challenges || [],
    player_made: dd.categories?.player_made || [],
    general_rules: dd.rules?.general_rules || '',
    challenges_data: dd.challenges?.challenges_data || [],
    glitches_data: dd.challenges?.glitches_data || [],
    nmg_rules: dd.challenges?.nmg_rules || '',
    glitch_doc_links: dd.challenges?.glitch_doc_links || '',
    restrictions_data: dd.restrictions?.restrictions_data || [],
    character_column: dd.characters?.character_column || { enabled: false, label: 'Character' },
    characters_data: dd.characters?.characters_data || [],
    difficulty_column: dd.difficulties?.difficulty_column || { enabled: false, label: 'Difficulty' },
    difficulties_data: dd.difficulties?.difficulties_data || [],
    community_achievements: dd.achievements?.community_achievements || [],
  };

  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(gameId)}`, {
      method: 'PATCH',
      body: gameUpdates,
    });

  if (!updateResult.ok) {
    return jsonResponse({ error: 'Failed to update game' }, 500, env, request);
  }

  // Assign mod/verifier roles from volunteers
  const volResult = await supabaseQuery(env,
    `game_role_volunteers?game_id=eq.${encodeURIComponent(gameId)}&select=user_id,role`,
    { method: 'GET' });
  const volunteerUserIds: string[] = [];
  if (volResult.ok && Array.isArray(volResult.data)) {
    for (const vol of volResult.data) {
      volunteerUserIds.push(vol.user_id);
      const table = vol.role === 'moderator' ? 'role_game_moderators' : 'role_game_verifiers';
      await supabaseQuery(env, table, {
        method: 'POST',
        body: { game_id: gameId, user_id: vol.user_id },
      });

      // Notify volunteers of their new role
      await insertNotification(env, vol.user_id, 'role_assigned',
        `You've been assigned as ${vol.role === 'moderator' ? 'Game Moderator' : 'Game Verifier'} for ${gameName}!`,
        { link: `/games/${gameId}`, metadata: { game_id: gameId, role: vol.role } }
      );
    }
  }

  // Notify original submitter
  const pendingResult = await supabaseQuery(env,
    `pending_games?game_id=eq.${encodeURIComponent(gameId)}&select=submitted_by&limit=1`,
    { method: 'GET' });
  if (pendingResult.ok && Array.isArray(pendingResult.data) && pendingResult.data.length > 0) {
    const submitterId = pendingResult.data[0].submitted_by;
    if (submitterId && !volunteerUserIds.includes(submitterId)) {
      await insertNotification(env, submitterId, 'game_finalized',
        `${gameName} has been finalized and is now Active!`,
        { link: `/games/${gameId}`, metadata: { game_id: gameId } }
      );
    }
  }

  // Game history
  await writeGameHistory(env, {
    game_id: gameId,
    action: 'game_finalized',
    note: `Game "${gameName}" moved from Community Review to Active with community-built rules`,
    actor_id: auth.user.id,
  });

  // Discord notification
  await sendDiscordNotification(env, 'games', {
    title: '🎮 Game Finalized — Now Active!',
    url: `${SITE_URL}/games/${gameId}`,
    color: 0x28a745,
    fields: [
      { name: 'Game', value: gameName, inline: true },
      { name: 'ID', value: gameId, inline: true },
      { name: 'Draft Version', value: `v${draft.version}`, inline: true },
      { name: 'View', value: `[Game Page](${SITE_URL}/games/${gameId})`, inline: false },
    ],
    footer: { text: 'Community-built rules are now live' },
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({ ok: true, message: 'Game finalized and set to Active!' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /game-init/check-eligibility
// Check if the current user is eligible to participate.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleCheckEligibility(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id as string;
  if (!gameId || !isValidId(gameId)) return jsonResponse({ error: 'Invalid game_id' }, 400, env, request);

  const result = await checkEligibilityOrAdmin(env, auth.user.id, gameId);

  return jsonResponse({
    ok: true,
    eligible: result.eligible,
    is_admin: result.isAdmin,
    reason: result.reason || null,
  }, 200, env, request);
}
