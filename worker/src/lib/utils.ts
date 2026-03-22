// ═══════════════════════════════════════════════════════════════════════════════
// Input Sanitization & Validation
// ═══════════════════════════════════════════════════════════════════════════════

export function sanitizeInput(str: unknown, maxLength = 500): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')        // Strip HTML tags
    .replace(/javascript:/gi, '')    // Strip JS protocol
    .replace(/on\w+\s*=/gi, '')      // Strip event handlers
    .trim()
    .slice(0, maxLength);
}

/** Validate that a value looks like an integer ID, UUID, or slug */
export function isValidId(id: unknown): boolean {
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
export function isValidVideoUrl(url: unknown): boolean {
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
export function isValidSlug(s: unknown, minLen = 1, maxLen = 100): boolean {
  if (!s || typeof s !== 'string') return false;
  return s.length >= minLen && s.length <= maxLen && /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(s);
}

/** Sanitize an array of strings */
export function sanitizeArray(arr: unknown, maxItems = 20, maxItemLen = 200): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxItems).map(item =>
    typeof item === 'string' ? sanitizeInput(item, maxItemLen) : ''
  ).filter(Boolean);
}

export function slugify(s: string | undefined | null): string {
  return (s || '').toLowerCase()
    .replace(/['']/g, '')
    .replace(/%/g, '-percent')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export function generateSubmissionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sub_${ts}_${rand}`;
}
