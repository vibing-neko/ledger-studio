<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
	<main class="container placeholder">
		<p class="eyebrow">Tool {{ route.meta.index }}</p>
		<h1 class="placeholder-title">{{ route.meta.title }}</h1>
		<p class="lead lead-balance placeholder-desc">這個工具正在打造中，完成後會出現在這裡。</p>
		<RouterLink to="/" class="btn">
			<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="transform: scaleX(-1)">
				<path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			回到總覽
		</RouterLink>
	</main>
</template>

<style scoped>
.placeholder {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	gap: 1.25rem;
	min-height: calc(100svh - 12rem);
	padding-block: 4rem;
}

.placeholder-title {
	font-family: var(--font-serif);
	font-size: clamp(2.2rem, 5vw, 4rem);
	font-weight: 900;
	line-height: 1.2;
}

.placeholder-desc {
	margin-bottom: 1rem;
	color: var(--ink-2);
}

.btn:hover svg {
	transform: translateX(-4px);
}
</style>
