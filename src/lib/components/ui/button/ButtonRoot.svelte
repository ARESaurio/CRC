<script lang="ts">
	import { Button } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', variant = 'default', size = 'default', children, ...restProps }: {
		class?: string; variant?: 'default' | 'accent' | 'outline' | 'ghost' | 'danger'; size?: 'default' | 'sm' | 'lg' | 'icon'; children?: Snippet; [key: string]: any;
	} = $props();
	const variantMap = { default: 'btn', accent: 'btn btn--accent', outline: 'btn btn--outline', ghost: 'btn btn--ghost', danger: 'btn btn--danger' };
	const sizeMap = { default: '', sm: 'btn--small', lg: 'btn--large', icon: 'btn--icon' };
	let variantClass = $derived(variantMap[variant] || 'btn');
	let sizeClass = $derived(sizeMap[size] || '');
</script>
<Button.Root class="{variantClass} {sizeClass} {className}" {...restProps}>{@render children?.()}</Button.Root>
