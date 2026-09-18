<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
	animate,
	createScope,
	createTimeline,
	createDrawable,
	createMotionPath,
	stagger,
	spring,
	set,
} from 'animejs'

const DATASETS = [
	{
		tab: '股票',
		accent: 'var(--brass)',
		signed: true,
		recordMeta: '9 月 · 5 筆賣出',
		groupMeta: '依個股',
		insightMeta: '已實現損益',
		figurePrefix: '',
		sub: '報酬率 +7.8% · 勝率 80%',
		rows: [
			{ date: '09/03', name: '台積電', meta: '2330', amount: 8240, group: '台積電' },
			{ date: '09/08', name: '鴻海', meta: '2317', amount: -2150, group: '鴻海' },
			{ date: '09/12', name: '元大台灣50', meta: '0050', amount: 4380, group: '元大台灣50' },
			{ date: '09/17', name: '台積電', meta: '2330', amount: 10180, group: '台積電' },
			{ date: '09/22', name: '鴻海', meta: '2317', amount: 5630, group: '鴻海' },
		],
	},
	{
		tab: '信用卡',
		accent: 'var(--sky)',
		signed: false,
		recordMeta: '9 月帳單 · 5 筆',
		groupMeta: '依分類',
		insightMeta: '本期消費',
		figurePrefix: 'NT$ ',
		sub: '較上期 −6.2% · 10/10 繳款',
		rows: [
			{ date: '09/02', name: '超市採買', meta: '餐飲', amount: 1490, group: '餐飲' },
			{ date: '09/05', name: '高鐵車票', meta: '交通', amount: 1150, group: '交通' },
			{ date: '09/11', name: '餐廳聚餐', meta: '餐飲', amount: 2860, group: '餐飲' },
			{ date: '09/16', name: '秋季服飾', meta: '購物', amount: 3240, group: '購物' },
			{ date: '09/21', name: '加油', meta: '交通', amount: 1320, group: '交通' },
		],
	},
]

const active = ref(0)
const data = computed(() => DATASETS[active.value])
const total = computed(() => data.value.rows.reduce((sum, r) => sum + r.amount, 0))

const fmt = (v) => Math.round(Math.abs(v)).toLocaleString('en-US')
const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(v)
const money = (v) => (data.value.signed ? signed(v) : fmt(v))
const tone = (v) => (data.value.signed ? (v >= 0 ? 'rise' : 'fall') : '')

