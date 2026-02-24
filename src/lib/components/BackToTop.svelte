<script lang="ts">
	import { onMount } from 'svelte';

	const MIN_PAGE_HEIGHT = 600;
	const SCROLL_PERCENTAGE = 0.75;
	const FALLBACK_THRESHOLD = 300;

	let visible = $state(false);

	function shouldShow(): boolean {
		const scrollTop = window.scrollY;
		const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;

		if (scrollableHeight <= 0) return false;

		if (scrollableHeight >= MIN_PAGE_HEIGHT) {
			return scrollTop / scrollableHeight >= SCROLL_PERCENTAGE;
		}

		return scrollTop >= Math.min(FALLBACK_THRESHOLD, scrollableHeight * 0.5);
	}

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	onMount(() => {
		function onScroll() {
			visible = shouldShow();
		}
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<button
	class="back-to-top"
	class:back-to-top--visible={visible}
	onclick={scrollToTop}
	aria-label="Back to top"
>
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
		<path d="M8 13V3" />
		<path d="M3 7l5-5 5 5" />
	</svg>
</button>

<style>
	.back-to-top {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 90;

		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 36px;

		color: #fff;
		background: var(--accent);
		border: none;
		border-radius: 8px;
		cursor: pointer;

		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);

		opacity: 0;
		pointer-events: none;
		transform: translateY(12px);
		transition: transform 0.25s ease, opacity 0.25s ease, background 0.15s ease;
	}

	.back-to-top--visible {
		opacity: 1;
		pointer-events: auto;
		transform: translateY(0);
	}

	.back-to-top:hover {
		transform: translateY(-2px);
		filter: brightness(1.1);
	}

	.back-to-top:focus {
		outline: 2px solid var(--focus, var(--accent));
		outline-offset: 2px;
	}

	@media (max-width: 600px) {
		.back-to-top {
			bottom: 1rem;
			right: 1rem;
			width: 40px;
			height: 32px;
		}
	}
</style>
