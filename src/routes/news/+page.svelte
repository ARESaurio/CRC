<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import * as m from '$lib/paraglide/messages';
	import { Calendar, Tag, ArrowUpDown, Search, X, Pencil } from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	let { data } = $props();

	// ── Auth / admin check ──────────────────────────────────────────────────
	let isAdmin = $state(false);

	$effect(() => {
		const u = $user;
		if (u) {
			supabase
				.from('profiles')
				.select('is_admin, is_super_admin')
				.eq('user_id', u.id)
				.maybeSingle()
				.then(({ data: p }) => {
					isAdmin = !!(p?.is_admin || p?.is_super_admin);
				});
		} else {
			isAdmin = false;
		}
	});

	// ── Filter state ────────────────────────────────────────────────────────
	let selectedTag = $state<string | null>(null);
	let sortOrder = $state<'newest' | 'oldest'>('newest');
	let selectedYear = $state<string>('');
	let selectedMonth = $state<string>('');
	let tagSearch = $state('');

	// ── Tag editing state ───────────────────────────────────────────────────
	let editingTagsPostId = $state<string | null>(null);
	let editTagsList = $state<string[]>([]);
	let editTagInput = $state('');
	let savingTags = $state(false);

	// ── Derived data ────────────────────────────────────────────────────────
	const allTags = $derived.by(() => {
		const tagSet = new Set<string>();
		for (const post of data.posts) {
			for (const tag of post.tags || []) tagSet.add(tag);
		}
		return [...tagSet].sort();
	});

	const availableYears = $derived.by(() => {
		const years = new Set<string>();
		for (const post of data.posts) {
			if (post.date) years.add(new Date(post.date).getFullYear().toString());
		}
		return [...years].sort().reverse();
	});

	const availableMonths = $derived.by(() => {
		if (!selectedYear) return [];
		const months = new Set<number>();
		for (const post of data.posts) {
			if (!post.date) continue;
			const d = new Date(post.date);
			if (d.getFullYear().toString() === selectedYear) {
				months.add(d.getMonth());
			}
		}
		return [...months].sort((a, b) => a - b);
	});

	const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

	const filteredTagOptions = $derived.by(() => {
		if (!tagSearch.trim()) return allTags;
		const q = tagSearch.toLowerCase();
		return allTags.filter(t => t.toLowerCase().includes(q));
	});

	const filteredPosts = $derived.by(() => {
		let posts = data.posts;

		if (selectedTag) {
			posts = posts.filter((p: any) => p.tags?.includes(selectedTag));
		}
		if (selectedYear) {
			posts = posts.filter((p: any) => {
				if (!p.date) return false;
				return new Date(p.date).getFullYear().toString() === selectedYear;
			});
		}
		if (selectedMonth) {
			posts = posts.filter((p: any) => {
				if (!p.date) return false;
				return new Date(p.date).getMonth().toString() === selectedMonth;
			});
		}

		if (sortOrder === 'oldest') {
			posts = [...posts].reverse();
		}
		return posts;
	});

	const hasActiveFilters = $derived(!!selectedTag || !!selectedYear || !!selectedMonth);

	// ── Handlers ────────────────────────────────────────────────────────────
	function selectTag(tag: string) {
		selectedTag = tag || null;
		tagSearch = '';
	}

	function clearTag() {
		selectedTag = null;
		tagSearch = '';
	}

	function clearFilters() {
		selectedTag = null;
		selectedYear = '';
		selectedMonth = '';
		tagSearch = '';
	}

	function handleYearChange(v: string) {
		selectedYear = v;
		selectedMonth = '';
	}

	// ── Tag editing handlers ────────────────────────────────────────────────
	function startEditTags(post: any) {
		editingTagsPostId = post.id;
		editTagsList = [...(post.tags || [])];
		editTagInput = '';
	}

	function cancelEditTags() {
		editingTagsPostId = null;
		editTagsList = [];
		editTagInput = '';
	}

	function addEditTag(tag: string) {
		const t = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
		if (t && !editTagsList.includes(t)) editTagsList = [...editTagsList, t];
		editTagInput = '';
	}

	function removeEditTag(tag: string) {
		editTagsList = editTagsList.filter(t => t !== tag);
	}

	function handleEditTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			if (editTagInput.trim()) addEditTag(editTagInput);
		} else if (e.key === 'Backspace' && !editTagInput && editTagsList.length > 0) {
			editTagsList = editTagsList.slice(0, -1);
		}
	}

	async function saveEditTags() {
		if (!editingTagsPostId) return;
		savingTags = true;
		const { error } = await supabase
			.from('news_posts')
			.update({ tags: editTagsList })
			.eq('id', editingTagsPostId);

		if (!error) {
			// Update local data
			const idx = data.posts.findIndex((p: any) => p.id === editingTagsPostId);
			if (idx >= 0) data.posts[idx].tags = [...editTagsList];
			cancelEditTags();
		}
		savingTags = false;
	}


