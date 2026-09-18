<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { createScope, onScroll } from 'animejs'
import { shiftMonth } from '../../utils/expense.js'
import { fmtNumber } from '../../utils/format.js'

const props = defineProps({
	// 篩選後所有卡片的入帳（postingsOf 的結果）
	postings: { type: Array, required: true },
	categories: { type: Array, required: true },
	month: { type: String, required: true },
})

// 分類色依分類在清單中的位置固定（顏色跟著分類走，不跟排名走）；第 9 類之後一律灰色併成一塊
const SLOTS = 8
const colorAt = (i) => (i < SLOTS ? `var(--cat-${i + 1})` : 'var(--ink-3)')

function sumByCategory(month) {
	const map = new Map()
	for (const p of props.postings) {
		if (p.month !== month) continue
		map.set(p.tx.categoryId, (map.get(p.tx.categoryId) || 0) + p.amount)
	}
	return map
}

const data = computed(() => {
	const cur = sumByCategory(props.month)
	const prev = sumByCategory(shiftMonth(props.month, -1))
	const rows = props.categories
		.map((c, i) => ({ id: c.id, name: c.name, slot: i, color: colorAt(i), value: cur.get(c.id) || 0, prev: prev.get(c.id) || 0 }))
		.filter((r) => r.value !== 0 || r.prev !== 0)
	const positive = rows.reduce((sum, r) => sum + Math.max(0, r.value), 0)
	const total = rows.reduce((sum, r) => sum + r.value, 0)
	const prevTotal = rows.reduce((sum, r) => sum + r.prev, 0)
	return {
		// 圖例依金額排序
		rows: [...rows].sort((a, b) => b.value - a.value).map((r) => ({ ...r, share: positive > 0 ? Math.max(0, r.value) / positive : 0 })),
		// 圓環依分類順序排列，相鄰的顏色才是驗證過的組合
		slices: rows.filter((r) => r.value > 0),
		positive,
		total,
		prevTotal,
	}
})

// ── 圓環：用 stroke-dasharray 畫各段，數值變動時 CSS transition 會平滑過渡 ──
const R = 70
const C = 2 * Math.PI * R
const GAP = 2
const revealed = ref(false)

const arcs = computed(() => {
	const { slices, positive } = data.value
	const merged = []
	for (const s of slices) {
		if (s.slot < SLOTS) merged.push({ key: s.id, ids: [s.id], color: s.color, value: s.value })
		else if (merged.at(-1)?.key === 'rest') merged.at(-1).value += s.value
		else merged.push({ key: 'rest', ids: [], color: s.color, value: s.value })
	}
	for (const s of slices) if (s.slot >= SLOTS) merged.find((m) => m.key === 'rest').ids.push(s.id)

	let start = 0
	return merged.map((m) => {
		const full = positive > 0 ? (m.value / positive) * C : 0
		const len = revealed.value ? Math.max(0, full - (merged.length > 1 ? GAP : 0)) : 0
		const arc = { ...m, dash: `${len} ${C - len}`, offset: -start }
		start += full
		return arc
	})
})

// ── 滑過圖例或圓環：其他分類淡化，中央顯示該分類 ──
const hover = ref(null)
const hovered = computed(() => data.value.rows.find((r) => r.id === hover.value) || null)
const isDim = (ids) => hover.value != null && !ids.includes(hover.value)

const pct = (v) => `${(v * 100).toFixed(v >= 0.1 ? 0 : 1)}%`
const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtNumber(Math.abs(v))

const change = computed(() => {
	const { total, prevTotal } = data.value
	if (!prevTotal) return null
	return (total - prevTotal) / Math.abs(prevTotal)
})