// ── 匯總：依群組加總，由大到小 ──
const groups = computed(() => {
	const map = new Map()
	data.value.rows.forEach((r) => map.set(r.group, (map.get(r.group) || 0) + r.amount))
	const list = [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
	const max = Math.max(...list.map((g) => Math.abs(g.value)))
	return list.map((g) => ({ ...g, pct: (Math.abs(g.value) / max) * 100 }))
})

// ── 分析：累計曲線（viewBox 280 × 84）──
const CHART = { left: 6, right: 274, top: 8, bottom: 66 }
const chart = computed(() => {
	let sum = 0
	const values = data.value.rows.map((r) => (sum += r.amount))
	const min = Math.min(0, ...values)
	const max = Math.max(...values)
	const x = (date) => CHART.left + ((+date.slice(3) - 1) / 29) * (CHART.right - CHART.left)
	const y = (v) => CHART.bottom - ((v - min) / (max - min)) * (CHART.bottom - CHART.top)
	const points = data.value.rows.map((r, i) => ({ x: x(r.date), y: y(values[i]) }))
	const line = `M${CHART.left} ${y(0).toFixed(1)}` + points.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
	const last = points[points.length - 1]
	return {
		points,
		line,
		area: `${line}L${last.x.toFixed(1)} ${CHART.bottom}H${CHART.left}Z`,
		zero: y(0),
	}
})

// ── 連動高亮 ──
const focus = ref(null) // { type: 'row' | 'group', key }
const activeGroup = computed(() => {
	if (!focus.value) return null
	return focus.value.type === 'row' ? data.value.rows[focus.value.key].group : focus.value.key
})
const rowOn = (i) => {
	if (!focus.value) return false
	return focus.value.type === 'row' ? focus.value.key === i : data.value.rows[i].group === focus.value.key
}
const rowState = (i) => (!focus.value ? '' : rowOn(i) ? 'on' : 'dim')
const groupState = (name) => (!focus.value ? '' : activeGroup.value === name ? 'on' : 'dim')

function setFocus(type, key) {
	focus.value = { type, key }
}

function clearFocus() {
	focus.value = null
}

// ── 卡片姿態：每張卡的傾斜角（v）與浮起比例（s），靜止角度（rest）由 CSS --rest 決定 ──
const root = ref(null)
const stack = ref(null)
const size = ref({ w: 0, h: 0 })
const links = ref([])
const lifted = ref(-1)
const poses = [0, 1, 2].map(() => ({ v: 0, s: 1, rest: null }))
let boxes = []

// ── 卡片之間的連接線：依版面位置與目前的旋轉、縮放計算端點 ──
function connect(i, j) {
	const gap = 10
	const a = boxes[i]
	const b = boxes[j]
	const fixed = (n) => n.toFixed(1)

	// 把卡片區域座標（以中心為原點）轉成容器座標
	const point = (box, pose, x, y) => {
		const r = (pose.v * Math.PI) / 180
		const cx = box.l + box.w / 2
		const cy = box.t + box.h / 2
		return [cx + pose.s * (x * Math.cos(r) - y * Math.sin(r)), cy + pose.s * (x * Math.sin(r) + y * Math.cos(r))]
	}
	const arrow = (x, y, pose) => {
		const r = (pose.v * Math.PI) / 180
		const p = (dx, dy) => `${fixed(x + dx * Math.cos(r) - dy * Math.sin(r))} ${fixed(y + dx * Math.sin(r) + dy * Math.cos(r))}`
		return `M${p(-4, -5)}L${p(0, 0)}L${p(4, -5)}`
	}

	// 直向堆疊（手機）：從上一張卡底部連到下一張卡頂部
	if (b.t >= a.t + a.h - 1) {
		const x = (Math.max(a.l, b.l) + Math.min(a.l + a.w, b.l + b.w)) / 2
		const [x1, y1] = point(a, poses[i], x - a.l - a.w / 2, a.h / 2 + gap)
		const [x2, y2] = point(b, poses[j], x - b.l - b.w / 2, -b.h / 2 - gap)
		return { d: `M${fixed(x1)} ${fixed(y1)}L${fixed(x2)} ${fixed(y2)}`, head: arrow(x2, y2, poses[j]) }
	}

	// 錯落疊放：從側邊出發，轉彎進入下一張卡的頂端
	const toRight = b.l + b.w / 2 > a.l + a.w / 2
	const [x1, y1] = point(a, poses[i], (toRight ? 1 : -1) * (a.w / 2 + gap), 0)
	const [x2, y2] = point(b, poses[j], b.w * (toRight ? 0.22 : -0.22), -b.h / 2 - gap)
	return {
		d: `M${fixed(x1)} ${fixed(y1)}C${fixed(x2)} ${fixed(y1)} ${fixed(x2)} ${fixed(y1)} ${fixed(x2)} ${fixed(y2)}`,
		head: arrow(x2, y2, poses[j]),
	}
}

function updateLinks() {
	if (boxes.length) links.value = [connect(0, 1), connect(1, 2)]
}

function applyPose(el, i) {
	el.style.setProperty('--tilt', poses[i].v)
	el.style.setProperty('--lift', poses[i].s)
	updateLinks()
}

function measure() {
	const el = stack.value
	if (!el) return
	const notes = [...el.querySelectorAll('.note')]

	// 靜止角度變了（初次載入或跨過手機斷點）才重設姿態
	notes.forEach((n, i) => {
		const rest = parseFloat(getComputedStyle(n).getPropertyValue('--rest')) || 0
		if (rest === poses[i].rest) return
		poses[i].rest = rest
		poses[i].v = rest
		n.style.setProperty('--tilt', rest)
	})

	boxes = notes.map((n) => ({ l: n.offsetLeft, t: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }))
	size.value = { w: el.offsetWidth, h: el.offsetHeight }
	updateLinks()
}

// 滑鼠移入或鍵盤聚焦：卡片轉正並浮起，離開後落回原本角度
function lift(i, on) {
	if (on) lifted.value = i
	else if (lifted.value === i) lifted.value = -1
	if (reduceMotion.matches) return

	const el = q('.note')[i]
	animate(poses[i], {
		v: on ? 0 : poses[i].rest,
		s: on ? 1.03 : 1,
		ease: spring({ bounce: 0.35, duration: 520 }),
		onUpdate: () => applyPose(el, i),
	})
}

function onFocusOut(e, i) {
	if (!e.currentTarget.contains(e.relatedTarget)) lift(i, false)
}

// ── 動畫 ──
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const counter = { v: 0 }
const figure = ref('')
let scope = null
let observer = null
let lineDrawable = null
let pulse = null

const q = (selector) => root.value.querySelectorAll(selector)
const figureText = (v) => data.value.figurePrefix + money(v)

function countUp(duration = 1000) {
	counter.v = 0
	return {
		v: total.value,
		duration,
		ease: 'out(3)',
		onUpdate: () => (figure.value = figureText(counter.v)),
	}
}

function select(i) {
	if (i === active.value) return
	clearFocus()

	if (reduceMotion.matches) {
		active.value = i
		figure.value = figureText(total.value)
		return
	}

	const bodies = q('.note-body, .note-meta')
	animate(bodies, {
		opacity: 0,
		y: -6,
		duration: 200,
		ease: 'in(2)',
		onComplete: () => {
			active.value = i
			nextTick(() => {
				animate(bodies, { opacity: [0, 1], y: [8, 0], duration: 600, ease: 'out(3)', delay: stagger(50) })
				animate(q('.group-fill'), { scaleX: [0, 1], duration: 900, ease: 'out(3)', delay: stagger(70, { start: 100 }) })
				animate(lineDrawable, { draw: ['0 0', '0 1'], duration: 900, ease: 'inOut(3)', delay: 150 })
				animate(q('.pt-inner'), { scale: [0, 1], ease: spring({ bounce: 0.4, duration: 450 }), delay: stagger(50, { start: 450 }) })
				animate(counter, countUp(900))
			})
		},
	})
}

// 高亮時：趨勢點彈起，光點沿連接線流過
watch(focus, () => {
	if (reduceMotion.matches) return

	q('.pt-inner').forEach((el, i) => {
		animate(el, { scale: rowOn(i) ? 1.45 : 1, ease: spring({ bounce: 0.5, duration: 380 }) })
	})

	if (!focus.value) return
	pulse?.cancel()
	const sparks = q('.spark')
	const paths = q('.link')
	const fade = [{ to: 1, duration: 120 }, { to: 0, duration: 180, delay: 380 }]
	set(sparks, { opacity: 0 })
	pulse = createTimeline({ defaults: { ease: 'inOut(2)' } })
		.add(sparks[0], { ...createMotionPath(paths[0]), duration: 680 }, 0)
		.add(sparks[0], { opacity: fade }, 0)
		.add(sparks[1], { ...createMotionPath(paths[1]), duration: 680 }, 420)
		.add(sparks[1], { opacity: fade }, 420)
})

onMounted(() => {
	measure()
	observer = new ResizeObserver(measure)
	observer.observe(stack.value)
	document.fonts?.ready.then(measure)

	scope = createScope({
		root: root.value,
		mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
	}).addOnce((self) => {
		if (self.matches.reduceMotion) {
			figure.value = figureText(total.value)
			return
		}

		const notes = q('.note')
		const drawnLinks = createDrawable(q('.link'))
		lineDrawable = createDrawable(q('.chart-line'))[0]

		// 卡片從略高、略大、更歪的狀態落到桌面
		const drop = (i, at) => [
			notes[i],
			{ opacity: 1, y: 0, duration: 700 },
			at,
		]
		const settle = (i, at) => [
			poses[i],
			{ v: poses[i].rest, s: 1, ease: spring({ bounce: 0.3, duration: 750 }), onUpdate: () => applyPose(notes[i], i) },
			at,
		]
		poses.forEach((pose, i) => {
			pose.v = pose.rest * 3.2
			pose.s = 1.08
			applyPose(notes[i], i)
		})

		set(notes, { opacity: 0, y: -24 })
		set(q('.row'), { opacity: 0, x: -8 })
		set(q('.group-fill'), { scaleX: 0 })
		set(q('.link-head, .chart-area, .figure-sub'), { opacity: 0 })
		set(q('.pt-inner'), { scale: 0 })
		figure.value = figureText(0)

		// 進場只播一次：卡片依序出現，連接線依流程方向畫出
		createTimeline({ defaults: { ease: 'out(4)' }, delay: 300 })
			.add(...drop(0, 0))
			.add(...settle(0, 0))
			.add(q('.row'), { opacity: 1, x: 0, duration: 600 }, stagger(55, { start: 150 }))
			.add(drawnLinks[0], { draw: ['0 0', '0 1'], duration: 500, ease: 'inOut(3)' }, 550)
			.add(q('.link-head')[0], { opacity: 1, duration: 200 }, 1000)
			.add(...drop(1, 800))
			.add(...settle(1, 800))
			.add(q('.group-fill'), { scaleX: 1, duration: 900, ease: 'out(3)' }, stagger(70, { start: 950 }))
			.add(drawnLinks[1], { draw: ['0 0', '0 1'], duration: 500, ease: 'inOut(3)' }, 1300)
			.add(q('.link-head')[1], { opacity: 1, duration: 200 }, 1750)
			.add(...drop(2, 1550))
			.add(...settle(2, 1550))
			.add(counter, countUp(1000), 1650)
			.add(q('.figure-sub'), { opacity: 1, duration: 600 }, 1800)
			.add(lineDrawable, { draw: ['0 0', '0 1'], duration: 900, ease: 'inOut(3)' }, 1750)
			.add(q('.chart-area'), { opacity: 1, duration: 700 }, 2200)
			.add(q('.pt-inner'), { scale: 1, ease: spring({ bounce: 0.45, duration: 450 }) }, stagger(60, { start: 2100 }))
	})
})

onBeforeUnmount(() => {
	observer?.disconnect()
	pulse?.cancel()
	scope?.revert()
})
</script>

<template>
	<div ref="root" class="collage" :class="{ focused: focus }" :style="{ '--accent': data.accent }">
		<div class="collage-bar">
			<p class="eyebrow">Sample · 範例資料</p>
			<div class="tabs" role="tablist" aria-label="範例資料">
				<button
					v-for="(d, i) in DATASETS"
					:key="d.tab"
					class="tab"
					:class="{ on: active === i }"
					type="button"
					role="tab"
					:aria-selected="active === i"
					@click="select(i)"
				>
					{{ d.tab }}
				</button>
			</div>
		</div>

		<div ref="stack" class="stack">
			<!-- 01 紀錄 -->
			<section
				class="note note-record"
				:class="{ lifted: lifted === 0 }"
				@mouseenter="lift(0, true)"
				@mouseleave="lift(0, false)"
				@focusin="lift(0, true)"
				@focusout="onFocusOut($event, 0)"
			>
				<header class="note-head">
					<span class="note-step">01</span>
					<span class="note-name">紀錄</span>
					<span class="note-meta">{{ data.recordMeta }}</span>
				</header>
				<ul class="note-body rows">
					<li
						v-for="(r, i) in data.rows"
						:key="i"
						class="row"
						:class="rowState(i)"
						tabindex="0"
						@mouseenter="setFocus('row', i)"
						@mouseleave="clearFocus"
						@focus="setFocus('row', i)"
						@blur="clearFocus"
					>
						<span class="row-date">{{ r.date }}</span>
						<span class="row-name">{{ r.name }}<small>{{ r.meta }}</small></span>
						<span class="row-amount" :class="tone(r.amount)">{{ money(r.amount) }}</span>
					</li>
				</ul>
			</section>

			<!-- 02 匯總 -->
			<section
				class="note note-sum"
				:class="{ lifted: lifted === 1 }"
				@mouseenter="lift(1, true)"
				@mouseleave="lift(1, false)"
				@focusin="lift(1, true)"
				@focusout="onFocusOut($event, 1)"
			>
				<header class="note-head">
					<span class="note-step">02</span>
					<span class="note-name">匯總</span>
					<span class="note-meta">{{ data.groupMeta }}</span>
				</header>
				<ul class="note-body groups">
					<li
						v-for="(g, i) in groups"
						:key="i"
						class="group"
						:class="groupState(g.name)"
						tabindex="0"
						@mouseenter="setFocus('group', g.name)"
						@mouseleave="clearFocus"
						@focus="setFocus('group', g.name)"
						@blur="clearFocus"
					>
						<span class="group-line">
							<span>{{ g.name }}</span>
							<span class="group-value" :class="tone(g.value)">{{ money(g.value) }}</span>
						</span>
						<span class="group-track">
							<span class="group-fill" :class="tone(g.value)" :style="{ width: g.pct + '%' }" />
						</span>
					</li>
				</ul>
			</section>

			<!-- 03 分析 -->
			<section
				class="note note-insight"
				:class="{ lifted: lifted === 2 }"
				@mouseenter="lift(2, true)"
				@mouseleave="lift(2, false)"
				@focusin="lift(2, true)"
				@focusout="onFocusOut($event, 2)"
			>
				<header class="note-head">
					<span class="note-step">03</span>
					<span class="note-name">分析</span>
					<span class="note-meta">{{ data.insightMeta }}</span>
				</header>
				<div class="note-body">
					<p class="figure">{{ figure }}</p>
					<p class="figure-sub">{{ data.sub }}</p>
					<svg class="chart" viewBox="0 0 280 84" aria-hidden="true">
						<defs>
							<linearGradient id="collage-area" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0" class="chart-stop" stop-opacity=".3" />
								<stop offset="1" class="chart-stop" stop-opacity="0" />
							</linearGradient>
						</defs>
						<path class="chart-zero" :d="`M${CHART.left} ${chart.zero}H${CHART.right}`" />
						<path class="chart-area" :d="chart.area" fill="url(#collage-area)" />
						<path class="chart-line" :d="chart.line" />
						<g v-for="(p, i) in chart.points" :key="i" :transform="`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`">
							<g
								class="pt"
								:class="rowState(i)"
								@mouseenter="setFocus('row', i)"
								@mouseleave="clearFocus"
							>
								<circle class="pt-hit" r="12" />
								<g class="pt-inner">
									<circle class="pt-ring" r="7" />
									<circle class="pt-dot" r="3.2" />
								</g>
							</g>
						</g>
						<text class="chart-axis" :x="CHART.left" y="81">9/1</text>
						<text class="chart-axis" :x="CHART.right" y="81" text-anchor="end">9/30</text>
					</svg>
				</div>
			</section>

			<svg class="links" :viewBox="`0 0 ${size.w} ${size.h}`" aria-hidden="true">
				<g v-for="(l, i) in links" :key="i">
					<path class="link" :d="l.d" />
					<path class="link-head" :d="l.head" />
				</g>
				<circle class="spark" r="3.5" />
				<circle class="spark" r="3.5" />
			</svg>
		</div>

		<p class="hint">
			<span class="hint-hover">將滑鼠移到任一筆紀錄，看它如何被匯總、分析</span>
			<span class="hint-touch">點選任一筆紀錄，看它如何被匯總、分析</span>
		</p>
	</div>
</template>

<style scoped>
.collage {
	position: relative;
}

/* ── 資料切換 ── */
.collage-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1rem;
}

