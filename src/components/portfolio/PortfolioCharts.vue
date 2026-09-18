<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { createScope, createTimeline, createDrawable, stagger, set } from 'animejs'
import { fmtNumber } from '../../utils/format.js'

const props = defineProps({
	// realizedSeries() 的結果：[{ date, value, symbol }]
	curve: { type: Array, required: true },
	// 每檔股票的基本資料加上 summarizeStock() 的結果
	items: { type: Array, required: true },
})

const signed = (v, decimals = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNumber(Math.abs(v), decimals)
// 曲線圖的座標系：寬度固定 680，高度依卡片實際比例調整，
// 卡片被旁邊的持倉配置拉高時，圖表跟著長高，不會在下方留白
const curveWrap = ref(null)
const boxHeight = ref(220)
const BOX = computed(() => ({ w: 680, h: boxHeight.value, left: 8, right: 672, top: 70, bottom: boxHeight.value - 34 }))

let curveObserver = null
watch(curveWrap, (el) => {
	curveObserver?.disconnect()
	if (!el) return
	curveObserver = new ResizeObserver(() => {
		if (el.clientWidth) boxHeight.value = Math.max(220, Math.round((680 * el.clientHeight) / el.clientWidth))
	})
	curveObserver.observe(el)
})

// 持倉配置最多列出幾檔，其餘合併成「其他」
const ALLOC_LIMIT = 6

// ── 累計已實現損益 ──
const line = computed(() => {
	const points = props.curve
	if (!points.length) return null

	const values = points.map((p) => p.value)
	const min = Math.min(0, ...values)
	const max = Math.max(0, ...values)
	const span = max - min || 1
	const box = BOX.value
	const step = (box.right - box.left) / points.length
	const x = (i) => box.left + step * (i + 1)
	const y = (v) => box.bottom - ((v - min) / span) * (box.bottom - box.top)

	const zero = y(0)
	const dots = points.map((p, i) => ({ ...p, x: x(i), y: y(p.value) }))
	const path = `M${box.left} ${zero.toFixed(1)}` + dots.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
	const last = dots[dots.length - 1]

	return {
		dots,
		zero,
		path,
		area: `${path}L${last.x.toFixed(1)} ${zero.toFixed(1)}Z`,
		last,
		tone: last.value >= 0 ? 'rise' : 'fall',
		from: points[0].date,
		to: last.date,
	}
})

// ── 持倉配置：每檔都有現價才用市值，否則一律用持倉成本，避免市值與成本混在一起比 ──
const allocation = computed(() => {
	const holding = props.items.filter((s) => s.holdingShares > 0)
	const priced = holding.every((s) => s.hasPrice)
	const list = holding
		.map((s) => ({ id: s.id, symbol: s.symbol, name: s.name, value: priced ? s.marketValue : s.holdingCost }))
		.sort((a, b) => b.value - a.value)
	const total = list.reduce((sum, s) => sum + s.value, 0)
	const shown = list.length > ALLOC_LIMIT ? list.slice(0, ALLOC_LIMIT - 1) : list
	const rest = list.slice(shown.length)
	if (rest.length) {
		shown.push({ id: 'other', symbol: '其他', name: `${rest.length} 檔`, value: rest.reduce((sum, s) => sum + s.value, 0) })
	}
	return { list: shown.map((s) => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 })), priced }
})

// ── 個股損益排行：已實現＋未實現，向左為虧、向右為賺 ──
// 只有買進、還沒填現價的股票算不出損益，不列入排行
const unranked = computed(() => props.items.filter((s) => s.roi == null && s.holdingShares > 0).length)
const ranking = computed(() => {
	const list = props.items.filter((s) => s.roi != null).sort((a, b) => b.total - a.total)
	const max = Math.max(...list.map((s) => Math.abs(s.total)), 1)
	return list.map((s) => ({ ...s, width: (Math.abs(s.total) / max) * 50 }))
})

const root = ref(null)
let scope = null

onMounted(() => {
	scope = createScope({
		root: root.value,
		mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
	}).addOnce((self) => {
		if (self.matches.reduceMotion) return
		const $ = (s) => root.value.querySelectorAll(s)

		// 沒有資料的區塊不會渲染，只替存在的元素加動畫
		const tl = createTimeline({ defaults: { ease: 'out(4)' }, delay: 200 })
		const add = (selector, params, position) => {
			const els = $(selector)
			if (els.length) tl.add(els, params, position)
		}

		if ($('.curve-line').length) {
			const drawn = createDrawable($('.curve-line'))
			set($('.curve-area, .curve-flag'), { opacity: 0 })
			set($('.curve-dot circle'), { scale: 0 })
			tl.add(drawn, { draw: ['0 0', '0 1'], duration: 1100, ease: 'inOut(3)' }, 0)
			add('.curve-area', { opacity: 1, duration: 800 }, 500)
			add('.curve-dot circle', { scale: 1, duration: 500 }, stagger(40, { start: 450 }))
			add('.curve-flag', { opacity: 1, x: [-8, 0], duration: 600 }, 700)
		}

		if ($('.alloc-fill, .rank-fill').length) set($('.alloc-fill, .rank-fill'), { scaleX: 0 })
		add('.alloc-fill', { scaleX: 1, duration: 900, ease: 'out(3)' }, stagger(70, { start: 250 }))
		add('.rank-fill', { scaleX: 1, duration: 900, ease: 'out(3)' }, stagger(60, { start: 400 }))
	})
})

