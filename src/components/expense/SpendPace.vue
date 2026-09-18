<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { animate, createDrawable, createScope, onScroll, set, stagger } from 'animejs'
import { shiftMonth, periodOf, daysBetween, todayISO, shortDate } from '../../utils/expense.js'
import { fmtNumber } from '../../utils/format.js'
import { prefersReducedMotion } from '../../utils/motion.js'

const props = defineProps({
	postings: { type: Array, required: true },
	// 目前篩選的卡片（各卡結帳日不同，天數以各自的帳單起日起算）
	cards: { type: Array, required: true },
	month: { type: String, required: true },
})

// 以「帳單第幾天」對齊本期與上期；只算這一期新的消費，先前分期攤進來的部分不算
function cumulative(month, length) {
	const daily = Array(length + 1).fill(0)
	for (const p of props.postings) {
		if (p.month !== month || p.index !== 1) continue
		const start = periodOf(month, p.card.closingDay).start
		const d = Math.min(length, Math.max(1, daysBetween(start, p.tx.date) + 1))
		daily[d] += p.amount
	}
	for (let d = 1; d <= length; d++) daily[d] += daily[d - 1]
	return daily
}

const data = computed(() => {
	const today = todayISO()
	const spans = props.cards.map((c) => {
		const { start, end } = periodOf(props.month, c.closingDay)
		return { start, end, length: daysBetween(start, end) + 1 }
	})
	const length = Math.max(28, ...spans.map((s) => s.length))

	// 本期畫到「今天是第幾天」，和上期同一天比才公平；
	// 多張卡時只要有一張還在累積就以它為準，全部結束才畫滿，還沒開始就不畫
	const open = spans.filter((s) => today >= s.start && today <= s.end)
	const upTo = open.length
		? Math.max(...open.map((s) => daysBetween(s.start, today) + 1))
		: Math.max(0, ...spans.filter((s) => today > s.end).map((s) => s.length))

	const cur = cumulative(props.month, length)
	const prev = cumulative(shiftMonth(props.month, -1), length)
	return { length, upTo, cur, prev, single: spans.length === 1 ? spans[0] : null }
})

const hasData = computed(() => data.value.cur[data.value.length] !== 0 || data.value.prev[data.value.length] !== 0)

// ── 座標：viewBox 600 × 240 ──
const BOX = { w: 600, h: 240, left: 48, right: 588, top: 14, bottom: 206 }

function niceMax(v) {
	if (v <= 0) return 1000
	const mag = 10 ** Math.floor(Math.log10(v))
	return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((n) => n >= v)
}

