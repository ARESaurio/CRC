<script lang="ts">
	/**
	 * RetroToolbar — phpBB-style formatting toolbar that outputs markdown.
	 *
	 * Usage: <RetroToolbar bind:textarea={textareaEl} />
	 * The toolbar inserts markdown syntax around the current selection
	 * in the bound <textarea> element.
	 */

	let { textarea = $bindable() }: { textarea?: HTMLTextAreaElement | null } = $props();

	function wrap(before: string, after: string) {
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = textarea.value.slice(start, end) || 'text';
		const replacement = before + selected + after;

		textarea.setRangeText(replacement, start, end, 'select');
		textarea.focus();
		// Trigger reactive update
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function insertLine(prefix: string) {
		if (!textarea) return;
		const start = textarea.selectionStart;
		const before = textarea.value.slice(0, start);
		const needsNewline = before.length > 0 && !before.endsWith('\n');
		const insertion = (needsNewline ? '\n' : '') + prefix;

		textarea.setRangeText(insertion, start, start, 'end');
		textarea.focus();
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	}

	const buttons = [
		{ label: 'B', title: 'Bold', action: () => wrap('**', '**') },
		{ label: 'I', title: 'Italic', action: () => wrap('*', '*') },
		{ label: 'U', title: 'Underline', action: () => wrap('<u>', '</u>') },
		{ label: 'S', title: 'Strikethrough', action: () => wrap('~~', '~~') },
		{ label: '—', title: 'Separator', action: null },
		{ label: 'Link', title: 'Insert link', action: () => wrap('[', '](https://)') },
		{ label: 'Img', title: 'Insert image', action: () => wrap('![', '](https://)') },
		{ label: '—', title: 'Separator', action: null },
		{ label: 'Quote', title: 'Blockquote', action: () => insertLine('> ') },
		{ label: 'Code', title: 'Inline code', action: () => wrap('`', '`') },
		{ label: 'List', title: 'Bullet list', action: () => insertLine('- ') },
		{ label: 'H2', title: 'Heading', action: () => insertLine('## ') },
	];
</script>

<div class="retro-toolbar">
	{#each buttons as btn}
		{#if btn.action === null}
			<span class="retro-toolbar__sep"></span>
		{:else}
			<button
				type="button"
				class="retro-toolbar__btn"
				class:retro-toolbar__btn--bold={btn.label === 'B'}
				class:retro-toolbar__btn--italic={btn.label === 'I'}
				class:retro-toolbar__btn--underline={btn.label === 'U'}
				title={btn.title}
				onclick={btn.action}
			>
				{btn.label}
			</button>
		{/if}
	{/each}
</div>

<style>
	.retro-toolbar {
		display: flex;
		align-items: center;
		gap: 1px;
		padding: 3px 4px;
		background: linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
		border: 1px solid var(--border);
		border-bottom: none;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
	}

	.retro-toolbar__btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 26px;
		padding: 0 6px;
		background: rgba(255,255,255,0.04);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 3px;
		color: var(--text-muted);
		font-family: 'Courier New', monospace;
		font-size: 0.78rem;
		cursor: pointer;
		transition: all 0.1s;
	}

	.retro-toolbar__btn:hover {
		background: rgba(255,255,255,0.1);
		border-color: rgba(255,255,255,0.2);
		color: var(--fg);
	}

	.retro-toolbar__btn:active {
		background: rgba(255,255,255,0.06);
		transform: translateY(1px);
	}

	.retro-toolbar__btn--bold { font-weight: 900; }
	.retro-toolbar__btn--italic { font-style: italic; }
	.retro-toolbar__btn--underline { text-decoration: underline; }

	.retro-toolbar__sep {
		width: 1px;
		height: 18px;
		background: var(--border);
		margin: 0 3px;
	}
</style>
