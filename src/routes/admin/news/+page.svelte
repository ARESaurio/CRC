<script lang="ts">
	import { onMount } from 'svelte';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(false);
	let posts = $state<any[]>([]);
	let msg = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Editor state
	let editing = $state(false);
	let editId = $state<string | null>(null);
	let title = $state('');
	let slug = $state('');
	let excerpt = $state('');
	let content = $state('');
	let author = $state('');
	let tags = $state('');
	let featured = $state(false);
	let published = $state(true);
	let postDate = $state('');
	let saving = $state(false);
	let previewing = $state(false);
	let slugManual = $state(false);

	// Auto-generate slug from title (unless manually edited)
	function autoSlug(t: string): string {
		return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
	}

	function handleTitleInput() {
		if (!slugManual) slug = autoSlug(title);
	}

	function handleSlugInput() {
		slugManual = true;
	}

	onMount(async () => {
		const role = await checkAdminRole();
		authorized = !!(role?.admin || role?.superAdmin);
		checking = false;
		if (authorized) await loadPosts();
	});

	async function loadPosts() {
		loading = true;
		const { data, error } = await supabase
			.from('news_posts')
			.select('*')
			.order('date', { ascending: false });
		if (!error && data) posts = data;
		loading = false;
	}

	function resetForm() {
		editId = null;
		title = '';
		slug = '';
		excerpt = '';
		content = '';
		author = '';
		tags = '';
		featured = false;
		published = true;
		postDate = new Date().toISOString().slice(0, 16);
		slugManual = false;
		previewing = false;
	}

	function openNew() {
		resetForm();
		editing = true;
	}

	function openEdit(post: any) {
		editId = post.id;
		title = post.title || '';
		slug = post.slug || '';
		excerpt = post.excerpt || '';
		content = post.content || '';
		author = post.author || '';
		tags = (post.tags || []).join(', ');
		featured = post.featured || false;
		published = post.published ?? true;
		postDate = post.date ? new Date(post.date).toISOString().slice(0, 16) : '';
		slugManual = true;
		previewing = false;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		resetForm();
	}

	async function handleSave() {
		if (!title.trim() || !slug.trim()) {
			msg = { type: 'error', text: 'Title and slug are required.' };
			setTimeout(() => msg = null, 3000);
			return;
		}

		saving = true;
		const payload = {
			title: title.trim(),
			slug: slug.trim(),
			excerpt: excerpt.trim(),
			content,
			author: author.trim(),
			tags: tags.split(',').map(t => t.trim()).filter(Boolean),
			featured,
			published,
			date: postDate ? new Date(postDate).toISOString() : new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		let error;
		if (editId) {
			({ error } = await supabase.from('news_posts').update(payload).eq('id', editId));
		} else {
			({ error } = await supabase.from('news_posts').insert(payload));
		}

		if (error) {
			msg = { type: 'error', text: error.message };
		} else {
			msg = { type: 'success', text: editId ? 'Post updated.' : 'Post created.' };
			editing = false;
			resetForm();
			await loadPosts();
		}
		saving = false;
		setTimeout(() => msg = null, 3000);
	}

	async function deletePost(post: any) {
		if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
		const { error } = await supabase.from('news_posts').delete().eq('id', post.id);
		if (error) {
			msg = { type: 'error', text: error.message };
		} else {
			msg = { type: 'success', text: 'Post deleted.' };
			posts = posts.filter(p => p.id !== post.id);
		}
		setTimeout(() => msg = null, 3000);
	}
</script>

<svelte:head><title>News Manager | Admin</title></svelte:head>

<div class="admin-news page-width">
	<h1>📰 News Manager</h1>

	{#if checking}
		<p class="muted">Checking permissions...</p>
	{:else if !authorized}
		<p class="alert alert--error">Admin access required.</p>
	{:else}
		{#if msg}
			<div class="alert" class:alert--success={msg.type === 'success'} class:alert--error={msg.type === 'error'}>{msg.text}</div>
		{/if}

		{#if !editing}
			<!-- Post list -->
			<div class="news-toolbar">
				<button type="button" class="btn btn--primary" onclick={openNew}>+ New Post</button>
				<span class="muted">{posts.length} post{posts.length !== 1 ? 's' : ''}</span>
			</div>

			{#if loading}
				<p class="muted">Loading...</p>
			{:else if posts.length === 0}
				<p class="muted">No posts yet. Create your first one!</p>
			{:else}
				<div class="news-list">
					{#each posts as post}
						<div class="news-row" class:news-row--draft={!post.published}>
							<div class="news-row__main">
								<div class="news-row__title">
									{post.title}
									{#if post.featured}<span class="badge badge--featured">Featured</span>{/if}
									{#if !post.published}<span class="badge badge--draft">Draft</span>{/if}
								</div>
								<div class="news-row__meta muted">
									{formatDate(post.date)}
									{#if post.author} · {post.author}{/if}
									{#if post.tags?.length > 0} · {post.tags.join(', ')}{/if}
								</div>
								{#if post.excerpt}
									<div class="news-row__excerpt muted">{post.excerpt}</div>
								{/if}
							</div>
							<div class="news-row__actions">
								<button type="button" class="btn btn--sm" onclick={() => openEdit(post)}>Edit</button>
								<button type="button" class="btn btn--sm btn--danger" onclick={() => deletePost(post)}>Delete</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

		{:else}
			<!-- Editor -->
			<div class="editor">
				<h2>{editId ? 'Edit Post' : 'New Post'}</h2>

				<div class="editor__field">
					<label for="ed-title">Title *</label>
					<input id="ed-title" type="text" bind:value={title} oninput={handleTitleInput} placeholder="Post title" />
				</div>

				<div class="editor__field">
					<label for="ed-slug">Slug *</label>
					<input id="ed-slug" type="text" bind:value={slug} oninput={handleSlugInput} placeholder="url-friendly-slug" />
				</div>

				<div class="editor__row">
					<div class="editor__field editor__field--grow">
						<label for="ed-date">Date</label>
						<input id="ed-date" type="datetime-local" bind:value={postDate} />
					</div>
					<div class="editor__field editor__field--grow">
						<label for="ed-author">Author</label>
						<input id="ed-author" type="text" bind:value={author} placeholder="Author name" />
					</div>
				</div>

				<div class="editor__field">
					<label for="ed-tags">Tags <span class="muted">(comma-separated)</span></label>
					<input id="ed-tags" type="text" bind:value={tags} placeholder="patch-notes, release" />
				</div>

				<div class="editor__field">
					<label for="ed-excerpt">Excerpt</label>
					<input id="ed-excerpt" type="text" bind:value={excerpt} placeholder="Short description for the homepage carousel" />
				</div>

				<div class="editor__field">
					<label>
						Content <span class="muted">(Markdown)</span>
						<button type="button" class="btn btn--sm preview-btn" onclick={() => previewing = !previewing}>
							{previewing ? '✏️ Edit' : '👁️ Preview'}
						</button>
					</label>
					{#if previewing}
						<div class="editor__preview markdown-body">
							{@html renderMarkdown(content)}
						</div>
					{:else}
						<textarea id="ed-content" bind:value={content} rows="18" placeholder="Write your post in markdown..."></textarea>
					{/if}
				</div>

				<div class="editor__checks">
					<label class="check-label">
						<input type="checkbox" bind:checked={featured} />
						Featured (shows in homepage carousel)
					</label>
					<label class="check-label">
						<input type="checkbox" bind:checked={published} />
						Published (visible to everyone)
					</label>
				</div>

				<div class="editor__actions">
					<button type="button" class="btn" onclick={cancelEdit}>Cancel</button>
					<button type="button" class="btn btn--primary" onclick={handleSave} disabled={saving}>
						{saving ? 'Saving...' : editId ? 'Update Post' : 'Create Post'}
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.admin-news h1 { margin: 0 0 1rem; }

	/* Alerts */
	.alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	/* Toolbar */
	.news-toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }

	/* Post list */
	.news-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.news-row {
		display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
		padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 8px;
	}
	.news-row--draft { opacity: 0.65; }
	.news-row__main { flex: 1; min-width: 0; }
	.news-row__title { font-weight: 600; font-size: 0.95rem; }
	.news-row__meta { font-size: 0.8rem; margin-top: 0.15rem; }
	.news-row__excerpt { font-size: 0.85rem; margin-top: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.news-row__actions { display: flex; gap: 0.5rem; flex-shrink: 0; }

	/* Badges */
	.badge {
		display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px;
		font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
		margin-left: 0.5rem; vertical-align: middle;
	}
	.badge--featured { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.badge--draft { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }

	/* Buttons */
	.btn {
		display: inline-flex; align-items: center; padding: 0.4rem 0.85rem;
		border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
		color: var(--fg); font-size: 0.85rem; font-weight: 600; cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}
	.btn:hover { border-color: var(--accent); }
	.btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn--primary:hover { opacity: 0.9; }
	.btn--sm { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
	.btn--danger { color: #ef4444; }
	.btn--danger:hover { border-color: #ef4444; background: rgba(239, 68, 68, 0.08); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Editor */
	.editor { max-width: 800px; }
	.editor h2 { margin: 0 0 1rem; font-size: 1.25rem; }
	.editor__field { margin-bottom: 1rem; }
	.editor__field label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
	.editor__field input, .editor__field textarea {
		width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border);
		border-radius: 6px; background: var(--surface); color: var(--fg);
		font-size: 0.9rem; font-family: inherit;
	}
	.editor__field input:focus, .editor__field textarea:focus { outline: none; border-color: var(--accent); }
	.editor__field textarea { resize: vertical; min-height: 200px; font-family: 'Courier New', monospace; font-size: 0.85rem; line-height: 1.5; }
	.editor__field--grow { flex: 1; }
	.editor__row { display: flex; gap: 1rem; }
	.editor__checks { display: flex; gap: 1.5rem; margin-bottom: 1.25rem; }
	.check-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; cursor: pointer; }
	.check-label input { width: auto; cursor: pointer; }
	.editor__actions { display: flex; gap: 0.75rem; justify-content: flex-end; }

	/* Preview */
	.preview-btn { margin-left: auto; }
	.editor__preview {
		padding: 1rem; border: 1px solid var(--border); border-radius: 6px;
		background: var(--surface); min-height: 200px;
	}
	.editor__preview :global(h2) { margin: 1.5rem 0 0.75rem; font-size: 1.35rem; }
	.editor__preview :global(h3) { margin: 1.25rem 0 0.5rem; font-size: 1.1rem; }
	.editor__preview :global(p) { margin: 0 0 1rem; line-height: 1.7; }
	.editor__preview :global(ul), .editor__preview :global(ol) { padding-left: 1.5rem; margin: 0 0 1rem; }
	.editor__preview :global(li) { margin-bottom: 0.35rem; line-height: 1.6; }
	.editor__preview :global(a) { color: var(--accent); }

	.muted { opacity: 0.6; }

	@media (max-width: 600px) {
		.editor__row { flex-direction: column; gap: 0; }
		.news-row { flex-direction: column; }
		.news-row__actions { align-self: flex-end; }
		.editor__checks { flex-direction: column; gap: 0.5rem; }
	}
</style>
