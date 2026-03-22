// ═══════════════════════════════════════════════════════════════════════════════
// CORS & JSON Response
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

export function corsHeaders(env: Env, request: Request): Record<string, string> {
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

export function jsonResponse(body: unknown, status: number, env: Env, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) },
  });
}