.tabs {
	display: flex;
	padding: 0.2rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
}

.tab {
	padding: 0.3rem 0.9rem;
	border: 0;
	border-radius: 999px;
	background: transparent;
	font-size: 0.8rem;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.3s, background 0.3s;
}

.tab:hover {
	color: var(--ink);
}

.tab.on {
	background: color-mix(in srgb, var(--accent) 16%, transparent);
	color: var(--accent);
}

/* ── 卡片拼貼 ── */
.stack {
	position: relative;
	display: flex;
	flex-direction: column;
}

/* 散落的紙卡：--rest 為靜止角度，--tilt / --lift 由動畫即時寫入 */
.note {
	position: relative;
	width: 63%;
	padding: 0.9rem 1.15rem 1.2rem;
	border: 1px solid var(--line-strong);
	border-radius: 18px;
	background:
		linear-gradient(155deg, var(--card-sheen), transparent 45%),
		var(--card-bg);
	backdrop-filter: blur(14px) saturate(1.2);
	-webkit-backdrop-filter: blur(14px) saturate(1.2);
	box-shadow: var(--shadow-card);
	rotate: calc(var(--tilt, var(--rest)) * 1deg);
	scale: var(--lift, 1);
	transition: border-color 0.4s, box-shadow 0.5s;
}

