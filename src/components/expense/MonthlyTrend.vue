<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { createScope, onScroll } from 'animejs'
import { shiftMonth, parseMonth } from '../../utils/expense.js'
import { fmtNumber } from '../../utils/format.js'

const props = defineProps({
	postings: { type: Array, required: true },
	month: { type: String, required: true },
})
const emit = defineEmits(['go'])

const COUNT = 12

function niceMax(v) {
	if (v <= 0) return 1000
	const mag = 10 ** Math.floor(Math.log10(v))
	return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((n) => n >= v)
}

// 以目前檢視的帳單為最後一期，往前共 12 期
const data = computed(() => {
	const totals = new Map()
	for (const p of props.postings) totals.set(p.month, (totals.get(p.month) || 0) + p.amount)
	const months = Array.from({ length: COUNT }, (_, i) => {
		const key = shiftMonth(props.month, i - COUNT + 1)
		const { y, m } = parseMonth(key)
		return { key, y, m, value: totals.get(key) || 0 }
	})
	const withData = months.filter((b) => b.value !== 0)
	const avg = withData.length ? withData.reduce((sum, b) => sum + b.value, 0) / withData.length : 0
	const max = niceMax(Math.max(...months.map((b) => b.value), avg) * 1.05)
	return { months, avg, max, periods: withData.length }
})

const current = computed(() => data.value.months.at(-1))
const vsAvg = computed(() => (data.value.avg ? (current.value.value - data.value.avg) / data.value.avg : null))

// 捲到畫面中才長出長條；之後數值變動由 CSS transition 過渡
const revealed = ref(false)
const height = (v) => (revealed.value ? `${(Math.max(0, v) / data.value.max) * 100}%` : '0%')

const hover = ref(null)

const root = ref(null)
let scope = null

onMounted(() => {
	scope = createScope({ root: root.value, mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' } }).addOnce((self) => {
		if (self.matches.reduceMotion) {
			revealed.value = true
			return
		}
		onScroll({ target: root.value, enter: '90% top', repeat: false, onEnter: () => (revealed.value = true) })
	})
})

onBeforeUnmount(() => scope?.revert())
</script>

<template>
	<section ref="root" class="panel chart trend-card">
		<header class="section-head">
			<h3 class="section-title">近 12 期趨勢</h3>
			<span class="eyebrow">點長條可切換到那一期</span>
		</header>

		<p class="headline">本期 {{ fmtNumber(current.value) }} 元<template v-if="vsAvg != null">，比近 {{ data.periods }} 期平均 {{ fmtNumber(Math.round(data.avg)) }} 元<b :class="vsAvg > 0 ? 'up' : vsAvg < 0 ? 'down' : ''">{{ vsAvg > 0 ? '多' : vsAvg < 0 ? '少' : '持平' }}{{ vsAvg ? ` ${Math.abs(vsAvg * 100).toFixed(0)}%` : '' }}</b></template></p>

		<div class="plot">
			<div class="grid" aria-hidden="true">
				<span v-for="t in [data.max, data.max / 2, 0]" :key="t" class="grid-line">
					<small>{{ fmtNumber(t) }}</small>
				</span>
			</div>
			<div class="bars">
				<span
					v-if="data.avg"
					class="avg"
					:style="{ bottom: revealed ? `${(data.avg / data.max) * 100}%` : '0%' }"
					aria-hidden="true"
				>
					<small>平均</small>
				</span>
				<button
					v-for="b in data.months"
					:key="b.key"
					type="button"
					class="col"
					:class="{ on: b.key === month, hover: hover === b.key }"
					:aria-label="`${b.y} 年 ${b.m} 月帳單 ${fmtNumber(b.value)} 元`"
					@pointerenter="hover = b.key"
					@pointerleave="hover = null"
					@focus="hover = b.key"
					@blur="hover = null"
					@click="emit('go', b.key)"
				>
					<span class="bar" :style="{ height: height(b.value) }">
						<span v-if="hover === b.key || (b.key === month && hover == null)" class="bar-tip">{{ fmtNumber(b.value) }}</span>
					</span>
				</button>
			</div>

			<div class="labels" aria-hidden="true">
				<span v-for="(b, i) in data.months" :key="b.key" :class="{ on: b.key === month }">
					{{ b.m }}月<small v-if="i === 0 || b.m === 1">{{ b.y }}</small>
				</span>
			</div>
		</div>
	</section>
</template>

<style scoped>
.headline {
	margin-top: -0.4rem;
	margin-bottom: 1rem;
	font-size: 0.85rem;
	color: var(--ink-2);
}

.headline b {
	font-weight: 500;
}

.up {
	color: var(--rise);
}

.down {
	color: var(--fall);
}

.plot {
	position: relative;
	padding-left: 3.5rem;
}

.grid {
	position: absolute;
	inset: 0 0 1.9rem 3.5rem;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	pointer-events: none;
}

.grid-line {
	position: relative;
	height: 0;
	border-top: 1px solid var(--line);
}

.grid-line small {
	position: absolute;
	top: -0.55rem;
	left: -3.5rem;
	width: 3rem;
	font-family: var(--font-mono);
	font-size: 0.66rem;
	color: var(--ink-3);
	text-align: right;
	transform: translateX(-0.5rem);
}

/* 平均線：用黃銅色實線加標籤，和灰色格線區分 */
.avg {
	position: absolute;
	right: 0;
	left: 0;
	z-index: 1;
	height: 0;
	border-top: 1px solid color-mix(in srgb, var(--brass) 55%, transparent);
	pointer-events: none;
	transition: bottom 0.9s var(--ease-out);
}

.avg small {
	position: absolute;
	top: -1.1rem;
	right: 0;
	font-size: 0.66rem;
	color: var(--brass);
}

.bars {
	position: relative;
	display: grid;
	grid-template-columns: repeat(12, minmax(0, 1fr));
	height: 11rem;
}

.col {
	display: flex;
	align-items: flex-end;
	justify-content: center;
	height: 100%;
	padding: 0;
	border: 0;
	border-radius: 8px;
	background: none;
	cursor: pointer;
	outline: none;
	transition: background 0.2s;
}

.col.hover,
.col:focus-visible {
	background: color-mix(in srgb, var(--ink) 4%, transparent);
}

.bar {
	position: relative;
	width: min(24px, 60%);
	border-radius: 4px 4px 0 0;
	background: color-mix(in srgb, var(--ink) 22%, transparent);
	transition: height 0.9s var(--ease-out), background 0.25s;
}

.col.hover .bar {
	background: color-mix(in srgb, var(--ink) 35%, transparent);
}

.col.on .bar {
	background: var(--brass);
}

.bar-tip {
	position: absolute;
	bottom: calc(100% + 0.3rem);
	left: 50%;
	font-family: var(--font-mono);
	font-size: 0.7rem;
	color: var(--ink);
	white-space: nowrap;
	transform: translateX(-50%);
}

.labels {
	display: grid;
	grid-template-columns: repeat(12, minmax(0, 1fr));
	height: 1.9rem;
	padding-top: 0.4rem;
	font-size: 0.7rem;
	color: var(--ink-3);
	text-align: center;
}

.labels span {
	display: flex;
	flex-direction: column;
	line-height: 1.2;
}

.labels .on {
	color: var(--ink);
}

.labels small {
	font-family: var(--font-mono);
	font-size: 0.6rem;
}

@media (max-width: 560px) {
	.plot {
		padding-left: 0;
	}

	.grid {
		left: 0;
	}

	.grid-line small {
		display: none;
	}

	.labels {
		font-size: 0.6rem;
	}
}
</style>
