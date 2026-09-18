<script setup>
import AppHeader from './components/AppHeader.vue'
import { enterPage, leavePage } from './utils/motion.js'
</script>

<template>
	<AppHeader />
	<RouterView v-slot="{ Component, route }">
		<Transition mode="out-in" :css="false" @leave="leavePage" @enter="enterPage">
			<component :is="Component" :key="route.path" />
		</Transition>
	</RouterView>
	<footer class="footer">
		<div class="container footer-inner">
			<span class="footer-brand">Ledger Studio</span>
			<span>© {{ new Date().getFullYear() }} · 以 Vue 3 與 anime.js 打造</span>
		</div>
	</footer>
</template>

<style scoped>
.footer {
	border-top: 1px solid var(--line);
	font-size: 0.8rem;
	color: var(--ink-3);
}

.footer-inner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem 1.5rem;
	padding-block: 1.75rem;
}

.footer-brand {
	font-family: var(--font-display);
	font-style: italic;
	font-size: 0.95rem;
	color: var(--ink-2);
}
</style>
