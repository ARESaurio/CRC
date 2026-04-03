// =============================================================================
// General Utilities
// =============================================================================
// Ports logic from assets/js/utils.js and common patterns across the site.
// =============================================================================

/**
 * Format a date for display.
 * Handles both Date objects (from gray-matter YAML parsing) and strings.
 * Output: 'Jan 3, 2025'
 */
export function formatDate(dateInput: string | Date): string {
	if (!dateInput) return '';

	let date: Date;
	if (dateInput instanceof Date) {
		date = dateInput;
	} else {
		// Always extract the YYYY-MM-DD portion and parse as local midnight.
		// DB may return "2025-03-13T00:00:00+00:00" for what is logically a
		// date-only value; parsing that as-is shifts it back a day west of UTC.
		const dateOnly = dateInput.substring(0, 10);
		date = new Date(dateOnly + 'T00:00:00');
	}

	if (isNaN(date.getTime())) return '';

	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Format a duration/time string for display.
 * Passes through if already formatted (HH:MM:SS or MM:SS).
 */
export function formatTime(time: string): string {
	if (!time) return '—';
	return time;
}

/**
 * Generate a URL-safe slug from a string.
 */
export function slugify(text: string): string {
	return (text || '')
		.toLowerCase()
		.replace(/['']/g, '')
		.replace(/%/g, '-percent')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/(^-|-$)/g, '');
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
	if (!text || text.length <= maxLength) return text;
	return text.slice(0, maxLength).trimEnd() + '…';
}

/**
 * Extract YouTube video ID from a URL.
 * Supports youtube.com/watch, youtu.be, and m.youtube.com formats.
 */
export function extractYouTubeId(url: string): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');

		if (host === 'youtu.be') {
			return u.pathname.slice(1) || null;
		}
		if (host === 'youtube.com') {
			return u.searchParams.get('v') || null;
		}
	} catch {
		return null;
	}
	return null;
}

/**
 * Get YouTube thumbnail URL from a video URL.
 */
export function getYouTubeThumbnail(
	url: string,
	quality: 'default' | 'mqdefault' | 'hqdefault' | 'maxresdefault' = 'mqdefault'
): string | null {
	const id = extractYouTubeId(url);
	if (!id) return null;
	return `https://img.youtube.com/vi/${id}/${quality}.jpg`;
}

/**
 * Check if a string is a valid URL (http or https).
 * For general-purpose links (socials, websites, etc.).
 */
export function isValidUrl(url: string): boolean {
	if (!url) return false;
	try {
		const u = new URL(url);
		return u.protocol === 'https:' || u.protocol === 'http:';
	} catch {
		return false;
	}
}

/**
 * Check if a video URL is from a supported platform.
 */
export function isValidVideoUrl(url: string): boolean {
	if (!url) return false;
	try {
		const u = new URL(url);
		if (u.protocol !== 'https:') return false;
		const host = u.hostname.replace(/^www\./, '').toLowerCase();
		const allowedHosts = [
			'youtube.com',
			'm.youtube.com',
			'youtu.be',
			'twitch.tv',
			'm.twitch.tv',
			'player.twitch.tv',
			'bilibili.com'
		];
		return allowedHosts.some((h) => host === h || host.endsWith('.' + h));
	} catch {
		return false;
	}
}

/**
 * Deep clone an object via JSON round-trip.
 * Suitable for plain data (no functions, Dates, etc.).
 */
export function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Group an array of items by a key.
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
	const groups: Record<string, T[]> = {};
	for (const item of items) {
		const key = keyFn(item);
		if (!groups[key]) groups[key] = [];
		groups[key].push(item);
	}
	return groups;
}

/**
 * Format a date string as a relative "time ago" label.
 * Returns "just now", "3m ago", "2h ago", "5d ago",
 * or falls back to formatDate() for anything older than 30 days.
 */
export function timeAgo(dateStr: string): string {
	if (!dateStr) return '';
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d ago`;
	return formatDate(dateStr);
}
