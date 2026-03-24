<script lang="ts">
	import { Button } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', variant = 'default', size = 'default', children, ...restProps }: {
		class?: string; variant?: 'default' | 'accent' | 'outline' | 'ghost' | 'danger'; size?: 'default' | 'sm' | 'lg' | 'icon'; children?: Snippet; [key: string]: any;
	} = $props();
	const variantClass = { default: 'btn', accent: 'btn btn--accent', outline: 'btn btn--outline', ghost: 'btn btn--ghost', danger: 'btn btn--danger' }[variant] || 'btn';
	const sizeClass = { default: '', sm: 'btn--small', lg: 'btn--large', icon: 'btn--icon' }[size] || '';
</script>
<Button.Root class="{variantClass} {sizeClass} {className}" {...restProps}>{@render children?.()}</Button.Root>