</script>

<svelte:head><title>{m.news_page_title()}</title></svelte:head>

<div class="page-width">
	<h1>{m.news_heading()}</h1>
	<p class="muted">{m.news_description()}</p>

	<!-- Filters bar -->
	<div class="filters card">
		<div class="filters__row">
			<!-- Tag typeahead -->
			<div class="filter-group">
				<label class="filter-label">Tag</label>
				{#if selectedTag}
					<button class="tag-selected" onclick={clearTag}>
						{selectedTag} <span class="tag-selected__x"><X size={14} /></span>
					</button>
				{:else}
					<Combobox.Root class="tag-combobox" type="single" bind:inputValue={tagSearch} onValueChange={(v: string) => { selectTag(v); }}>
						<Combobox.Input placeholder="Search tags…" class="filter-input" />
						<Combobox.Content class="tag-dropdown">
							{#each filteredTagOptions as tag}
								<Combobox.Item value={tag}>{tag}</Combobox.Item>
							{/each}
							{#if filteredTagOptions.length === 0}
								<div class="tag-dropdown__empty">No matching tags</div>
							{/if}
						</Combobox.Content>
					</Combobox.Root>
				{/if}
			</div>

			<!-- Year -->
			<div class="filter-group">
				<label class="filter-label">Year</label>
				<Select.Root value={selectedYear} onValueChange={(v: string) => handleYearChange(v)}>
					<Select.Trigger>{selectedYear || 'All years'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="" label="All years" />
						{#each availableYears as year}
							<Select.Item value={year} label={year} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- Month -->
			{#if selectedYear}
				<div class="filter-group">
					<label class="filter-label">Month</label>
					<Select.Root bind:value={selectedMonth}>
						<Select.Trigger>{selectedMonth ? MONTH_NAMES[Number(selectedMonth)] : 'All months'}</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label="All months" />
							{#each availableMonths as mo}
								<Select.Item value={mo.toString()} label={MONTH_NAMES[mo]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			<!-- Sort -->
			<div class="filter-group">
				<label class="filter-label">Sort</label>
				<Select.Root bind:value={sortOrder}>
					<Select.Trigger>{sortOrder === 'newest' ? m.news_sort_newest() : m.news_sort_oldest()}</Select.Trigger>
					<Select.Content>
						<Select.Item value="newest" label={m.news_sort_newest()} />
						<Select.Item value="oldest" label={m.news_sort_oldest()} />
					</Select.Content>
				</Select.Root>
			</div>

			{#if hasActiveFilters}
				<button class="btn btn--small btn--clear" onclick={clearFilters}><X size={12} /> Clear</button>
			{/if}
		</div>

		<!-- Showing count -->
		<div class="filters__count muted">
			Showing {filteredPosts.length} of {data.posts.length} post{data.posts.length !== 1 ? 's' : ''}
		</div>
	</div>

	<!-- Post list -->
	{#each filteredPosts as post (post.slug)}
		<article class="card news-post">
			<a href={localizeHref(`/news/${post.slug}`)} class="news-post__link">
				<h2>{post.title}</h2>
			</a>
			<div class="news-post__meta">
				<time class="muted">{formatDate(post.date)}</time>
				{#if post.author}<span class="muted"> · {post.author}</span>{/if}

				{#if editingTagsPostId === post.id}
					<!-- Inline tag editor -->
					<div class="inline-tag-editor">
						<div class="tag-input-wrapper">
							{#each editTagsList as tag}
								<span class="tag-pill">
									{tag}
									<button class="tag-pill__x" onclick={() => removeEditTag(tag)}><X size={14} /></button>
								</span>
							{/each}
							<input
								class="tag-input"
								type="text"
								bind:value={editTagInput}
								onkeydown={handleEditTagKeydown}
								placeholder="Add tag…"
							/>
						</div>
						<div class="inline-tag-editor__actions">
							<Button.Root variant="accent" size="sm" onclick={saveEditTags} disabled={savingTags}>
								{savingTags ? 'Saving…' : 'Save'}
							</Button.Root>
							<Button.Root size="sm" onclick={cancelEditTags}>Cancel</Button.Root>
						</div>
					</div>
				{:else}
					{#if post.tags?.length > 0}
						<span class="news-post__tags">
							{#each post.tags as tag}
								<button class="tag tag--clickable" onclick={() => selectTag(tag)}>{tag}</button>
							{/each}
						</span>
					{/if}
					{#if isAdmin}
						<button class="btn-edit-tags" onclick={() => startEditTags(post)} title="Edit tags"><Pencil size={14} /></button>
					{/if}
				{/if}
			</div>
			{#if post.excerpt}
				<p class="news-post__excerpt">{post.excerpt}</p>
			{/if}
			<div class="news-post__body markdown-body">
				{@html renderMarkdown(post.content || '')}
			</div>
		</article>
	{/each}

	{#if filteredPosts.length === 0}
		<p class="muted empty">{hasActiveFilters ? m.news_no_posts_tag() : m.news_empty()}</p>
	{/if}
</div>

<style>
	/* ── Post cards ────────────────────────────────────────────────────────── */
	.news-post { margin-bottom: 1.5rem; }
	.news-post h2 { margin: 0 0 0.25rem; }
	.news-post__link { text-decoration: none; color: var(--fg); }
	.news-post__link:hover h2 { color: var(--accent); }
	.news-post__meta { font-size: 0.85rem; margin-bottom: 0.5rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; }
	.news-post__excerpt { font-size: 0.9rem; color: var(--muted); margin: 0.25rem 0 0.75rem; font-style: italic; }
	.news-post__tags { margin-left: 0.5rem; display: inline-flex; gap: 0.25rem; flex-wrap: wrap; }
	.news-post__body { margin-top: 0.75rem; }
	.empty { text-align: center; padding: 2rem 0; }

	/* Tags */
	.tag {
		display: inline-block; padding: 0.1rem 0.4rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 4px; font-size: 0.75rem;
		color: var(--muted); margin-left: 0.25rem;
	}
	.tag--clickable {
		cursor: pointer; font-family: inherit; transition: border-color 0.15s, color 0.15s;
	}
	.tag--clickable:hover { border-color: var(--accent); color: var(--accent); }

	/* ── Markdown body styles ──────────────────────────────────────────────── */
	.news-post__body :global(h2) { margin: 1.5rem 0 0.75rem; font-size: 1.35rem; }
	.news-post__body :global(h3) { margin: 1.25rem 0 0.5rem; font-size: 1.1rem; }
	.news-post__body :global(p) { margin: 0 0 1rem; line-height: 1.7; }
	.news-post__body :global(ul), .news-post__body :global(ol) { padding-left: 1.5rem; margin: 0 0 1rem; }
	.news-post__body :global(li) { margin-bottom: 0.35rem; line-height: 1.6; }
	.news-post__body :global(a) { color: var(--accent); text-decoration: none; }
	.news-post__body :global(a:hover) { text-decoration: underline; }
	.news-post__body :global(blockquote) {
		border-left: 3px solid var(--accent);
		margin: 1rem 0; padding: 0.5rem 1rem; color: var(--muted);
	}
	.news-post__body :global(code) {
		background: var(--surface); padding: 0.15rem 0.35rem; border-radius: 3px; font-size: 0.9em;
	}
	.news-post__body :global(img) { max-width: 100%; border-radius: 8px; }
	.news-post__body :global(strong) { font-weight: 600; color: var(--fg); }
	.news-post__body :global(em) { font-style: italic; }

	/* ── Filters bar (admin-profiles pattern) ──────────────────────────────── */
	.filters {
		margin-bottom: 1.5rem;
		padding: 0.75rem 1rem;
	}
	.filters__row {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.filters__count {
		margin-top: 0.5rem;
		font-size: 0.8rem;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.filter-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	:global(.filter-input) {
		padding: 0.4rem 0.65rem;
		font-size: 0.85rem;
		font-family: inherit;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--fg);
		cursor: pointer;
		min-width: 120px;
	}
	:global(.filter-input:focus) {
		outline: none;
		border-color: var(--accent);
	}

	/* ── Tag combobox ──────────────────────────────────────────────────────── */
	:global(.tag-combobox) { position: relative; }
	:global(.tag-combobox .ui-combobox-input) { width: 160px; padding: 0.35rem 0.5rem; font-size: 0.85rem; }
	.tag-selected {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: rgba(var(--accent-rgb, 59, 195, 110), 0.08);
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}
	.tag-selected:hover { background: rgba(var(--accent-rgb, 59, 195, 110), 0.15); }
	.tag-selected__x { font-size: 0.75rem; opacity: 0.7; }
	:global(.tag-dropdown.ui-combobox-content) { min-width: 180px; }
	:global(.tag-dropdown .ui-combobox-item) { font-size: 0.85rem; }
	:global(.tag-dropdown .ui-combobox-item[data-highlighted]) { background: rgba(var(--accent-rgb, 59, 195, 110), 0.08); }
	.tag-dropdown__empty { padding: 0.5rem 0.75rem; font-size: 0.8rem; color: var(--muted); }

	/* ── Clear / small buttons ─────────────────────────────────────────────── */
	.btn {
		display: inline-flex; align-items: center; padding: 0.4rem 0.75rem;
		border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
		color: var(--fg); font-size: 0.85rem; font-weight: 600; cursor: pointer;
		font-family: inherit; transition: border-color 0.15s;
	}
	.btn--clear { align-self: flex-end; }

	/* ── Edit tags button ──────────────────────────────────────────────────── */
	.btn-edit-tags {
		display: inline-flex; align-items: center; justify-content: center;
		border: none; background: none; cursor: pointer; font-size: 0.78rem;
		padding: 0.1rem 0.3rem; opacity: 0.5; transition: opacity 0.15s;
	}
	.btn-edit-tags:hover { opacity: 1; }

	/* ── Inline tag editor ─────────────────────────────────────────────────── */
	.inline-tag-editor {
		width: 100%;
		margin-top: 0.5rem;
	}
	.tag-input-wrapper {
		display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.35rem 0.5rem;
		border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
		min-height: 34px; align-items: center;
	}
	.tag-input-wrapper:focus-within { border-color: var(--accent); }
	.tag-input {
		border: none; background: transparent; color: var(--fg);
		font-size: 0.82rem; outline: none; flex: 1; min-width: 80px; padding: 0.1rem 0;
		font-family: inherit;
	}
	.tag-pill {
		display: inline-flex; align-items: center; gap: 0.2rem;
		padding: 0.1rem 0.4rem; background: var(--accent); color: #fff;
		border-radius: 4px; font-size: 0.75rem; font-weight: 600;
	}
	.tag-pill__x {
		background: none; border: none; color: rgba(255,255,255,0.7);
		cursor: pointer; font-size: 0.8rem; padding: 0;
	}
	.tag-pill__x:hover { color: #fff; }
	.inline-tag-editor__actions {
		display: flex; gap: 0.5rem; margin-top: 0.35rem;
	}

	@media (max-width: 600px) {
		.filters__row { flex-direction: column; align-items: stretch; }
		:global(.filter-input), :global(.tag-combobox .ui-combobox-input) { width: 100%; min-width: 0; }
		:global(.tag-dropdown.ui-combobox-content) { width: 100%; }
	}
</style>
