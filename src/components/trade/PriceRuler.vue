<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { createScope, createAnimatable } from 'animejs'
import { fmtNumber } from '../../utils/format.js'
import { prefersReducedMotion } from '../../utils/motion.js'

const props = defineProps({
	avg: { type: Number, required: true },
	breakeven: { type: Number, required: true },
	sell: { type: Number, default: null },
})

const hasSell = computed(() => props.sell > 0)

// 刻度範圍：涵蓋所有標記，左右各留一些空間
const range = computed(() => {
	const values = [props.avg, props.breakeven, ...(hasSell.value ? [props.sell] : [])]
	const lo = Math.min(...values)
	const hi = Math.max(...values)
	const span = Math.max(hi - lo, hi * 0.01)
	return { min: lo - span * 0.5, max: hi + span * 0.5 }
})

const pos = (v) => ((v - range.value.min) / (range.value.max - range.value.min)) * 100
const ticks = computed(() => [0, 1, 2, 3, 4].map((i) => range.value.min + (i / 4) * (range.value.max - range.value.min)))
const sellTone = computed(() => (props.sell >= props.breakeven ? 'rise' : 'fall'))

const root = ref(null)
let scope = null
let movers = null

function update(instant) {
	if (!movers) return
	const d = instant || prefersReducedMotion() ? 0 : 800
	movers.avg.left(pos(props.avg), d)
	movers.be.left(pos(props.breakeven), d)
	movers.loss.width(pos(props.breakeven), d)
	movers.gain.left(pos(props.breakeven), d)
	if (hasSell.value) movers.sell.left(pos(props.sell), d)
}

watch(() => [props.avg, props.breakeven, props.sell], () => update(false))

onMounted(() => {
	scope = createScope({ root: root.value }).add(() => {
		const $ = (s) => root.value.querySelector(s)
		const left = { left: { unit: '%' }, ease: 'out(4)' }
		movers = {
			avg: createAnimatable($('.mark-avg'), left),
			be: createAnimatable($('.mark-be'), left),
			sell: createAnimatable($('.mark-sell'), left),
			gain: createAnimatable($('.zone-gain'), left),
			loss: createAnimatable($('.zone-loss'), { width: { unit: '%' }, ease: 'out(4)' }),
		}
		update(false)
	})
})

onBeforeUnmount(() => scope?.revert())
</script>

<template>
	<div ref="root" class="ruler" aria-hidden="true">
		<div class="track">
			<span class="zone zone-loss" style="width: 50%" />
			<span class="zone zone-gain" style="left: 50%" />

			<span class="mark mark-be above" style="left: 50%">
				<span class="mark-label">兩平價 <b>{{ fmtNumber(breakeven, 2) }}</b></span>
			</span>
			<span class="mark mark-sell above far" :class="[sellTone, { hidden: !hasSell }]" style="left: 50%">
				<span class="mark-label">賣出價 <b>{{ hasSell ? fmtNumber(sell, 2) : '' }}</b></span>
			</span>
			<span class="mark mark-avg below" style="left: 50%">
				<span class="mark-label">平均成本 <b>{{ fmtNumber(avg, 2) }}</b></span>
			</span>
		</div>
		<div class="ticks">
			<span v-for="(t, i) in ticks" :key="i" :style="{ left: i * 25 + '%' }">{{ fmtNumber(t, 2) }}</span>
		</div>
		<div class="legend">
			<span class="legend-item fall">虧損區</span>
			<span class="legend-item rise">獲利區</span>
		</div>
	</div>
</template>

<style scoped>
.ruler {
	padding: 5rem 0.5rem 0;
}

.track {
	position: relative;
	height: 6px;
	border-radius: 6px;
	background: var(--line);
}

.zone {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
}

.zone-loss {
	border-radius: 6px 0 0 6px;
	background: linear-gradient(90deg, color-mix(in srgb, var(--fall) 10%, transparent), color-mix(in srgb, var(--fall) 50%, transparent));
}

.zone-gain {
	right: 0;
	border-radius: 0 6px 6px 0;
	background: linear-gradient(90deg, color-mix(in srgb, var(--rise) 50%, transparent), color-mix(in srgb, var(--rise) 10%, transparent));
}

.mark {
	position: absolute;
	top: 50%;
	width: 0;
	transition: opacity 0.3s;
}

.mark::before {
	content: "";
	position: absolute;
	left: -6px;
	top: -6px;
	width: 12px;
	height: 12px;
	border: 2px solid var(--bg);
	border-radius: 50%;
	background: var(--ink);
}

.mark::after {
	content: "";
	position: absolute;
	left: -0.5px;
	width: 1px;
	background: currentColor;
	opacity: 0.5;
}

.mark-label {
	position: absolute;
	left: 0;
	transform: translateX(-50%);
	font-size: 0.72rem;
	color: var(--ink-3);
	white-space: nowrap;
}

.mark-label b {
	margin-left: 0.25rem;
	font-family: var(--font-mono);
	font-weight: 500;
	color: currentColor;
}

.above::after {
	bottom: 6px;
	height: 1.1rem;
}

.above .mark-label {
	bottom: 1.45rem;
}

.above.far::after {
	height: 2.4rem;
}

.above.far .mark-label {
	bottom: 2.75rem;
}

.below::after {
	top: 6px;
	height: 0.9rem;
}

.below .mark-label {
	top: 1.25rem;
}

.mark-be {
	color: var(--brass);
}

.mark-be::before {
	background: var(--brass);
}

.mark-avg {
	color: var(--ink);
}

.mark-sell.rise {
	color: var(--rise);
}

.mark-sell.fall {
	color: var(--fall);
}

.mark-sell::before {
	background: currentColor;
}

.mark-sell.hidden {
	opacity: 0;
}

.ticks {
	position: relative;
	height: 1rem;
	margin-top: 2.6rem;
	border-top: 1px dashed var(--line-strong);
}

.ticks span {
	position: absolute;
	top: 0.4rem;
	transform: translateX(-50%);
	font-family: var(--font-mono);
	font-size: 0.65rem;
	color: var(--ink-3);
}

.ticks span:first-child {
	transform: none;
}

.ticks span:last-child {
	transform: translateX(-100%);
}

.legend {
	display: flex;
	justify-content: space-between;
	margin-top: 1.1rem;
	font-size: 0.7rem;
}

.legend-item {
	display: flex;
	align-items: center;
	gap: 0.4rem;
}

.legend-item::before {
	content: "";
	width: 8px;
	height: 8px;
	border-radius: 2px;
	background: currentColor;
	opacity: 0.6;
}

.legend-item.rise {
	color: var(--rise);
}

.legend-item.fall {
	color: var(--fall);
}
</style>
