<script lang="ts">
	import { session, isLoading } from '$stores/auth';
	import { checkAdminRole } from '$lib/admin';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { onMount } from 'svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let checking = $state(true);
	let authorized = $state(false);

	const GUIDE_META: Record<string, { title: string; icon: string; order: number }> = {
		'super-admin-guide': { title: 'Super Admin', icon: '⭐', order: 0 },
		'admin-guide': { title: 'Admin', icon: '🛡️', order: 1 },
		'moderator-guide': { title: 'Moderator', icon: 'ðŸ‘ï¸', order: 2 },
		'verifier-guide': { title: 'Verifier', icon: '✅', order: 3 },
		'staff-compliance-procedures': { title: 'Compliance', icon: '📋', order: 4 },
		'disaster-recovery': { title: 'Disaster Recovery', icon: 'ðŸš¨', order: 5 },
	};

	// Build enriched guides from server data
	const guides = $derived(
		data.guides
			.map((g: { slug: string; content: string }) => ({
				slug: g.slug,
				title: GUIDE_META[g.slug]?.title ?? g.slug,
				icon: GUIDE_META[g.slug]?.icon ?? 'ðŸ“„',
				order: GUIDE_META[g.slug]?.order ?? 99,
				content: g.content
			}))
			.sort((a: { order: number }, b: { order: number }) => a.order - b.order)
	);

	let activeGuide = $state('');
	const currentGuide = $derived(guides.find((g: { slug: string }) => g.slug === activeGuide));

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) return; // admin layout guard handles redirect
				const role = await checkAdminRole();
				authorized = !!(role?.admin);
				checking = false;
				if (authorized && guides.length > 0 && !activeGuide) {
					activeGuide = guides[0].slug;
				}
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>{m.admin_guides_title()}</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>â† {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 {m.admin_access_denied()}</h2><p class="muted">{m.admin_access_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>{m.admin_guides_heading()}</h1>
		<p class="muted mb-3">{m.admin_guides_desc()}</p>

		{#if guides.length === 0}
			<div class="card"><p class="muted" style="text-align:center;padding:2rem;">{m.admin_guides_no_guides()}</p></div>
		{:else}
			<div class="guides-layout">
				<nav class="guides-nav">
					{#each guides as guide}
						<button
							class="guides-nav__item"
							class:active={activeGuide === guide.slug}
							onclick={() => activeGuide = guide.slug}
						>
							<span>{guide.icon}</span>
							<span>{guide.title}</span>
						</button>
					{/each}
				</nav>

				<div class="guides-content card">
					{#if currentGuide}
						<div class="markdown-body">
							{@html renderMarkdown(currentGuide.content)}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-3 { margin-bottom: 1.25rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }

	.guides-layout { display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; }
	.guides-nav { display: flex; flex-direction: column; gap: 0.25rem; position: sticky; top: 1rem; align-self: start; }
	.guides-nav__item { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; background: none; border: 1px solid transparent; border-radius: 8px; cursor: pointer; font-size: 0.9rem; color: var(--muted); text-align: left; font-family: inherit; }
	.guides-nav__item:hover { background: var(--surface); color: var(--fg); }
	.guides-nav__item.active { background: var(--surface); border-color: var(--accent); color: var(--fg); font-weight: 600; }

	.guides-content { padding: 1.5rem 2rem; }
	.markdown-body :global(h1) { margin: 0 0 1rem; font-size: 1.5rem; }
	.markdown-body :global(h2) { margin: 1.5rem 0 0.75rem; font-size: 1.25rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
	.markdown-body :global(h3) { margin: 1.25rem 0 0.5rem; font-size: 1.05rem; }
	.markdown-body :global(p) { margin: 0 0 0.75rem; line-height: 1.6; }
	.markdown-body :global(ul) { padding-left: 1.5rem; margin: 0 0 1rem; }
	.markdown-body :global(li) { margin-bottom: 0.35rem; line-height: 1.5; }
	.markdown-body :global(hr) { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }

	@media (max-width: 768px) {
		.guides-layout { grid-template-columns: 1fr; }
		.guides-nav { flex-direction: row; overflow-x: auto; position: static; }
		.guides-nav__item { white-space: nowrap; }
	}
</style>
