// ═══════════════════════════════════════════════════════════════════════════════
// Authentication Helpers
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env, AdminAuthResult, UserAuthResult } from '../types/index.js';
import { verifySupabaseToken, isAdmin } from './supabase.js';

export function extractBearerToken(request: Request): string | null {
  const auth = request?.headers?.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

export async function authenticateAdmin(env: Env, _body: unknown, request: Request): Promise<AdminAuthResult> {
  const token = extractBearerToken(request);
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

export async function authenticateUser(env: Env, _body: unknown, request: Request): Promise<UserAuthResult> {
  const token = extractBearerToken(request);
  if (!token) return { error: 'Missing token', status: 401 };

  const user = await verifySupabaseToken(env, token);
  if (!user?.id) return { error: 'Invalid or expired token', status: 401 };

  return { user };
}
