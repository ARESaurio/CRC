<script lang="ts">
	import { Slider } from 'bits-ui';
	let { value = $bindable([50]), type = 'multiple' as const, min = 0, max = 100, step = 1, class: className = '', ...restProps }: { value?: number[]; type?: 'single' | 'multiple'; min?: number; max?: number; step?: number; class?: string; [key: string]: any } = $props();
</script>
<Slider.Root bind:value type={type as any} {min} {max} {step} class="ui-slider {className}" {...restProps}>
	<Slider.Range class="ui-slider__range" />
	{#each value as _, i}
		<Slider.Thumb index={i} class="ui-slider__thumb" />
	{/each}
</Slider.Root>
<style>
	:global(.ui-slider) { position: relative; display: flex; align-items: center; width: 100%; height: 20px; touch-action: none; }
	:global(.ui-slider [data-slider-track]) { position: relative; height: 4px; width: 100%; border-radius: 2px; background: var(--border); }
	:global(.ui-slider__range) { position: absolute; height: 100%; border-radius: 2px; background: var(--accent); }
	:global(.ui-slider__thumb) { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid var(--accent); cursor: grab; transition: box-shadow 0.15s; }
	:global(.ui-slider__thumb:focus-visible) { outline: none; box-shadow: 0 0 0 3px var(--focus-2); }
</style>
