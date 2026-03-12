// =============================================================================
// CRC Type Definitions
// =============================================================================
// Mirrors the Supabase table schemas for games, runners, runs, achievements,
// teams, and posts. Also includes config types loaded from YAML in src/data/.
//
// IMPORTANT: When adding columns in Supabase, update the matching interface
// here so TypeScript catches usage errors at build time.
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
	exceptions?: string;
	game_specific?: boolean;
}

export interface Restriction {
	slug: string;
	label: string;
	description: string;
	exceptions?: string;
	child_select?: 'single' | 'multi';
	children?: Restriction[];
}

export interface GlitchCategory {
	slug: string;
	label: string;
	description: string;
	exceptions?: string;
	game_specific?: boolean;
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
	exceptions?: string;
	fixed_loadout?: FixedLoadout;
}

export interface MiniChallengeChild {
	slug: string;
	label: string;
	description?: string;
	exceptions?: string;
	fixed_character?: boolean;
	fixed_loadout?: FixedLoadout;
}

export interface MiniChallengeGroup {
	slug: string;
	label: string;
	description: string;
	exceptions?: string;
	child_select?: 'single' | 'multi';
	children: MiniChallengeChild[];
	fixed_loadout?: FixedLoadout;
}

export interface PlayerMadeChallenge {
	slug: string;
	label: string;
	description: string;
	exceptions?: string;
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
	children?: CharacterOption[];
}

export interface DifficultyColumn {
	enabled: boolean;
	label: string;
}

export interface DifficultyOption {
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

	// Difficulty
	difficulty_column?: DifficultyColumn;
	difficulties_data?: DifficultyOption[];

	// Timing
	timing_method: string;

	// Glitch details
	nmg_rules?: string;
	glitch_doc_links?: string;

	// Platform
	platform_required?: boolean;

	// Community achievements
	community_achievements?: CommunityAchievementDef[];

	// Credits
	credits?: GameCredit[];

	// Additional custom tabs
	additional_tabs?: {
		tab1: { enabled: boolean; title: string; content: string };
		tab2: { enabled: boolean; title: string; content: string };
	};

	// Freeze state
	frozen_at?: string | null;
	frozen_by?: string | null;

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
		position?: 'center' | 'top' | 'bottom' | 'custom';
		custom_y?: number;
		opacity?: number;
		mode?: 'above' | 'background';
		gradient?: string;
		container_opacity?: number;
	};
	avatar_opts?: {
		x?: number;
		y?: number;
		zoom?: number;
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
	// Primary key — sequential bigint. Internal use only.
	// NEVER expose in URLs, API responses, or client-facing references.
	id: number;

	// Public-facing identifier — UUID. Use this in URLs, API params, and anywhere
	// a run needs to be referenced outside the database.
	public_id: string;

	// Identity
	game_id: string;
	runner_id: string;
	category_tier: string;
	category_slug: string;
	category: string;
	standard_challenges: string[];
	community_challenge: string;
	glitch_id: string;

	// Display columns
	runner: string;
	character?: string;
	difficulty?: string;
	restrictions?: string[];
	restriction_ids?: string[];
	platform?: string;
	time_primary: string;
	time_rta?: string;
	timing_method_primary: string;
	time_secondary?: string;
	timing_method_secondary?: string;
	date_completed: string | Date;
	video_url: string;
	video_host?: string;
	video_id?: string;
	run_time?: string;

	// Multi-runner support
	additional_runners?: Record<string, unknown>[];

	// Submission tracking
	submission_id?: string;
	submitted_at?: string | Date;
	date_submitted: string | Date;
	source?: string;

	// Runner content
	runner_notes?: string;

	// Moderation
	status: 'pending' | 'approved' | 'rejected' | 'needs_changes' | 'verified';
	verified: boolean;
	verified_by?: string;
	verified_at?: string | Date;
	verifier_notes?: string;

	// Timestamps
	created_at?: string | Date;
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
		description?: string;
		aliases?: string[];
	};
}

// ─── Glossary ───────────────────────────────────────────────────────────────

export interface GlossaryTerm {
	label: string;
	description: string;
}

export interface GlossarySection {
	label: string;
	terms: Record<string, GlossaryTerm>;
}

export interface GlossaryConfig {
	[sectionKey: string]: GlossarySection;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType =
  | 'run_approved'
  | 'run_rejected'
  | 'run_needs_changes'
  | 'game_approved'
  | 'game_rejected'
  | 'game_needs_changes'
  | 'profile_approved'
  | 'profile_rejected'
  | 'profile_needs_changes';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  metadata: Record<string, any>;
  read: boolean;
  created_at: string;
}

// ─── Messaging ───────────────────────────────────────────────

export interface ThreadParticipant {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  runner_id: string | null;
}

export interface InboxThread {
  thread_id: string;
  subject: string | null;
  thread_type: string;
  submission_type: string | null;
  submission_id: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  participants: ThreadParticipant[];
}

export interface MessageWithSender {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender: ThreadParticipant;
}
