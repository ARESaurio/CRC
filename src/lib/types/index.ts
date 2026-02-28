// =============================================================================
// CRC Type Definitions
// =============================================================================
// Mirrors the YAML front matter in _games/*.md, _runners/*.md, _runs/**/*.md,
// _achievements/*.md, _teams/*.md, and _posts/*.md.
// =============================================================================

// ─── Games ──────────────────────────────────────────────────────────────────

export interface GameTabs {
	overview: boolean;
	runs: boolean;
	rules: boolean;
	history: boolean;
	resources: boolean;
	forum: boolean;
	extra_1: boolean;
	extra_2: boolean;
}

export interface ChallengeType {
	slug: string;
	label: string;
	description: string;
}

export interface Restriction {
	slug: string;
	label: string;
	description: string;
	children?: Restriction[];
}

export interface GlitchCategory {
	slug: string;
	label: string;
	description: string;
}

export interface FixedLoadout {
	enabled: boolean;
	character?: string;
	challenge?: string;
	restriction?: string;
}

export interface FullRunCategory {
	slug: string;
	label: string;
	description: string;
	fixed_loadout?: FixedLoadout;
}

export interface MiniChallengeChild {
	slug: string;
	label: string;
	fixed_character?: boolean;
	fixed_loadout?: FixedLoadout;
}

export interface MiniChallengeGroup {
	slug: string;
	label: string;
	description: string;
	children: MiniChallengeChild[];
	fixed_loadout?: FixedLoadout;
}

export interface PlayerMadeChallenge {
	slug: string;
	label: string;
	description: string;
	creator?: string;
	created_date?: string;
	promoted_from_forum?: boolean;
	fixed_loadout?: FixedLoadout;
}

export interface CharacterColumn {
	enabled: boolean;
	label: string;
}

export interface CharacterOption {
	slug: string;
	label: string;
}

export interface CommunityAchievementDef {
	slug: string;
	title: string;
	description: string;
	icon: string;
	difficulty: 'easy' | 'medium' | 'hard' | 'legendary';
	total_required?: number;
	requirements: string[];
}

export interface GameCredit {
	name: string;
	runner_id?: string;
	role?: string;
	url?: string;
}

export interface Game {
	// Identity
	game_id: string;
	game_name: string;
	game_name_aliases?: string[];
	status: 'Active' | 'Inactive' | 'Coming Soon';
	layout: string;
	reviewers: string[];

	// Modded game support
	is_modded?: boolean;
	base_game?: string;

	// Metadata
	genres: string[];
	platforms: string[];

	// UI
	tabs: GameTabs;
	cover?: string;
	cover_position?: string;

	// Rules & challenges
	general_rules: string;
	challenges_data: ChallengeType[];
	restrictions_data?: Restriction[];
	glitches_data?: GlitchCategory[];

	// Three-tier category system
	full_runs: FullRunCategory[];
	mini_challenges: MiniChallengeGroup[];
	player_made: PlayerMadeChallenge[];

	// Characters
	character_column?: CharacterColumn;
	characters_data?: CharacterOption[];

	// Timing
	timing_method: string;

	// Community achievements
	community_achievements?: CommunityAchievementDef[];

	// Credits
	credits?: GameCredit[];

	// Markdown body content (below the front matter ---)
	content?: string;

	// Supabase timestamps
	created_at?: string;
	updated_at?: string;
}

// ─── Runners ────────────────────────────────────────────────────────────────

export interface RunnerSocials {
	twitch?: string;
	youtube?: string;
	discord?: string;
	twitter?: string;
	bluesky?: string;
	instagram?: string;
	speedruncom?: string;
	steam?: string;
	other?: string[];
	representing?: string;
	banner_opts?: {
		size?: 'cover' | 'contain' | 'fill';
		position?: 'center' | 'top' | 'bottom';
		opacity?: number;
		mode?: 'above' | 'background';
		gradient?: string;
		container_opacity?: number;
	};
	hide_activity?: boolean;
}