.note.lifted {
	z-index: 5;
	box-shadow: var(--shadow-lift);
}

.note-record {
	--rest: -2.6;
	z-index: 1;
	align-self: flex-start;
	margin-left: 1%;
}

.note-sum {
	--rest: 2.2;
	z-index: 2;
	align-self: flex-end;
	width: 58%;
	margin-top: -0.9rem;
	margin-right: 0.5%;
}

.note-insight {
	--rest: -1.4;
	z-index: 3;
	align-self: flex-start;
	width: 61%;
	margin-top: -0.8rem;
	margin-left: 6%;
}

.focused .note {
	border-color: color-mix(in srgb, var(--accent) 28%, var(--line-strong));
}

.note-head {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
	margin-bottom: 0.6rem;
}

.note-step {
	font-family: var(--font-mono);
	font-size: 0.68rem;
	color: var(--accent);
}

.note-name {
	font-size: 0.85rem;
	font-weight: 500;
}

.note-meta {
	margin-left: auto;
	font-size: 0.72rem;
	color: var(--ink-3);
	white-space: nowrap;
}

.note-body {
	margin: 0;
	padding: 0;
	list-style: none;
}

/* 共用的高亮／淡化（列本身有進場動畫的行內 opacity，所以淡化套在子元素上） */
.row > *,
.group,
.pt {
	transition: opacity 0.35s, background-color 0.35s;
}

