// ═══════════════════════════════════════════════════════════════════════════════
// CRC Worker — Shared Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/** Cloudflare Worker environment bindings */
export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_ANON_KEY: string;

  // CORS
  ALLOWED_ORIGIN: string;
  ENVIRONMENT?: string;

  // Turnstile
  TURNSTILE_SECRET: string;

  // Discord webhooks
  DISCORD_WEBHOOK_RUNS?: string;
  DISCORD_WEBHOOK_GAMES?: string;
  DISCORD_WEBHOOK_PROFILES?: string;

  // KV namespace (rate limiting)
  RATE_LIMIT_KV?: KVNamespace;
}

/** Result from supabaseQuery() */
export interface SupabaseResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/** Supabase auth user (from /auth/v1/user) */
export interface SupabaseUser {
  id: string;
  email?: string;
  [key: string]: unknown;
}

/** Role flags returned by isAdmin() */
export interface RoleInfo {
  admin: boolean;
  superAdmin: boolean;
  moderator: boolean;
  verifier: boolean;
  runnerId: string | null;
  assignedGames: string[];
}

/** Successful admin auth result */
export interface AdminAuthSuccess {
  user: SupabaseUser;
  role: RoleInfo;
  error?: undefined;
  status?: undefined;
}

/** Successful user auth result */
export interface UserAuthSuccess {
  user: SupabaseUser;
  error?: undefined;
  status?: undefined;
}

/** Failed auth result */
export interface AuthError {
  error: string;
  status: number;
  user?: undefined;
  role?: undefined;
}

export type AdminAuthResult = AdminAuthSuccess | AuthError;
export type UserAuthResult = UserAuthSuccess | AuthError;

/** Game editor access check result */
export interface GameEditorAccess {
  allowed: boolean;
  role: RoleInfo;
  isAdmin: boolean;
}

/** Discord embed field */
export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/** Discord embed object */
export interface DiscordEmbed {
  title?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
}

/** Discord webhook channel names */
export type DiscordChannel = 'runs' | 'games' | 'profiles';

/** Rate limit entry (KV or in-memory) */
export interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/** Standard JSON API response body */
export interface ApiResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

/** Supabase query options */
export interface SupabaseQueryOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Notification options for insertNotification */
export interface NotificationOptions {
  message?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown>;
}

/** Game history entry for writeGameHistory */
export interface GameHistoryParams {
  game_id: string;
  action: string;
  target?: string | null;
  note?: string | null;
  actor_id: string;
}

/** Handler function signature — all handlers share this shape */
export type HandlerFn = (
  body: Record<string, unknown>,
  env: Env,
  request: Request,
) => Promise<Response>;
