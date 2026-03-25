<script lang="ts">
	import { onMount } from 'svelte';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, Plus, Pencil, Trash2, Save , X } from 'lucide-svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(false);
	let posts = $state<any[]>([]);
	let msg = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let currentUserName = $state('');

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => Promise<void>) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => Promise<void>) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	async function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) await confirmCallback();
		confirmCallback = null;
	}

	// Editor state
	let editing = $state(false);
	let editId = $state<string | null>(null);
	let title = $state('');
	let excerpt = $state('');
	let content = $state('');
	let author = $state('');
	let tags = $state<string[]>([]);
	let tagInput = $state('');
	let featured = $state(false);
	let published = $state(true);
	let postDate = $state('');
	let imageUrl = $state('');
	let saving = $state(false);
	let previewing = $state(false);

	// Image upload state
	let imageUploading = $state(false);
	let imageTab = $state<'upload' | 'url'>('upload');

	// Tag presets
	const TAG_PRESETS = [
		'announcement', 'community-milestone', 'event', 'new-game', 'new-feature', 'maintenance', 'system-patch-notes'
	];
	let tagSuggestions = $derived.by(() => {
		if (!tagInput.trim()) return [];
		const q = tagInput.toLowerCase();
		return TAG_PRESETS.filter(t => t.includes(q) && !tags.includes(t));
	});

	function addTag(tag: string) {
		const t = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
		if (t && !tags.includes(t)) tags = [...tags, t];
		tagInput = '';
	}
	function removeTag(tag: string) { tags = tags.filter(t => t !== tag); }
	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			if (tagInput.trim()) addTag(tagInput);
		} else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
			tags = tags.slice(0, -1);
		}
	}

	// Auto-generate slug from title
	function autoSlug(t: string): string {
		return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
	}

	onMount(async () => {
		const role = await checkAdminRole();
		authorized = !!(role?.admin || role?.superAdmin);
		if (role?.runnerId) currentUserName = role.runnerId;
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
		else if (error) console.error('Failed to load news posts:', error.message);
		loading = false;
	}

	function resetForm() {
		editId = null;
		title = '';
		excerpt = '';
		content = '';
		author = currentUserName;
		tags = [];
		tagInput = '';
		featured = false;
		published = true;
		postDate = new Date().toISOString().slice(0, 16);
		imageUrl = '';
		previewing = false;
		imageTab = 'upload';
	}

	function openNew() {
		resetForm();
		editing = true;
	}

	function openEdit(post: any) {
		editId = post.id;
		title = post.title || '';
		excerpt = post.excerpt || '';
		content = post.content || '';
		author = post.author || '';
		tags = post.tags || [];
		tagInput = '';
		featured = post.featured || false;
		published = post.published ?? true;
		postDate = post.date ? new Date(post.date).toISOString().slice(0, 16) : '';
		imageUrl = post.image_url || '';
		previewing = false;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		resetForm();
	}

	async function handleImageUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			msg = { type: 'error', text: 'Only JPEG, PNG, and WebP images are allowed.' };
			setTimeout(() => msg = null, 3000);
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			msg = { type: 'error', text: 'File must be under 5MB.' };
			setTimeout(() => msg = null, 3000);
			return;
		}

		imageUploading = true;
		try {
			const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
			const fileName = `news-${Date.now()}.${ext}`;
			const { error: uploadErr } = await supabase.storage
				.from('news-images')
				.upload(fileName, file, { contentType: file.type, upsert: true });

			if (uploadErr) {
				msg = { type: 'error', text: `Upload failed: ${uploadErr.message}` };
			} else {
				const { data: urlData } = supabase.storage.from('news-images').getPublicUrl(fileName);
				imageUrl = urlData.publicUrl;
				msg = { type: 'success', text: 'Image uploaded!' };
			}
		} catch (err: any) {
			msg = { type: 'error', text: `Upload error: ${err?.message || 'Unknown'}` };
		}
		imageUploading = false;
		setTimeout(() => msg = null, 3000);
		input.value = '';
	}

	async function handleSave() {
		if (!title.trim()) {
			msg = { type: 'error', text: 'Title is required.' };
			setTimeout(() => msg = null, 3000);
			return;
		}

		saving = true;
		const slug = autoSlug(title);
		const payload = {
			title: title.trim(),
			slug,
			excerpt: excerpt.trim() || null,
			content,
			author: author.trim() || currentUserName || null,
			tags,
			featured,
			published,
			image_url: imageUrl.trim() || null,
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
		openConfirm('Delete Post', `Delete "${post.title}"? This cannot be undone.`, async () => {
			const { error } = await supabase.from('news_posts').delete().eq('id', post.id);
			if (error) {
				msg = { type: 'error', text: error.message };
			} else {
				msg = { type: 'success', text: 'Post deleted.' };
				posts = posts.filter(p => p.id !== post.id);
			}
			setTimeout(() => msg = null, 3000);
		});
	}
</script>

<svelte:head><title>{m.admin_news_title()}</title></svelte:head>

<div class="admin-news page-width">
	<p class="back"><a href={localizeHref("/admin")}>← {m.admin_dashboard()}</a></p>
	<h1>{m.admin_news_heading()}</h1>

	{#if checking}
		<p class="muted">{m.admin_checking_permissions_msg()}</p>
	{:else if !authorized}
		<p class="alert alert--error">{m.admin_news_admin_required()}</p>
	{:else}
		{#if msg}
			<div class="alert" class:alert--success={msg.type === 'success'} class:alert--error={msg.type === 'error'}>{msg.text}</div>
		{/if}

		{#if !editing}
			<!-- Post list -->
			<div class="news-toolbar">
				<Button.Root variant="accent" onclick={openNew}>+ New Post</Button.Root>
				<span class="muted">{posts.length} post{posts.length !== 1 ? 's' : ''}</span>
			</div>

			{#if loading}
				<p class="muted">{m.admin_loading()}</p>
			{:else if posts.length === 0}
				<p class="muted">{m.admin_news_no_posts()}</p>
			{:else}
				<div class="news-list">
					{#each posts as post}
						<div class="news-row" class:news-row--draft={!post.published}>
							<div class="news-row__main">
								<div class="news-row__title">
									{post.title}
									{#if post.featured}<span class="badge badge--featured">{m.admin_news_featured_field()}</span>{/if}
									{#if !post.published}<span class="badge badge--draft">{m.admin_news_draft_field()}</span>{/if}
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
								<Button.Root size="sm" onclick={() => openEdit(post)}>{m.admin_news_edit_btn()}</Button.Root>
								<Button.Root variant="danger" size="sm" onclick={() => deletePost(post)}>{m.admin_news_delete()}</Button.Root>
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
					<label for="ed-title">{m.admin_news_title_req()}</label>
					<input id="ed-title" type="text" bind:value={title} placeholder="Post title" />
					{#if title.trim()}
						<span class="slug-preview muted">Slug: {autoSlug(title)}</span>
					{/if}
				</div>

				<div class="editor__row">
					<div class="editor__field editor__field--grow">
						<label for="ed-date">{m.admin_news_date_field()}</label>
						<input id="ed-date" type="datetime-local" bind:value={postDate} />
					</div>
					<div class="editor__field editor__field--grow">
						<label for="ed-author">{m.admin_news_author_field()}</label>
						<input id="ed-author" type="text" bind:value={author} placeholder={currentUserName || 'Author name'} />
						<span class="field-hint">{m.admin_news_author_hint()}</span>
					</div>
				</div>

				<!-- Tags with typeahead -->
				<div class="editor__field">
					<label>{m.admin_news_tags_field()}</label>
					<div class="tag-input-wrapper">
						{#each tags as tag}
							<span class="tag-pill">{tag} <button type="button" class="tag-pill__x" onclick={() => removeTag(tag)}><X size={14} /></button></span>
						{/each}
						<input
							type="text"
							class="tag-input"
							bind:value={tagInput}
							onkeydown={handleTagKeydown}
							placeholder={tags.length === 0 ? 'Type and press Enter to add tags...' : 'Add more...'}
						/>
					</div>
					{#if tagSuggestions.length > 0}
						<div class="tag-suggestions">
							{#each tagSuggestions as suggestion}
								<button type="button" class="tag-suggestion" onclick={() => addTag(suggestion)}>{suggestion}</button>
							{/each}
						</div>
					{/if}
					{#if tags.length === 0}
						<div class="tag-presets">
							{#each TAG_PRESETS as preset}
								<button type="button" class="tag-preset" onclick={() => addTag(preset)}>{preset}</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="editor__field">
					<label for="ed-excerpt">{m.admin_news_excerpt_field()}</label>
					<input id="ed-excerpt" type="text" bind:value={excerpt} placeholder="A short summary shown on the news listing and homepage carousel" maxlength="300" />
					<span class="field-hint">{m.admin_news_excerpt_hint()}</span>
				</div>

				<!-- Image section -->
				<div class="editor__field">
					<label>{m.admin_news_image_field()}</label>
					{#if imageUrl}
						<div class="image-preview">
							<img src={imageUrl} alt="Post image" class="image-preview__img" />
							<div class="image-preview__actions">
								<Button.Root variant="danger" size="sm" onclick={() => imageUrl = ''}>✕ Remove</Button.Root>
							</div>
						</div>
					{/if}
					<ToggleGroup.Root class="image-tabs" bind:value={imageTab} onValueChange={(v: string) => { if (v) imageTab = v as typeof imageTab; }}>
						<ToggleGroup.Item value="upload">📷 Upload</ToggleGroup.Item>
						<ToggleGroup.Item value="url">🔗 URL</ToggleGroup.Item>
					</ToggleGroup.Root>
					{#if imageTab === 'upload'}
						<label class="image-upload-area">
							<span class="image-upload-area__icon">📷</span>
							<span>{imageUploading ? 'Uploading...' : 'Click to upload an image'}</span>
							<input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleImageUpload} hidden disabled={imageUploading} />
						</label>
						<span class="field-hint">{m.admin_news_image_hint()}</span>
					{:else if imageTab === 'url'}
						<input type="text" bind:value={imageUrl} placeholder="https://..." />
						<span class="field-hint">{m.admin_news_image_url_hint()}</span>
					{/if}
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
						<Switch.Root bind:checked={featured} />
						Featured (shows in homepage carousel)
					</label>
					<label class="check-label">
						<Switch.Root bind:checked={published} />
						Published (visible to everyone)
					</label>
				</div>

				<div class="editor__actions">
					<Button.Root onclick={cancelEdit}>{m.admin_cancel()}</Button.Root>
					<Button.Root variant="accent" onclick={handleSave} disabled={saving}>
						{saving ? 'Saving...' : editId ? 'Update Post' : 'Create Post'}
					</Button.Root>
				</div>
			</div>
		{/if}
	{/if}
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="btn btn--danger" onclick={handleConfirmAction}>Delete</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.admin-news h1 { margin: 0 0 1rem; }
	.back { margin: 0 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }

	.alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	.news-toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }

	.news-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.news-row {
		display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
		padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
	}
	.news-row--draft { opacity: 0.65; }
	.news-row__main { flex: 1; min-width: 0; }
	.news-row__title { font-weight: 600; font-size: 0.95rem; }
	.news-row__meta { font-size: 0.8rem; margin-top: 0.15rem; }
	.news-row__excerpt { font-size: 0.85rem; margin-top: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.news-row__actions { display: flex; gap: 0.5rem; flex-shrink: 0; }

	.badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; margin-left: 0.5rem; vertical-align: middle; }
	.badge--featured { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.badge--draft { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }

	.btn { display: inline-flex; align-items: center; padding: 0.4rem 0.85rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--fg); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
	.btn:hover { border-color: var(--accent); }
	.btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn--primary:hover { opacity: 0.9; }
	.btn--sm { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
	.btn--danger { color: #ef4444; }
	.btn--danger:hover { border-color: #ef4444; background: rgba(239, 68, 68, 0.08); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.editor { max-width: 800px; }
	.editor h2 { margin: 0 0 1rem; font-size: 1.25rem; }
	.editor__field { margin-bottom: 1rem; }
	.editor__field > label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
	.editor__field input[type="text"], .editor__field input[type="datetime-local"], .editor__field textarea {
		width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border);
		border-radius: 6px; background: var(--surface); color: var(--fg); font-size: 0.9rem; font-family: inherit;
	}
	.editor__field input:focus, .editor__field textarea:focus { outline: none; border-color: var(--accent); }
	.editor__field textarea { resize: vertical; min-height: 200px; font-family: 'Courier New', monospace; font-size: 0.85rem; line-height: 1.5; }
	.editor__field--grow { flex: 1; }
	.editor__row { display: flex; gap: 1rem; }
	.editor__checks { display: flex; gap: 1.5rem; margin-bottom: 1.25rem; }
	.check-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; cursor: pointer; }
	.editor__actions { display: flex; gap: 0.75rem; justify-content: flex-end; }

	.slug-preview { display: block; font-size: 0.78rem; margin-top: 0.25rem; }
	.field-hint { display: block; font-size: 0.78rem; color: var(--muted); margin-top: 0.25rem; }

	/* Tag input */
	.tag-input-wrapper {
		display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0.4rem 0.6rem;
		border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
		min-height: 38px; align-items: center;
	}
	.tag-input-wrapper:focus-within { border-color: var(--accent); }
	.tag-input { border: none; background: transparent; color: var(--fg); font-size: 0.88rem; outline: none; flex: 1; min-width: 120px; padding: 0.15rem 0; }
	.tag-pill {
		display: inline-flex; align-items: center; gap: 0.25rem;
		padding: 0.15rem 0.5rem; background: var(--accent); color: #fff;
		border-radius: 4px; font-size: 0.78rem; font-weight: 600;
	}
	.tag-pill__x { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.85rem; padding: 0 0.15rem; }
	.tag-pill__x:hover { color: #fff; }
	.tag-suggestions { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem; }
	.tag-suggestion {
		padding: 0.2rem 0.5rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.25);
		border-radius: 4px; font-size: 0.78rem; color: var(--accent); cursor: pointer;
	}
	.tag-suggestion:hover { background: rgba(99, 102, 241, 0.2); }
	.tag-presets { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem; }
	.tag-preset {
		padding: 0.15rem 0.45rem; background: none; border: 1px dashed var(--border);
		border-radius: 4px; font-size: 0.75rem; color: var(--muted); cursor: pointer;
	}
	.tag-preset:hover { border-color: var(--accent); color: var(--accent); }

	/* Image section */
	.image-preview { margin-bottom: 0.75rem; }
	.image-preview__img { max-width: 100%; max-height: 200px; border-radius: 6px; border: 1px solid var(--border); display: block; }
	.image-preview__actions { margin-top: 0.5rem; }
	:global(.image-tabs.ui-toggle-group) { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; border: none; overflow: visible; }
	:global(.image-tabs .ui-toggle-group-item) { padding: 0.3rem 0.7rem; border: 1px solid var(--border); border-radius: 6px; background: none; color: var(--muted); font-size: 0.8rem; }
	:global(.image-tabs .ui-toggle-group-item:hover) { border-color: var(--fg); color: var(--fg); background: none; }
	:global(.image-tabs .ui-toggle-group-item[data-state="on"]) { background: var(--accent); color: #fff; border-color: var(--accent); }
	.image-upload-area {
		display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
		padding: 1.5rem; border: 2px dashed var(--border); border-radius: 8px;
		cursor: pointer; color: var(--muted); font-size: 0.88rem;
	}
	.image-upload-area:hover { border-color: var(--accent); color: var(--accent); }
	.image-upload-area__icon { font-size: 1.5rem; }

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