onBeforeUnmount(() => {
	curveObserver?.disconnect()
	scope?.revert()
})
</script>

<template>
	<div ref="root" class="charts">
		<!-- 累計已實現損益 -->
		<section class="panel chart curve-card">
			<header class="section-head">
				<h3 class="section-title">累計已實現損益</h3>
				<span class="eyebrow">依賣出日期</span>
			</header>

			<div v-if="line" ref="curveWrap" class="curve-wrap" :class="line.tone">
				<svg class="curve" :viewBox="`0 0 ${BOX.w} ${BOX.h}`" role="img" aria-label="累計已實現損益曲線">
					<defs>
						<linearGradient id="portfolio-curve-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" class="curve-stop" stop-opacity=".3" />
							<stop offset="1" class="curve-stop" stop-opacity="0" />
						</linearGradient>
					</defs>
					<path class="curve-zero" :d="`M${BOX.left} ${line.zero}H${BOX.right}`" />
					<path class="curve-area" :d="line.area" fill="url(#portfolio-curve-fill)" />
					<path class="curve-line" :d="line.path" />
					<g v-for="(dot, i) in line.dots" :key="i" class="curve-dot" :transform="`translate(${dot.x.toFixed(1)} ${dot.y.toFixed(1)})`">
						<circle r="4.5" />
						<title>{{ dot.date }} 賣出 {{ dot.symbol }}，累計 {{ signed(Math.round(dot.value)) }} 元</title>
					</g>
					<text class="curve-axis" :x="BOX.left" :y="BOX.h - 6">{{ line.from }}</text>
					<text v-if="line.to !== line.from" class="curve-axis" :x="BOX.right" :y="BOX.h - 6" text-anchor="end">{{ line.to }}</text>
				</svg>
				<p class="curve-flag">
					<span class="curve-figure">{{ signed(Math.round(line.last.value)) }}</span>
					<span class="curve-note">{{ curve.length }} 筆賣出</span>
				</p>
			</div>
			<p v-else class="chart-empty">還沒有賣出紀錄。賣出之後，這裡會畫出已實現損益的累計變化。</p>
		</section>

		<!-- 持倉配置 -->
		<section class="panel chart">
			<header class="section-head">
				<h3 class="section-title">持倉配置</h3>
				<span class="eyebrow">{{ allocation.priced ? '依市值' : '依持倉成本' }}</span>
			</header>

			<ul v-if="allocation.list.length" class="bars">
				<li v-for="item in allocation.list" :key="item.id">
					<div class="bar-line">
						<span class="bar-name"><b>{{ item.symbol }}</b><small>{{ item.name }}</small></span>
						<span class="bar-value">{{ fmtNumber(item.pct, 1) }}%</span>
					</div>
					<span class="track"><span class="alloc-fill" :style="{ width: item.pct + '%' }" /></span>
				</li>
			</ul>
			<p v-else class="chart-empty">目前沒有持股。買進之後，這裡會顯示各檔的佔比。</p>
		</section>

		<!-- 個股損益排行 -->
		<section class="panel chart rank-card">
			<header class="section-head">
				<h3 class="section-title">個股損益</h3>
				<span class="eyebrow">已實現＋未實現</span>
			</header>

			<ul v-if="ranking.length" class="rank">
				<li v-for="item in ranking" :key="item.id" class="rank-row">
					<span class="bar-name"><b>{{ item.symbol }}</b><small>{{ item.name }}</small></span>
					<span class="rank-track">
						<span
							class="rank-fill"
							:class="item.total >= 0 ? 'rise' : 'fall'"
							:style="{ width: item.width + '%' }"
						/>
					</span>
					<span class="rank-value" :class="item.total > 0 ? 'rise' : item.total < 0 ? 'fall' : ''">
						{{ signed(Math.round(item.total)) }}
						<small>{{ signed(item.roi, 2) }}%</small>
					</span>
				</li>
			</ul>
			<p v-else class="chart-empty">有賣出紀錄，或在個股卡片填入現價後，這裡會比較各檔的損益。</p>
			<p v-if="ranking.length && unranked" class="rank-note">另有 {{ unranked }} 檔還沒填現價，未列入比較</p>
		</section>
	</div>
