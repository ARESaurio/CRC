<script lang="ts">
	import { Avatar } from 'bits-ui';
	let { class: className = '', src, alt = '', ...restProps }: { class?: string; src?: string; alt?: string; [key: string]: any } = $props();
</script>
<Avatar.Image class="ui-avatar__img {className}" {src} {alt} {...restProps} />
<style>:global(.ui-avatar__img) { width: 100%; height: 100%; object-fit: cover; }</style>