export interface Runner {
	runner_id: string;
	runner_name: string;
	display_name?: string;
	name?: string;
	avatar?: string;
	joined_date: string | Date;
	pronouns?: string;
	location?: string;
	status?: string;
	hidden?: boolean;
	bio?: string;
	accent_color?: string;
	cover_position?: string;

	// Permissions
	is_admin?: boolean;
	can_view_test_content?: boolean;

	// Social links
	socials: RunnerSocials;

	// Banner & customization
	banner?: string;

	// Profile sections
	featured_runs?: {
		game_id: string;
		category: string;
		achievement?: string;
		video_url?: string;
		video_approved?: boolean;
	}[];

	personal_goals?: {
		icon?: string;
		title: string;
		description?: string;
		game?: string;
		completed?: boolean;
		current?: number;
		total?: number;
		date_completed?: string;
	}[];

	contributions?: {
		icon?: string;
		title: string;
		description?: string;
		url?: string;
		type?: string;
	}[];

	// Markdown body content
	content?: string;

	// Supabase timestamps
	created_at?: string;
	updated_at?: string;
}

// ─── Runs ───────────────────────────────────────────────────────────────────

export interface Run {
	// IDs
	game_id: string;
	runner_id: string;
	category_slug: string;
	standard_challenges: string[];
	community_challenge: string;
	glitch_id: string;

	// Display columns
	runner: string;
	category: string;
	character?: string;
	restrictions?: string[];
	restriction_ids?: string[];
	time_primary: string;
	timing_method_primary: string;
	time_secondary?: string;
	timing_method_secondary?: string;
	date_completed: string | Date;
	video_url: string;

	// Metadata
	date_submitted: string | Date;

	// Runner content
	runner_notes?: string;

	// Moderation
	status: 'pending' | 'approved' | 'rejected';
	verified: boolean;
	verified_by?: string;
}

// ─── Achievements ───────────────────────────────────────────────────────────

export interface Achievement {
	game_id: string;
	runner_id: string;
	achievement_slug: string;

	// Completion
	date_completed: string | Date;
	proof_url: string;
	notes?: string;

	// Moderation
	status: 'pending' | 'approved' | 'rejected';
	verified_by?: string;
	verified_at?: string | Date;
}

// ─── Teams ──────────────────────────────────────────────────────────────────

export interface TeamMember {
	runner_id: string;
	name: string;
	role?: string;
}

export interface TeamAchievement {
	title: string;
	date?: string;
	description?: string;
}

export interface TeamSocials {
	discord?: string;
	youtube?: string;
	twitch?: string;
	twitter?: string;
	website?: string;
}

export interface Team {
	team_id: string;
	name: string;
	tagline?: string;
	logo?: string;
	socials?: TeamSocials;
	games?: string[];
	members?: TeamMember[];
	achievements?: TeamAchievement[];
	content?: string;
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export interface Post {
	title: string;
	date: string | Date;
	slug: string;
	description?: string;
	excerpt?: string;
	author?: string;
	tags?: string[];
	featured?: boolean;
	content: string;
}

// ─── Config Data (from _data/*.yml) ─────────────────────────────────────────

export interface AdminConfig {
	admins: Array<{
		runner_id: string;
		discord_id: string | null;
		twitch_id: string | null;
		permissions: string[];
	}>;
	test_mode: {
		allowed_testers: string[];
	};
}

export interface GameModerator {
	game_id: string;
	moderators: string[];
}

export interface Platform {
	slug: string;
	label: string;
	icon?: string;
}

export interface Genre {
	slug: string;
	label: string;
}

// ─── Default Rules ──────────────────────────────────────────────────────────

export interface DefaultRuleSet {
	[key: string]: {
		label: string;
		description: string;
		rules: string[];
	};
}

// ─── Form Field Order ───────────────────────────────────────────────────────

export interface FormFieldOrder {
	[formName: string]: string[];
}

// ─── Banned Terms ───────────────────────────────────────────────────────────

export interface BannedTermsConfig {
	terms: string[];
	patterns?: string[];
	exemptions?: string[];
}

// ─── Challenges ─────────────────────────────────────────────────────────────

export interface ChallengesConfig {
	[key: string]: {
		label: string;
		description: string;
	};
}