</template>

<style scoped>
.charts {
	display: grid;
	grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
	min-width: 0;
	gap: 1.25rem;
	align-items: stretch;
}

.chart {
	min-width: 0;
}

.rank-card {
	grid-column: 1 / -1;
}

.rise {
	--tone: var(--rise);
	color: var(--rise);
}

.fall {
	--tone: var(--fall);
	color: var(--fall);
}

/* ── 曲線 ── */
/* 曲線卡片直向排列，圖表區吃掉剩餘高度；最低維持 680:220 的比例 */
.curve-card {
	display: flex;
	flex-direction: column;
}

.curve-wrap {
	position: relative;
	flex: 1;
	aspect-ratio: 680 / 220;
}

.curve {
	position: absolute;
	inset: 0;
	display: block;
	width: 100%;
	height: 100%;
	overflow: visible;
}

.curve-stop {
	stop-color: var(--tone);
}

.curve-zero {
	stroke: var(--line-strong);
	stroke-dasharray: 3 5;
}

.curve-line {
	fill: none;
	stroke: var(--tone);
	stroke-width: 2;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.curve-dot circle {
	fill: var(--bg);
	stroke: var(--tone);
	stroke-width: 2;
	transform-box: fill-box;
	transform-origin: center;
	transition: r 0.2s;
}

.curve-dot:hover circle {
	r: 6.5;
}

.curve-axis {
	font-family: var(--font-mono);
	font-size: 17px;
	fill: var(--ink-3);
}

.curve-flag {
	position: absolute;
	top: 0;
	left: 0;
	display: flex;
	flex-direction: column;
}

.curve-figure {
	font-family: var(--font-display);
	font-size: clamp(1.7rem, 3vw, 2.2rem);
	line-height: 1.1;
	letter-spacing: -0.02em;
	font-variant-numeric: tabular-nums lining-nums;
}

.curve-note {
	font-size: 0.75rem;
	color: var(--ink-3);
}

/* ── 橫條 ── */
.bars {
	display: grid;
	gap: 0.85rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.bar-line {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 0.4rem;
}

.bar-name {
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.bar-name b {
	font-family: var(--font-mono);
	font-size: 0.85rem;
	font-weight: 500;
}

.bar-name small,
.rank-value small {
	margin-left: 0.5rem;
	font-size: 0.72rem;
	color: var(--ink-3);
}

.bar-value {
	font-family: var(--font-mono);
	font-size: 0.85rem;
}

.track {
	display: block;
	height: 6px;
	border-radius: 6px;
	background: var(--line);
}

.alloc-fill {
	display: block;
	height: 100%;
	border-radius: 6px;
	background: linear-gradient(90deg, var(--brass), color-mix(in srgb, var(--brass) 45%, transparent));
	transform-origin: left;
}

/* ── 排行：中線左右對稱 ── */
.rank {
	display: grid;
	gap: 0.55rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.rank-row {
	display: grid;
	grid-template-columns: minmax(0, 11rem) minmax(0, 1fr) 11rem;
	align-items: center;
	gap: 1rem;
}

.rank-track {
	position: relative;
	height: 10px;
}

.rank-track::before {
	content: "";
	position: absolute;
	top: -4px;
	bottom: -4px;
	left: 50%;
	width: 1px;
	background: var(--line-strong);
}

.rank-fill {
	position: absolute;
	top: 0;
	height: 100%;
	background: var(--tone);
	opacity: 0.85;
}

.rank-fill.rise {
	left: 50%;
	border-radius: 0 5px 5px 0;
	transform-origin: left;
}

.rank-fill.fall {
	right: 50%;
	border-radius: 5px 0 0 5px;
	transform-origin: right;
}

.rank-value {
	font-family: var(--font-mono);
	font-size: 0.85rem;
	text-align: right;
	white-space: nowrap;
}

.chart-empty {
	padding: 2rem 0;
	font-size: 0.85rem;
	color: var(--ink-3);
	text-align: center;
	text-wrap: pretty;
}

.rank-note {
	margin-top: 0.9rem;
	font-size: 0.75rem;
	color: var(--ink-3);
}

/* 排行的空狀態與一列同高，第一筆交易算出來時版面不會縮 */
.rank-card .chart-empty {
	padding: 0.1rem 0;
}

@media (max-width: 900px) {
	.charts {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 560px) {
	.rank-row {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.3rem 1rem;
	}

	.rank-track {
		grid-column: 1 / -1;
		order: 3;
	}
}
</style>
