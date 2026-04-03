<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, Plus, Save, Trash2, Pencil, X, Search, BookOpen } from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';

	let { data } = $props();

	let checking = $state(true);
	let authorized = $state(false);

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto(localizeHref('/sign-in?redirect=/admin/tooltips')); return; }
				const role = await checkAdminRole();
				authorized = !!(role?.admin || role?.superAdmin);
				checking = false;
			}
		});
		return unsub;
	});

	// ── State ───────────────────────────────────────────────────────────────
	interface GlossaryTerm {
		id: string;
		slug: string;
		label: string;
		definition: string;
		aliases: string[];
		created_at: string;
		updated_at: string;
	}

	let terms = $state<GlossaryTerm[]>(data.terms || []);
	$effect(() => { terms = data.terms || []; });
	let searchQuery = $state('');
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let saving = $state(false);

	// ── Edit / Add form ─────────────────────────────────────────────────────
	let editingId = $state<string | null>(null);
	let formSlug = $state('');
	let formLabel = $state('');
	let formDefinition = $state('');
	let formAliases = $state('');
	let showAddForm = $state(false);

	const filteredTerms = $derived.by(() => {
		if (!searchQuery.trim()) return terms;
		const q = searchQuery.toLowerCase();
		return terms.filter(t =>
			t.label.toLowerCase().includes(q) ||
			t.slug.toLowerCase().includes(q) ||
			t.definition.toLowerCase().includes(q) ||
			t.aliases?.some(a => a.toLowerCase().includes(q))
		);
	});

	function slugify(text: string): string {
		return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
	}

	function startAdd() {
		editingId = null;
		formSlug = '';
		formLabel = '';
		formDefinition = '';
		formAliases = '';
		showAddForm = true;
	}

	function startEdit(term: GlossaryTerm) {
		editingId = term.id;
		formSlug = term.slug;
		formLabel = term.label;
		formDefinition = term.definition;
		formAliases = (term.aliases || []).join(', ');
		showAddForm = true;
	}

	function cancelForm() {
		showAddForm = false;
		editingId = null;
	}

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => { toast = null; }, 3000);
	}

	async function saveTerm() {
		if (!formLabel.trim() || !formDefinition.trim()) {
			showToast('error', 'Label and definition are required.');
			return;
		}

		const slug = formSlug.trim() || slugify(formLabel);
		const aliases = formAliases.split(',').map(a => a.trim()).filter(Boolean);

		saving = true;

		if (editingId) {
			// Update
			const { error } = await supabase
				.from('glossary_terms')
				.update({
					slug,
					label: formLabel.trim(),
					definition: formDefinition.trim(),
					aliases,
					updated_at: new Date().toISOString()
				})
				.eq('id', editingId);

			if (error) {
				showToast('error', `Failed to update: ${error.message}`);
			} else {
				const idx = terms.findIndex(t => t.id === editingId);
				if (idx !== -1) {
					terms[idx] = { ...terms[idx], slug, label: formLabel.trim(), definition: formDefinition.trim(), aliases, updated_at: new Date().toISOString() };
					terms = [...terms];
				}
				showToast('success', `Updated "${formLabel.trim()}".`);
				cancelForm();
			}
		} else {
			// Insert
			const { data: inserted, error } = await supabase
				.from('glossary_terms')
				.insert({
					slug,
					label: formLabel.trim(),
					definition: formDefinition.trim(),
					aliases
				})
				.select()
				.single();

			if (error) {
				showToast('error', `Failed to add: ${error.message}`);
			} else if (inserted) {
				terms = [...terms, inserted].sort((a, b) => a.label.localeCompare(b.label));
				showToast('success', `Added "${formLabel.trim()}".`);
				cancelForm();
			}
		}

		saving = false;
	}

	// ── Delete ──────────────────────────────────────────────────────────────
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

	function deleteTerm(term: GlossaryTerm) {
		openConfirm(
			'Delete Term',
			`Delete "${term.label}"? Any {{tooltip:${term.slug}}} references in content will stop rendering as tooltips.`,
			async () => {
				const { error } = await supabase.from('glossary_terms').delete().eq('id', term.id);
				if (error) {
					showToast('error', `Failed to delete: ${error.message}`);
				} else {
					terms = terms.filter(t => t.id !== term.id);
					showToast('success', `Deleted "${term.label}".`);
					if (editingId === term.id) cancelForm();
				}
			}
		);
	}