const geo = computed(() => {
	const { length, upTo, cur, prev } = data.value
	const max = niceMax(Math.max(cur[upTo] || 0, prev[length], ...cur.slice(0, upTo + 1), ...prev) * 1.05)
	const x = (d) => BOX.left + (d / length) * (BOX.right - BOX.left)
	const y = (v) => BOX.bottom - (Math.max(0, v) / max) * (BOX.bottom - BOX.top)
	const path = (arr, end) => arr.slice(0, end + 1).map((v, d) => `${d ? 'L' : 'M'}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join('')
	const curPath = upTo > 0 ? path(cur, upTo) : ''
	return {
		x,
		y,
		ticks: [0, max / 2, max].map((v) => ({ v, y: y(v) })),
		prevPath: path(prev, length),
		curPath,
		curArea: curPath ? `${curPath}L${x(upTo).toFixed(1)} ${BOX.bottom}L${x(0)} ${BOX.bottom}Z` : '',
		end: upTo > 0 ? { x: x(upTo), y: y(cur[upTo]) } : null,
	}
})

// 標題旁的一句話：到今天為止和上期同期比較
const headline = computed(() => {
	const { upTo, cur, prev, length } = data.value
	if (!upTo) return { text: '這一期還沒開始', diff: null }
	const at = upTo
	const diff = prev[at] ? (cur[at] - prev[at]) / Math.abs(prev[at]) : null
	return { text: at >= length ? `本期共 ${fmtNumber(cur[at])} 元` : `到第 ${at} 天花了 ${fmtNumber(cur[at])} 元`, diff, prevAt: prev[at] }
})

const dayDate = (d) => {
	const s = data.value.single
	if (!s) return ''
	const [y, m, day] = s.start.split('-').map(Number)
	const date = new Date(y, m - 1, day + d - 1)
	return `${date.getMonth() + 1}/${date.getDate()}`
}

// ── 十字線：跟著游標對到最近的一天 ──
const wrap = ref(null)
const cursor = ref(null)

function onMove(e) {
	const svg = e.currentTarget.ownerSVGElement
	const r = svg.getBoundingClientRect()
	const px = ((e.clientX - r.left) / r.width) * BOX.w
	const { length } = data.value
	const d = Math.round(((px - BOX.left) / (BOX.right - BOX.left)) * length)
	cursor.value = Math.min(length, Math.max(1, d))
}

const tip = computed(() => {
	const d = cursor.value
	if (d == null) return null
	const { cur, prev, upTo, length } = data.value
	const x = geo.value.x(d)
	return {
		d,
		x,
		left: `${(x / BOX.w) * 100}%`,
		flip: d > length * 0.6,
		cur: d <= upTo ? cur[d] : null,
		prev: prev[d],
		curY: d <= upTo ? geo.value.y(cur[d]) : null,
		prevY: geo.value.y(prev[d]),
	}
})

// ── 動畫：捲到畫面中時畫出曲線；換月份或篩選時重畫 ──
const root = ref(null)
const revealed = ref(false)
let scope = null

function draw() {
	const lines = root.value?.querySelectorAll('.pace-line')
	if (!lines?.length || prefersReducedMotion()) return
	animate(createDrawable(lines), { draw: ['0 0', '0 1'], duration: 1000, ease: 'inOut(3)', delay: stagger(160) })
	animate(root.value.querySelectorAll('.pace-area, .pace-end'), { opacity: [0, 1], duration: 600, delay: 600, ease: 'out(2)' })
}

watch(
	() => `${props.month}|${props.cards.map((c) => c.id).join()}`,
	() => {
		cursor.value = null
		if (revealed.value) nextTick(draw)
	},
)

onMounted(() => {
	scope = createScope({ root: root.value, mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' } }).addOnce((self) => {
		if (self.matches.reduceMotion) {
			revealed.value = true
			return
		}
		const lines = root.value.querySelectorAll('.pace-line')
		if (lines.length) set(createDrawable(lines), { draw: '0 0' })
		set(root.value.querySelectorAll('.pace-area, .pace-end'), { opacity: 0 })
		onScroll({
			target: root.value,
			enter: '90% top',
			repeat: false,
			onEnter: () => {
				revealed.value = true
				draw()
			},
		})
	})
})

onBeforeUnmount(() => scope?.revert())
</script>

<template>
	<section ref="root" class="panel chart pace-card">
		<header class="section-head">
			<h3 class="section-title">消費節奏</h3>
			<ul class="keys" aria-hidden="true">
				<li><i class="key cur" />本期</li>
				<li><i class="key prev" />上一期</li>
			</ul>
		</header>

		<!-- 中文句子不能有斷行產生的空白，寫在同一行 -->
		<p class="headline">{{ headline.text }}<template v-if="headline.diff != null">，比上期同期的 {{ fmtNumber(headline.prevAt) }} 元<b :class="headline.diff > 0 ? 'up' : headline.diff < 0 ? 'down' : ''">{{ headline.diff > 0 ? '多' : headline.diff < 0 ? '少' : '持平' }}{{ headline.diff ? ` ${Math.abs(headline.diff * 100).toFixed(0)}%` : '' }}</b></template></p>

		<div v-if="hasData" ref="wrap" class="pace-wrap">
			<svg class="pace" :viewBox="`0 0 ${BOX.w} ${BOX.h}`" role="img" :aria-label="`${headline.text}，本期與上一期每日累積消費曲線`">
				<g class="grid">
					<g v-for="t in geo.ticks" :key="t.v">
						<path :d="`M${BOX.left} ${t.y.toFixed(1)}H${BOX.right}`" />
						<text :x="BOX.left - 8" :y="t.y + 4" text-anchor="end">{{ fmtNumber(t.v) }}</text>
					</g>
				</g>

				<path class="pace-line prev" :d="geo.prevPath" />
				<path v-if="geo.curArea" class="pace-area" :d="geo.curArea" />
				<path v-if="geo.curPath" class="pace-line cur" :d="geo.curPath" />
				<circle v-if="geo.end" class="pace-end" :cx="geo.end.x" :cy="geo.end.y" r="4.5" />

				<g v-if="tip" class="cross">
					<path :d="`M${tip.x.toFixed(1)} ${BOX.top}V${BOX.bottom}`" />
					<circle class="cross-dot prev" :cx="tip.x" :cy="tip.prevY" r="4" />
					<circle v-if="tip.curY != null" class="cross-dot cur" :cx="tip.x" :cy="tip.curY" r="4.5" />
				</g>

				<text class="axis" :x="BOX.left" :y="BOX.h - 8">{{ data.single ? shortDate(data.single.start) : '第 1 天' }}</text>
				<text class="axis" :x="BOX.right" :y="BOX.h - 8" text-anchor="end">
					{{ data.single ? shortDate(data.single.end) : `第 ${data.length} 天` }}
				</text>

				<rect
					class="hit"
					:x="BOX.left"
					:y="BOX.top"
					:width="BOX.right - BOX.left"
					:height="BOX.bottom - BOX.top"
					@pointermove="onMove"
					@pointerleave="cursor = null"
				/>
			</svg>

			<div v-if="tip" class="tip" :class="{ flip: tip.flip }" :style="{ left: tip.left }">
				<p class="tip-head">第 {{ tip.d }} 天<template v-if="dayDate(tip.d)"> · {{ dayDate(tip.d) }}</template></p>
				<p v-if="tip.cur != null" class="tip-row"><i class="key cur" /><b>{{ fmtNumber(tip.cur) }}</b> 本期</p>
				<p class="tip-row"><i class="key prev" /><b>{{ fmtNumber(tip.prev) }}</b> 上一期</p>
			</div>
		</div>
		<p v-else class="chart-empty">這一期和上一期都還沒有新的消費。</p>
	</section>
</template>

<style scoped>
.keys {
	display: flex;
	gap: 1rem;
	margin: 0;
	padding: 0;
	list-style: none;
	font-size: 0.75rem;
	color: var(--ink-3);
}

.keys li {
	display: flex;
	align-items: center;
	gap: 0.4rem;
}

.key {
	display: inline-block;
	width: 0.9rem;
	height: 2px;
	border-radius: 2px;
}

.key.cur {
	background: var(--brass);
}

.key.prev {
	background: var(--ink-3);
}

.headline {
	margin-top: -0.4rem;
	margin-bottom: 0.75rem;
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

.pace-wrap {
	position: relative;
}

.pace {
	display: block;
	width: 100%;
	height: auto;
	overflow: visible;
}

.grid path {
	stroke: var(--line);
	stroke-width: 1;
}

/* viewBox 寬 600，手機上會縮到一半左右，字級抓大一點 */
.grid text,
.axis {
	font-family: var(--font-mono);
	font-size: 13px;
	fill: var(--ink-3);
}

.pace-line {
	fill: none;
	stroke-width: 2;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.pace-line.cur {
	stroke: var(--brass);
}

.pace-line.prev {
	stroke: var(--ink-3);
	opacity: 0.7;
}

.pace-area {
	fill: color-mix(in srgb, var(--brass) 10%, transparent);
}

.pace-end {
	fill: var(--brass);
	stroke: var(--bg);
	stroke-width: 2;
}

.cross path {
	stroke: var(--line-strong);
	stroke-width: 1;
}

.cross-dot {
	stroke: var(--bg);
	stroke-width: 2;
}

.cross-dot.cur {
	fill: var(--brass);
}

.cross-dot.prev {
	fill: var(--ink-3);
}

.hit {
	fill: transparent;
	cursor: crosshair;
}

.tip {
	position: absolute;
	top: 0.5rem;
	z-index: 2;
	min-width: 8.5rem;
	padding: 0.55rem 0.75rem;
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-card);
	font-size: 0.75rem;
	pointer-events: none;
	transform: translateX(12px);
}

.tip.flip {
	transform: translateX(calc(-100% - 12px));
}

.tip-head {
	margin-bottom: 0.25rem;
	color: var(--ink-3);
}

.tip-row {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	color: var(--ink-3);
}

.tip-row b {
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--ink);
}

.chart-empty {
	padding: 2rem 0;
	font-size: 0.85rem;
	color: var(--ink-3);
	text-align: center;
}
</style>
