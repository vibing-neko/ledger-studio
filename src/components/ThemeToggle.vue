<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { animate, createAnimatable, spring } from 'animejs'
import { useTheme } from '../composables/useTheme.js'
import { prefersReducedMotion } from '../utils/motion.js'

const options = [
	{ value: 'system', label: '跟隨系統' },
	{ value: 'light', label: '淺色' },
	{ value: 'dark', label: '深色' },
]

const { theme } = useTheme()
const root = ref(null)
const indicator = ref(null)
let mover = null
let observer = null

function place(instant) {
	const btn = root.value?.querySelector('.mode.on')
	if (!btn || !mover) return
	// 時長明確傳入：設過 0 之後 animatable 會一直停在 0，瞬間定位改用 1ms
	mover.x(btn.offsetLeft, instant ? 1 : 460)
}

function select(value) {
	if (value === theme.value) return
	theme.value = value
	if (prefersReducedMotion()) return
	// 被選中的圖示轉一下
	nextTick(() => {
		const icon = root.value?.querySelector('.mode.on svg')
		if (icon) animate(icon, { rotate: [-35, 0], scale: [0.8, 1], ease: spring({ bounce: 0.5, duration: 550 }) })
	})
}

watch(theme, () => nextTick(() => place(false)))

onMounted(() => {
	mover = createAnimatable(indicator.value, { x: { unit: 'px' }, duration: 460, ease: 'out(4)' })
	place(true)
	observer = new ResizeObserver(() => place(true))
	observer.observe(root.value)
})

onBeforeUnmount(() => {
	observer?.disconnect()
	mover?.revert()
})
</script>

<template>
	<div ref="root" class="theme" role="radiogroup" aria-label="配色模式">
		<span ref="indicator" class="theme-indicator" aria-hidden="true" />
		<button
			v-for="option in options"
			:key="option.value"
			type="button"
			role="radio"
			class="mode"
			:class="{ on: theme === option.value }"
			:aria-checked="theme === option.value"
			:title="option.label"
			:aria-label="option.label"
			@click="select(option.value)"
		>
			<svg v-if="option.value === 'system'" viewBox="0 0 16 16" aria-hidden="true">
				<rect x="2" y="3" width="12" height="8.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3" />
				<path d="M6 14h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
			</svg>
			<svg v-else-if="option.value === 'light'" viewBox="0 0 16 16" aria-hidden="true">
				<circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.3" />
				<path
					d="M8 1.4v1.4M8 13.2v1.4M14.6 8h-1.4M2.8 8H1.4M12.7 3.3l-1 1M4.3 11.7l-1 1M12.7 12.7l-1-1M4.3 4.3l-1-1"
					stroke="currentColor"
					stroke-width="1.3"
					stroke-linecap="round"
				/>
			</svg>
			<svg v-else viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="M13.4 9.6A5.6 5.6 0 0 1 6.4 2.6a5.8 5.8 0 1 0 7 7z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.3"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>
</template>

<style scoped>
.theme {
	position: relative;
	display: inline-flex;
	padding: 0.2rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: var(--sunken-bg);
}

.theme-indicator {
	position: absolute;
	top: 0.2rem;
	bottom: 0.2rem;
	left: 0;
	width: 1.85rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--brass) 15%, transparent);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brass) 42%, transparent);
	pointer-events: none;
}

.mode {
	position: relative;
	z-index: 1;
	display: grid;
	place-items: center;
	width: 1.85rem;
	height: 1.85rem;
	padding: 0;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.3s;
}

.mode svg {
	width: 0.95rem;
	height: 0.95rem;
}

.mode:hover {
	color: var(--ink);
}

.mode.on {
	color: var(--brass);
}
</style>