.row.dim > *,
.group.dim,
.pt.dim {
	opacity: 0.32;
}

.row {
	transition: background-color 0.35s;
}

/* ── 01 紀錄 ── */
.row {
	display: grid;
	grid-template-columns: 2.6rem minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.6rem;
	height: 2.15rem;
	margin-inline: -0.5rem;
	padding-inline: 0.5rem;
	border-radius: 8px;
	font-size: 0.84rem;
	cursor: default;
	outline: none;
}

.row + .row {
	box-shadow: inset 0 1px 0 var(--line);
}

.row.on {
	background-color: color-mix(in srgb, var(--accent) 12%, transparent);
	box-shadow: none;
}

.row.on + .row {
	box-shadow: none;
}

.row-date {
	font-family: var(--font-mono);
	font-size: 0.7rem;
	color: var(--ink-3);
}

.row-name {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.row-name small {
	margin-left: 0.45rem;
	font-size: 0.7rem;
	color: var(--ink-3);
}

.row-amount {
	font-family: var(--font-mono);
	font-size: 0.8rem;
	font-variant-numeric: tabular-nums;
}

.rise {
	color: var(--rise);
}

.fall {
	color: var(--fall);
}

/* ── 02 匯總 ── */
.group {
	display: block;
	margin-inline: -0.5rem;
	padding: 0.4rem 0.5rem 0.55rem;
	border-radius: 8px;
	cursor: default;
	outline: none;
}

.group.on {
	background-color: color-mix(in srgb, var(--accent) 12%, transparent);
}

.group-line {
	display: flex;
	justify-content: space-between;
	gap: 0.75rem;
	font-size: 0.82rem;
}

.group-value {
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.group-track {
	display: block;
	height: 5px;
	margin-top: 0.4rem;
	border-radius: 5px;
	background: var(--line);
}

.group-fill {
	display: block;
	height: 100%;
	border-radius: 5px;
	background: var(--accent);
	transform-origin: left;
}

.group-fill.rise {
	background: var(--rise);
}

.group-fill.fall {
	background: var(--fall);
}

/* ── 03 分析 ── */
.figure {
	font-family: var(--font-display);
	font-size: clamp(1.6rem, 2.6vw, 2rem);
	line-height: 1.15;
	letter-spacing: -0.02em;
	font-variant-numeric: tabular-nums lining-nums;
}

.figure-sub {
	margin-top: 0.15rem;
	font-size: 0.75rem;
	color: var(--ink-2);
}

.chart {
	display: block;
	width: 100%;
	height: auto;
	margin-top: 0.6rem;
	overflow: visible;
}

.chart-stop {
	stop-color: var(--accent);
}

.chart-zero {
	stroke: var(--line-strong);
	stroke-dasharray: 2 4;
}

.chart-line {
	fill: none;
	stroke: var(--accent);
	stroke-width: 1.8;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.pt-hit {
	fill: transparent;
}

.pt-inner {
	transform-box: fill-box;
	transform-origin: center;
	pointer-events: none;
}

.pt-ring {
	fill: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pt-dot {
	fill: var(--ink);
	stroke: var(--accent);
	stroke-width: 1.5;
}

.chart-axis {
	font-family: var(--font-mono);
	font-size: 8px;
	fill: var(--ink-3);
}

/* ── 連接線 ── */
.links {
	position: absolute;
	inset: 0;
	z-index: 6;
	width: 100%;
	height: 100%;
	overflow: visible;
	pointer-events: none;
}

.link,
.link-head {
	fill: none;
	stroke: var(--ink-3);
	stroke-width: 1.2;
	stroke-linecap: round;
	stroke-linejoin: round;
	transition: stroke 0.4s;
}

.focused .link,
.focused .link-head {
	stroke: var(--accent);
}

.spark {
	fill: var(--accent);
	opacity: 0;
	filter: drop-shadow(0 0 4px var(--accent));
}

.hint {
	margin-top: 1rem;
	font-size: 0.75rem;
	color: var(--ink-3);
	text-align: center;
}

.hint-touch {
	display: none;
}

@media (hover: none) {
	.hint-hover {
		display: none;
	}

	.hint-touch {
		display: inline;
	}
}

/* 手機：直向堆疊，連接線改為垂直 */
@media (max-width: 560px) {
	.note,
	.note-sum,
	.note-insight {
		width: 94%;
		margin-inline: 0;
	}

	.note-record {
		--rest: -1.3;
	}

	.note-sum {
		--rest: 1.2;
	}

	.note-insight {
		--rest: -0.8;
	}

	.note-sum,
	.note-insight {
		margin-top: 2.25rem;
	}
}
</style>
