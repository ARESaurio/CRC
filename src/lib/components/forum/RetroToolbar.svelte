<script lang="ts">
	import { Bold, Italic, Underline, Strikethrough, Link, Image, Quote, Code, List, Heading2 } from 'lucide-svelte';

	let { textarea = $bindable() }: { textarea?: HTMLTextAreaElement | null } = $props();

	function wrap(before: string, after: string) {
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = textarea.value.slice(start, end) || 'text';
		const replacement = before + selected + after;
		textarea.setRangeText(replacement, start, end, 'select');
		textarea.focus();
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

	const buttons: { icon: typeof Bold; title: string; action: (() => void) | null }[] = [
		{ icon: Bold, title: 'Bold', action: () => wrap('**', '**') },
		{ icon: Italic, title: 'Italic', action: () => wrap('*', '*') },
		{ icon: Underline, title: 'Underline', action: () => wrap('<u>', '</u>') },
		{ icon: Strikethrough, title: 'Strikethrough', action: () => wrap('~~', '~~') },
		{ icon: Bold, title: 'sep', action: null },
		{ icon: Link, title: 'Insert link', action: () => wrap('[', '](https://)') },
		{ icon: Image, title: 'Insert image', action: () => wrap('![', '](https://)') },
		{ icon: Bold, title: 'sep', action: null },
		{ icon: Quote, title: 'Blockquote', action: () => insertLine('> ') },
		{ icon: Code, title: 'Inline code', action: () => wrap('`', '`') },
		{ icon: List, title: 'Bullet list', action: () => insertLine('- ') },
		{ icon: Heading2, title: 'Heading', action: () => insertLine('## ') },
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
				title={btn.title}
				onclick={btn.action}
			>
				<btn.icon size={14} />
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
		padding: 0 5px;
		background: rgba(255,255,255,0.04);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 3px;
		color: var(--text-muted);
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

	.retro-toolbar__sep {
		width: 1px;
		height: 18px;
		background: var(--border);
		margin: 0 3px;
	}
</style>
