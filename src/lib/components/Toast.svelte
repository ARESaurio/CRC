<script lang="ts">
	import { CheckCircle, XCircle, Info, X } from 'lucide-svelte';
	import { toasts, dismissToast } from '$stores/toast';
</script>

{#if $toasts.length > 0}
	<div class="toast-container" aria-live="polite">
		{#each $toasts as toast (toast.id)}
			<div class="toast toast--{toast.type}">
				<span class="toast__icon">
					{#if toast.type === 'success'}<CheckCircle size={16} />{:else if toast.type === 'error'}<XCircle size={16} />{:else}<Info size={16} />{/if}
				</span>
				<span class="toast__text">{toast.text}</span>
				<button class="toast__close" onclick={() => dismissToast(toast.id)} aria-label="Dismiss"><X size={14} /></button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 380px;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border-radius: 10px;
		font-size: 0.9rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		animation: toast-in 0.25s ease-out;
	}
	.toast--success {
		background: rgba(16, 185, 129, 0.15);
		border: 1px solid rgba(16, 185, 129, 0.3);
		color: #6ee7b7;
	}
	.toast--error {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #fca5a5;
	}
	.toast--info {
		background: rgba(59, 130, 246, 0.15);
		border: 1px solid rgba(59, 130, 246, 0.3);
		color: #93c5fd;
	}
	.toast__icon { flex-shrink: 0; font-size: 1rem; }
	.toast__text { flex: 1; }
	.toast__close {
		flex-shrink: 0;
		background: none;
		border: none;
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
		padding: 0.15rem 0.25rem;
		font-size: 0.85rem;
		line-height: 1;
	}
	.toast__close:hover { opacity: 1; }

	@keyframes toast-in {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@media (max-width: 640px) {
		.toast-container {
			left: 1rem;
			right: 1rem;
			bottom: 1rem;
			max-width: none;
		}
	}
</style>
