<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createAnimatable } from 'animejs'

const props = defineProps({
	modelValue: { type: [String, Number], required: true },
	options: { type: Array, required: true },
	label: { type: String, default: '' },
	size: { type: String, default: 'md' },
	block: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const root = ref(null)
const indicator = ref(null)
let mover = null
let observer = null

// 滑動指示器移到目前選項下方。
// 時長一律明確傳入：animatable 被設過時長 0 之後會永遠停在 0，之後就不會滑動，所以瞬間定位用 1ms
function place(instant) {
	const btn = root.value?.querySelector('.seg-btn.on')
	if (!btn || !mover) return
	const duration = instant ? 1 : 480
	mover.x(btn.offsetLeft, duration)
	mover.width(btn.offsetWidth, duration)
}

watch(
	() => props.modelValue,
	() => nextTick(() => place(false)),
)

onMounted(() => {
	mover = createAnimatable(indicator.value, {
		x: { unit: 'px' },
		width: { unit: 'px' },
		duration: 480,
		ease: 'out(4)',
	})
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
	<div ref="root" class="seg" :class="[`seg-${size}`, { 'seg-block': block }]" role="radiogroup" :aria-label="label">
		<span ref="indicator" class="seg-indicator" aria-hidden="true" />
		<button
			v-for="option in options"
			:key="option.value"
			type="button"
			role="radio"
			class="seg-btn"
			:class="{ on: option.value === modelValue }"
			:aria-checked="option.value === modelValue"
			@click="emit('update:modelValue', option.value)"
		>
			{{ option.label }}
		</button>
	</div>
</template>

<style scoped>
.seg {
	position: relative;
	display: inline-flex;
	padding: 0.25rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: var(--sunken-bg);
}

.seg-block {
	display: flex;
}

.seg-indicator {
	position: absolute;
	top: 0.25rem;
	bottom: 0.25rem;
	left: 0;
	width: 0;
	border-radius: 999px;
	background: color-mix(in srgb, var(--brass) 15%, transparent);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brass) 42%, transparent);
	pointer-events: none;
}

.seg-btn {
	position: relative;
	z-index: 1;
	padding: 0.42rem 1rem;
	border: 0;
	border-radius: 999px;
	background: transparent;
	font-size: 0.85rem;
	color: var(--ink-3);
	white-space: nowrap;
	cursor: pointer;
	transition: color 0.3s;
}

.seg-block .seg-btn {
	flex: 1;
}

.seg-btn:hover {
	color: var(--ink);
}

.seg-btn.on {
	color: var(--brass);
}

.seg-lg .seg-btn {
	padding: 0.65rem 1.5rem;
	font-size: 0.98rem;
	font-weight: 500;
}
</style>
