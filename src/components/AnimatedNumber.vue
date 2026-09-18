<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../utils/motion.js'

const props = defineProps({
	value: { type: Number, default: null },
	decimals: { type: Number, default: 0 },
	signed: { type: Boolean, default: false },
})

const state = { v: 0 }
const text = ref('—')
let tween = null

function format(v) {
	const body = Math.abs(v).toLocaleString('en-US', {
		minimumFractionDigits: props.decimals,
		maximumFractionDigits: props.decimals,
	})
	if (/^[0.,]+$/.test(body)) return body
	if (v < 0) return `−${body}`
	return props.signed ? `+${body}` : body
}

function run(to) {
	tween?.pause()
	if (to == null || !isFinite(to)) {
		text.value = '—'
		return
	}
	if (prefersReducedMotion()) {
		state.v = to
		text.value = format(to)
		return
	}
	tween = animate(state, {
		v: to,
		duration: 700,
		ease: 'out(4)',
		onUpdate: () => (text.value = format(state.v)),
	})
}

watch(() => props.value, run)
onMounted(() => run(props.value))
onBeforeUnmount(() => tween?.pause())
</script>

<template>
	<span class="num">{{ text }}</span>
</template>

<style scoped>
.num {
	font-variant-numeric: tabular-nums lining-nums;
}
</style>