</script>

<svelte:head><title>Glossary Tooltips — Admin</title></svelte:head>

{#if checking}
	<div class="admin-page"><div class="center-sm"><div class="spinner"></div></div></div>
{:else if !authorized}
	<div class="admin-page"><div class="card"><div class="empty"><Lock size={32} /><h3>Access Denied</h3><p class="muted">Admin access required.</p></div></div></div>
{:else}
	<div class="admin-page">
		<div class="page-header">
			<div class="page-header__title">
				<BookOpen size={24} />
				<h1>Glossary Tooltips</h1>
				<span class="muted">({terms.length} term{terms.length !== 1 ? 's' : ''})</span>
			</div>
			<p class="muted">Define terms that can be referenced in markdown content with <code>{`{{tooltip:slug}}`}</code> syntax. Hovering the term shows the definition.</p>
		</div>

		{#if toast}
			<div class="toast toast--{toast.type}">{toast.text}</div>
		{/if}

		<!-- Toolbar -->
		<div class="toolbar card">
			<div class="toolbar__search">
				<Search size={16} />
				<input type="text" class="toolbar__input" placeholder="Search terms…" bind:value={searchQuery} />
			</div>
			<Button.Root variant="accent" size="sm" onclick={startAdd}><Plus size={14} /> Add Term</Button.Root>
		</div>

		<!-- Add / Edit Form -->
		{#if showAddForm}
			<div class="card form-card">
				<h3>{editingId ? 'Edit Term' : 'Add New Term'}</h3>
				<div class="form-grid">
					<div class="form-field">
						<label class="form-field__label" for="term-label">Label <span class="required">*</span></label>
						<input id="term-label" type="text" class="form-field__input" bind:value={formLabel} placeholder="e.g. Hitless" oninput={() => { if (!editingId) formSlug = slugify(formLabel); }} />
					</div>
					<div class="form-field">
						<label class="form-field__label" for="term-slug">Slug</label>
						<input id="term-slug" type="text" class="form-field__input form-field__input--mono" bind:value={formSlug} placeholder="auto-generated" />
						<span class="form-field__hint">Used in <code>{`{{tooltip:${formSlug || 'slug'}}}`}</code></span>
					</div>
					<div class="form-field form-field--full">
						<label class="form-field__label" for="term-def">Definition <span class="required">*</span></label>
						<textarea id="term-def" class="form-field__input form-field__textarea" bind:value={formDefinition} placeholder="Brief explanation shown on hover…" rows="3"></textarea>
					</div>
					<div class="form-field form-field--full">
						<label class="form-field__label" for="term-aliases">Aliases</label>
						<input id="term-aliases" type="text" class="form-field__input" bind:value={formAliases} placeholder="e.g. no-hit, no hit, NH (comma-separated)" />
						<span class="form-field__hint">Alternative names that also match this term.</span>
					</div>
				</div>

				{#if formLabel && formDefinition}
					<div class="form-preview">
						<span class="form-preview__label">Preview:</span>
						<span class="glossary-tip" tabindex="0" data-def={formDefinition}>{formLabel}</span>
					</div>
				{/if}

				<div class="form-actions">
					<Button.Root variant="accent" onclick={saveTerm} disabled={saving || !formLabel.trim() || !formDefinition.trim()}>
						<Save size={14} /> {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
					</Button.Root>
					<Button.Root variant="ghost" onclick={cancelForm}>Cancel</Button.Root>
				</div>
			</div>
		{/if}

		<!-- Terms List -->
		{#if filteredTerms.length === 0}
			<div class="card"><div class="empty"><span class="empty__icon"><BookOpen size={24} /></span><h3>{searchQuery ? 'No matching terms' : 'No terms yet'}</h3><p class="muted">{searchQuery ? 'Try a different search.' : 'Add your first glossary term above.'}</p></div></div>
		{:else}
			<div class="terms-list">
				{#each filteredTerms as term (term.id)}
					<div class="term-card card" class:term-card--editing={editingId === term.id}>
						<div class="term-card__header">
							<div class="term-card__title">
								<span class="glossary-tip" tabindex="0" data-def={term.definition}>{term.label}</span>
								<code class="term-card__slug">{`{{tooltip:${term.slug}}}`}</code>
							</div>
							<div class="term-card__actions">
								<Button.Root size="sm" onclick={() => startEdit(term)} aria-label="Edit"><Pencil size={14} /></Button.Root>
								<button class="btn btn--small btn--danger-text" onclick={() => deleteTerm(term)} aria-label="Delete"><Trash2 size={14} /></button>
							</div>
						</div>
						<p class="term-card__def">{term.definition}</p>
						{#if term.aliases?.length}
							<div class="term-card__aliases">
								{#each term.aliases as alias}
									<span class="term-card__alias">{alias}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Delete confirmation -->
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
{/if}

<style>
	.admin-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }

	/* Header */
	.page-header { margin-bottom: 1.5rem; }
	.page-header__title { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
	.page-header__title h1 { margin: 0; font-size: 1.5rem; }
	.page-header p { margin: 0; font-size: 0.9rem; line-height: 1.5; }
	.page-header code { background: var(--surface); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.82rem; }

	/* Toolbar */
	.toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; margin-bottom: 1rem; }
	.toolbar__search { flex: 1; display: flex; align-items: center; gap: 0.5rem; color: var(--muted); }
	.toolbar__input { flex: 1; background: none; border: none; color: var(--fg); font-family: inherit; font-size: 0.9rem; outline: none; }

	/* Form card */
	.form-card { padding: 1.25rem; margin-bottom: 1.5rem; border-left: 3px solid var(--accent); }
	.form-card h3 { margin: 0 0 1rem; font-size: 1.05rem; }
	.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.form-field--full { grid-column: 1 / -1; }
	.form-field__label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--muted); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
	.required { color: #ef4444; }
	.form-field__input { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9rem; }
	.form-field__input:focus { border-color: var(--accent); outline: none; }
	.form-field__input--mono { font-family: monospace; font-size: 0.85rem; }
	.form-field__textarea { resize: vertical; min-height: 60px; line-height: 1.5; }
	.form-field__hint { display: block; margin-top: 0.2rem; font-size: 0.75rem; color: var(--muted); }
	.form-field__hint code { background: var(--surface); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.75rem; }
	.form-preview { margin-top: 1rem; padding: 0.75rem; background: var(--bg); border-radius: 6px; border: 1px dashed var(--border); }
	.form-preview__label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-right: 0.5rem; }
	.form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }

	/* Terms list */
	.terms-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.term-card { padding: 0.75rem 1rem; transition: border-color 0.15s; }
	.term-card--editing { border-color: var(--accent); }
	.term-card__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
	.term-card__title { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.term-card__slug { font-size: 0.75rem; padding: 0.15rem 0.4rem; background: var(--bg); border-radius: 4px; color: var(--muted); }
	.term-card__actions { display: flex; gap: 0.25rem; flex-shrink: 0; }
	.term-card__def { margin: 0.5rem 0 0; font-size: 0.9rem; line-height: 1.5; color: var(--fg); }
	.term-card__aliases { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.5rem; }
	.term-card__alias { font-size: 0.75rem; padding: 0.15rem 0.45rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--muted); }

	/* Toast */
	.toast { padding: 0.6rem 1rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1rem; }
	.toast--success { background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

	/* Empty state */
	.empty { text-align: center; padding: 3rem 1rem; }
	.empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
	.empty h3 { margin: 0 0 0.5rem; }

	/* Responsive */
	@media (max-width: 600px) {
		.form-grid { grid-template-columns: 1fr; }
		.toolbar { flex-direction: column; align-items: stretch; }
	}
</style>
