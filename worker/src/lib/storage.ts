// ═══════════════════════════════════════════════════════════════════════════════
// Supabase Storage Helpers — Move/rename files via REST API
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

/**
 * Move (rename) a file within a single bucket.
 * Uses the Supabase Storage REST API: POST /storage/v1/object/move
 */
export async function moveStorageFile(
  env: Env,
  bucketId: string,
  sourceKey: string,
  destinationKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/move`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucketId, sourceKey, destinationKey }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unknown storage error' };
  }
}

/**
 * Get the public URL for a file in a bucket.
 */
export function getPublicUrl(env: Env, bucketId: string, filePath: string): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/${bucketId}/${filePath}`;
}

/**
 * Given a cover URL that may point to a UUID-named or pending-named file,
 * extract the filename, move it to {gameSlug}.webp, and return the new URL.
 *
 * Returns null if no rename was needed or possible.
 */
export async function renameGameCover(
  env: Env,
  coverUrl: string | null | undefined,
  gameSlug: string,
): Promise<string | null> {
  if (!coverUrl) return null;

  // Extract the filename from the URL
  // URLs look like: https://{project}.supabase.co/storage/v1/object/public/game-covers/{filename}?v=...
  // or:             https://{project}.supabase.co/storage/v1/object/public/pending-covers/{filename}?v=...
  const bucketId = 'game-covers';
  const targetFile = `${gameSlug}.webp`;

  // Try to extract the source filename
  let sourceFile: string | null = null;

  // Match game-covers bucket path
  const gcMatch = coverUrl.match(/\/game-covers\/([^?]+)/);
  if (gcMatch) {
    sourceFile = decodeURIComponent(gcMatch[1]);
  }

  // Match old pending-covers bucket path (files may have been manually moved)
  if (!sourceFile) {
    const pcMatch = coverUrl.match(/\/pending-covers\/([^?]+)/);
    if (pcMatch) {
      sourceFile = decodeURIComponent(pcMatch[1]);
    }
  }

  if (!sourceFile) return null;

  // Already named correctly — no rename needed
  if (sourceFile === targetFile) return null;

  // Move the file
  const result = await moveStorageFile(env, bucketId, sourceFile, targetFile);
  if (!result.ok) {
    console.error(`Failed to rename cover ${sourceFile} → ${targetFile}:`, result.error);
    return null;
  }

  // Return new public URL (no cache-buster — the DB stores the clean URL)
  return getPublicUrl(env, bucketId, targetFile);
}
