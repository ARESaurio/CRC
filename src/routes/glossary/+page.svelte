<svelte:head><title>Glossary | Challenge Run Community</title></svelte:head>

<div class="page-width">
	<h1>Glossary</h1>
	<p class="muted mb-4">Definitions for gameplay interactions and challenge run terminology used across CRC. These are our community standards — individual games may define terms differently on their rules pages.</p>

	<nav class="glossary-nav" aria-label="Glossary sections">
		<a href="#gameplay">Gameplay Interactions</a>
		<a href="#challenges">Challenge Types</a>
		<a href="#timing">Timing & Submission</a>
		<a href="#community">Community Terms</a>
	</nav>

	<section id="gameplay">
		<h2>Gameplay Interactions</h2>

		<div class="card">
			<h3>Hit</h3>
			<p>Any instance where an enemy attack, hazard, or environmental source makes contact with the player character and is registered by the game's collision or damage system. A hit may or may not cause damage depending on the game's mechanics (e.g., shields, armor, invincibility frames). The key factor is <em>contact</em>, not the result.</p>
		</div>

		<div class="card">
			<h3>Damage</h3>
			<p>A reduction in the player character's health, hit points, or equivalent resource caused by a hit or environmental effect. Damage specifically refers to health loss — effects that don't reduce health (such as knockback alone, status debuffs, or shield hits in some games) may count as hits but not damage.</p>
		</div>

		<div class="card">
			<h3>Death</h3>
			<p>The player character's health reaching zero or triggering a game-over state. In most challenge contexts, this means any instance where the game would normally display a death screen, respawn prompt, or "You Died" equivalent — even if the player has extra lives or revival mechanics.</p>
		</div>

		<div class="card">
			<h3>Hard CC (Crowd Control)</h3>
			<p>Effects that fully prevent the player from taking any action for a duration: stuns, freezes, petrification, knockdowns, sleep, and similar. In challenge run contexts, hard CC is typically treated the same as a hit because the player loses control involuntarily.</p>
		</div>

		<div class="card">
			<h3>Soft CC (Crowd Control)</h3>
			<p>Effects that limit or impair the player's actions without fully disabling them: slows, blinds, aim disruption, silence (blocking abilities), and similar. Whether soft CC counts as a "hit" varies by game — check each game's rules page for specifics.</p>
		</div>

		<div class="card">
			<h3>Invincibility Frames (i-frames)</h3>
			<p>A window of time during certain actions (dodges, rolls, backsteps) where the player cannot be hit. Understanding i-frame windows is critical for no-hit runs. Taking a hit during i-frames does not count as a hit.</p>
		</div>

		<div class="card">
			<h3>Contact Damage</h3>
			<p>Damage taken simply by touching an enemy or hazard, without the enemy performing an explicit attack animation. Common in platformers and roguelikes. Always counts as a hit in challenge runs unless the game's rules specify otherwise.</p>
		</div>

		<div class="card">
			<h3>Self-Damage</h3>
			<p>Health loss caused by the player's own actions: fall damage, explosive splash, poison from consumables, etc. Rules on self-damage vary significantly by game. Some "no-hit" rulesets exclude self-damage; others include it. Always check the game's specific rules.</p>
		</div>
	</section>

	<section id="challenges">
		<h2>Challenge Types</h2>

		<div class="card">
			<h3>No-Hit</h3>
			<p>Complete the game (or a defined segment) without being hit by any enemy attack or hazard. The strictest common challenge type. Self-damage rules and environmental hazard rules vary by game.</p>
		</div>

		<div class="card">
			<h3>Hitless</h3>
			<p>Interchangeable with "No-Hit" in most contexts. Some communities use "hitless" for runs that also forbid self-damage, while "no-hit" only covers enemy/hazard hits. Check the game's rules page for the exact definition.</p>
		</div>

		<div class="card">
			<h3>Damageless</h3>
			<p>Complete the game without taking any damage (health reduction). This is often <em>slightly</em> less strict than no-hit in games where some hits don't cause damage (e.g., blocked attacks). In other games, "damageless" and "no-hit" are identical.</p>
		</div>

		<div class="card">
			<h3>No-Hit No-Damage</h3>
			<p>The combination of both: take zero hits <em>and</em> zero damage of any kind, including self-damage. The most restrictive standard challenge type.</p>
		</div>

		<div class="card">
			<h3>Deathless</h3>
			<p>Complete the game without dying. Less strict than no-hit — the player can take hits and damage freely, but a single death invalidates the run. Common as an entry-level challenge.</p>
		</div>

		<div class="card">
			<h3>Speedrun</h3>
			<p>Complete the game (or a category) as fast as possible. Speedruns are timed and ranked by completion time. CRC tracks speedruns alongside challenge runs when relevant.</p>
		</div>

		<div class="card">
			<h3>Restriction Run</h3>
			<p>Complete the game with self-imposed limitations beyond the base challenge: specific weapons only, no upgrades, base stats, permadeath, etc. Restrictions are tagged on runs and can be combined with any challenge type.</p>
		</div>
	</section>

	<section id="timing">
		<h2>Timing & Submission</h2>

		<div class="card">
			<h3>RTA (Real-Time Attack)</h3>
			<p>Timing method that measures wall-clock time from start to finish, including load screens, cutscenes, and menus. The most common timing method.</p>
		</div>

		<div class="card">
			<h3>IGT (In-Game Time)</h3>
			<p>Timing method that uses the game's own internal timer, which typically pauses during loads, menus, and cutscenes. Fairer across different hardware but not available in all games.</p>
		</div>

		<div class="card">
			<h3>Proof / VOD</h3>
			<p>Video evidence of a completed run, required for submission. Must show the full run (or the portion being claimed) without cuts or edits. YouTube and Twitch are the most common hosts.</p>
		</div>

		<div class="card">
			<h3>Verification</h3>
			<p>The process where a verifier or game moderator reviews a submitted run's video proof to confirm it meets the challenge requirements. Runs are "pending" until verified and "approved" once confirmed.</p>
		</div>
	</section>

	<section id="community">
		<h2>Community Terms</h2>

		<div class="card">
			<h3>Runner</h3>
			<p>Anyone who attempts or completes challenge runs. You don't need to hold a record to be a runner — all skill levels are welcome.</p>
		</div>

		<div class="card">
			<h3>Verifier / Game Moderator</h3>
			<p>A trusted community member who reviews and approves run submissions for specific games. Verifiers check that the video proof matches the claimed challenge.</p>
		</div>

		<div class="card">
			<h3>PB (Personal Best)</h3>
			<p>A runner's fastest or best completion of a particular challenge. In challenge runs (unlike pure speedruns), PB may refer to the farthest progress in an incomplete attempt.</p>
		</div>

		<div class="card">
			<h3>Category</h3>
			<p>A specific combination of game, challenge type, and ruleset. For example, "Hades 2 — No-Hit Any%" is a category. Categories are organized into full runs, mini-challenges, and player-made challenges.</p>
		</div>
	</section>
</div>

<style>
	.mb-4 { margin-bottom: 2rem; }
	.glossary-nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 2rem;
	}
	.glossary-nav a {
		padding: 0.4rem 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 0.85rem;
		color: var(--fg);
		text-decoration: none;
	}
	.glossary-nav a:hover {
		background: var(--accent);
		color: var(--bg);
		border-color: var(--accent);
	}
	section { margin-bottom: 2.5rem; }
	section h2 {
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.card { margin-bottom: 1rem; }
	.card h3 { margin: 0 0 0.5rem; color: var(--accent); }
	.card p { margin: 0; line-height: 1.6; }
</style>