// ── 捲到畫面中才長出圓環 ──
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
	<section ref="root" class="panel chart donut-card">
		<header class="section-head">
			<h3 class="section-title">分類佔比</h3>
			<span class="eyebrow">和上一期比較</span>
		</header>

		<div v-if="data.rows.length" class="donut-body">
			<div class="donut-wrap">
				<svg class="donut" viewBox="0 0 180 180" role="img" :aria-label="`本期消費 ${fmtNumber(data.total)} 元的分類佔比`">
					<circle class="donut-track" cx="90" cy="90" :r="R" />
					<circle
						v-for="arc in arcs"
						:key="arc.key"
						class="donut-arc"
						:class="{ dim: isDim(arc.ids) }"
						cx="90"
						cy="90"
						:r="R"
						:stroke="arc.color"
						:stroke-dasharray="arc.dash"
						:stroke-dashoffset="arc.offset"
						@pointerenter="hover = arc.ids[0]"
						@pointerleave="hover = null"
					/>
				</svg>
				<div class="donut-center" aria-live="polite">
					<template v-if="hovered">
						<span class="center-label">{{ hovered.name }}</span>
						<span class="center-value">{{ fmtNumber(hovered.value) }}</span>
						<span class="center-sub">佔 {{ pct(hovered.share) }}</span>
					</template>
					<template v-else>
						<span class="center-label">本期消費</span>
						<span class="center-value">{{ fmtNumber(data.total) }}</span>
						<span v-if="change != null" class="center-sub">
							較上期 <b :class="change > 0 ? 'up' : change < 0 ? 'down' : ''">{{ change > 0 ? '+' : change < 0 ? '−' : '' }}{{ pct(Math.abs(change)) }}</b>
						</span>
						<span v-else class="center-sub">上期沒有資料</span>
					</template>
				</div>
			</div>

			<ul class="legend">
				<li
					v-for="row in data.rows"
					:key="row.id"
					class="legend-row"
					:class="{ dim: hover != null && hover !== row.id, on: hover === row.id }"
					tabindex="0"
					@pointerenter="hover = row.id"
					@pointerleave="hover = null"
					@focus="hover = row.id"
					@blur="hover = null"
				>
					<span class="swatch" :style="{ background: row.color }" aria-hidden="true" />
					<span class="legend-name">{{ row.name }}<small>{{ pct(row.share) }}</small></span>
					<span class="legend-value">{{ fmtNumber(row.value) }}</span>
					<span class="legend-delta" :title="`上期 ${fmtNumber(row.prev)} 元`">
						<i :class="row.value > row.prev ? 'up' : row.value < row.prev ? 'down' : ''" aria-hidden="true">
							{{ row.value > row.prev ? '▲' : row.value < row.prev ? '▼' : '–' }}
						</i>
						{{ row.value === row.prev ? '持平' : signed(row.value - row.prev) }}
					</span>
				</li>
			</ul>
		</div>
		<p v-else class="chart-empty">這一期和上一期都還沒有消費。</p>
	</section>
</template>

<style scoped>
.donut-body {
	display: grid;
	grid-template-columns: 10rem minmax(0, 1fr);
	align-items: center;
	gap: 1.25rem;
}

.donut-wrap {
	position: relative;
	aspect-ratio: 1;
}

.donut {
	display: block;
	width: 100%;
	height: 100%;
	transform: rotate(-90deg);
}

.donut-track {
	fill: none;
	stroke: color-mix(in srgb, var(--ink) 7%, transparent);
	stroke-width: 18;
}

.donut-arc {
	fill: none;
	stroke-width: 18;
	cursor: pointer;
	transition:
		stroke-dasharray 0.9s var(--ease-out),
		stroke-dashoffset 0.9s var(--ease-out),
		opacity 0.25s;
}

.donut-arc.dim {
	opacity: 0.25;
}

.donut-center {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	pointer-events: none;
}

.center-label {
	font-size: 0.72rem;
	color: var(--ink-3);
}

.center-value {
	font-family: var(--font-display);
	font-size: 1.5rem;
	line-height: 1.2;
}

.center-sub {
	font-size: 0.7rem;
	color: var(--ink-3);
}

.center-sub b {
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--ink-2);
}

.up {
	color: var(--rise);
}

.down {
	color: var(--fall);
}

.center-sub b.up,
.center-sub b.down {
	color: inherit;
}

.legend {
	display: grid;
	margin: 0;
	padding: 0;
	list-style: none;
}

.legend-row {
	display: grid;
	grid-template-columns: 0.6rem minmax(0, 1fr) auto 5.2rem;
	align-items: center;
	gap: 0.6rem;
	padding: 0.4rem 0.5rem;
	margin-inline: -0.5rem;
	border-radius: 8px;
	font-size: 0.84rem;
	outline: none;
	transition: opacity 0.25s, background 0.25s;
}

.legend-row.on,
.legend-row:focus-visible {
	background: color-mix(in srgb, var(--ink) 5%, transparent);
}

.legend-row.dim {
	opacity: 0.4;
}

.swatch {
	width: 0.6rem;
	height: 0.6rem;
	border-radius: 2px;
}

.legend-name {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.legend-name small {
	margin-left: 0.4rem;
	font-family: var(--font-mono);
	font-size: 0.7rem;
	color: var(--ink-3);
}

.legend-value,
.legend-delta {
	font-family: var(--font-mono);
	font-size: 0.8rem;
	font-variant-numeric: tabular-nums;
	text-align: right;
	white-space: nowrap;
}

.legend-delta {
	font-size: 0.72rem;
	color: var(--ink-3);
}

.legend-delta i {
	font-style: normal;
	font-size: 0.6rem;
}

.chart-empty {
	padding: 2rem 0;
	font-size: 0.85rem;
	color: var(--ink-3);
	text-align: center;
}

@media (max-width: 560px) {
	.donut-body {
		grid-template-columns: minmax(0, 1fr);
	}

	.donut-wrap {
		width: 11rem;
		justify-self: center;
	}

	.legend-row {
		grid-template-columns: 0.6rem minmax(0, 1fr) auto;
	}

	.legend-delta {
		display: none;
	}
}
</style>
