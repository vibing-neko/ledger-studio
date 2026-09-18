<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
	createScope,
	createTimeline,
	createAnimatable,
	createDrawable,
	onScroll,
	splitText,
	scrambleText,
	stagger,
	set,
} from 'animejs'
import LedgerCollage from '../components/LedgerCollage.vue'

const tools = [
	{
		key: 'trade',
		to: '/trade',
		index: '01',
		title: '交易試算',
		en: 'Trade Calculator',
		accent: 'var(--brass)',
		desc: '下單前先算清楚：平均成本、損益平衡點、實際到手金額，以及怎麼分筆加碼，才能讓兩平價落在整數。',
		tags: ['損益試算', '加碼兩平價', '個股／ETF 稅率'],
	},
	{
		key: 'portfolio',
		to: '/portfolio',
		index: '02',
		title: '投資報酬率分析',
		en: 'Portfolio Returns',
		accent: 'var(--vermilion)',
		desc: '逐筆記錄多檔持股的買賣，追蹤每一檔與整體的已實現損益、持倉成本和投資報酬率。',
		tags: ['交易紀錄', '個股與整體 ROI', '匯入匯出'],
	},
	{
		key: 'expense',
		to: '/expense',
		index: '03',
		title: '信用卡記帳分析',
		en: 'Card Expenses',
		accent: 'var(--sky)',
		desc: '多張卡依各自結帳日切出帳單週期，看懂錢花去哪、這期花得多快、分期還剩多少。',
		tags: ['帳單週期', '分類佔比', '分期追蹤'],
	},
]

const principles = [
	{ no: 'I', title: '本機優先', desc: '所有紀錄只存在這台裝置的瀏覽器，不經過任何伺服器，也不需要登入。' },
	{ no: 'II', title: '內建台股規則', desc: '手續費最低 20 元與折扣試算、個股 0.3% 與 ETF 0.1% 證交稅，全部照實計算。' },
	{ no: 'III', title: '隨時帶走', desc: '以 JSON 匯出完整備份，換電腦或清除資料前，都能一鍵保留。' },
]

const donut = [
	[0, 0.36, 1],
	[0.38, 0.58, 0.7],
	[0.6, 0.74, 0.5],
	[0.76, 0.86, 0.34],
	[0.88, 0.98, 0.2],
]

function arc(cx, cy, r, from, to) {
	const a0 = from * Math.PI * 2 - Math.PI / 2
	const a1 = to * Math.PI * 2 - Math.PI / 2
	const large = to - from > 0.5 ? 1 : 0
	const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`
	return `M${p(a0)}A${r} ${r} 0 ${large} 1 ${p(a1)}`
}

const bars = [34, 48, 40, 62, 56, 78, 72, 96, 118]

const root = ref(null)
let scope = null

onMounted(() => {
	scope = createScope({
		root: root.value,
		mediaQueries: {
			reduceMotion: '(prefers-reduced-motion: reduce)',
			finePointer: '(hover: hover) and (pointer: fine)',
		},
	}).add((self) => {
		const { reduceMotion, finePointer } = self.matches
		if (reduceMotion) return

		// ── 首屏進場 ──
		const { chars } = splitText('.hero-title', { chars: { wrap: 'clip' } })
		set(chars, { y: '110%' })
		set('.hero-lead, .hero-actions > *, .hero-meta, .hero-visual', { opacity: 0 })

		createTimeline({ defaults: { ease: 'out(4)' } })
			.add('.hero-eyebrow', { innerHTML: scrambleText({ chars: 'A-Z' }) }, 0)
			.add(chars, { y: '0%', duration: 1100 }, stagger(32, { start: 120 }))
			.add('.hero-visual', { opacity: [0, 1], y: [40, 0], duration: 1200 }, 200)
			.add('.hero-lead', { opacity: [0, 1], y: [18, 0], duration: 1000 }, 650)
			.add('.hero-actions > *', { opacity: [0, 1], y: [18, 0], duration: 900 }, stagger(90, { start: 800 }))
			.add('.hero-meta', { opacity: [0, 1], duration: 900 }, 1050)

		// ── 工具卡：捲動到位才播放 ──
		const drawables = createDrawable('.art-draw')
		set('.tools-head > *, .tool', { opacity: 0 })
		set(drawables, { draw: '0 0' })
		set('.art-bar', { scaleY: 0 })
		set('.art-fade', { opacity: 0 })

		createTimeline({
			defaults: { ease: 'out(4)' },
			autoplay: onScroll({ target: '.tools', enter: '85% top', repeat: false }),
		})
			.add('.tools-head > *', { opacity: [0, 1], y: [30, 0], duration: 1000 }, stagger(100))
			.add('.tool', { opacity: [0, 1], y: [70, 0], duration: 1100 }, stagger(120, { start: 150 }))
			.add(drawables, { draw: ['0 0', '0 1'], duration: 1300, ease: 'inOut(3)' }, stagger(120, { start: 500 }))
			.add('.art-bar', { scaleY: [0, 1], duration: 900, ease: 'out(3)' }, stagger(45, { start: 550 }))
			.add('.art-fade', { opacity: [0, 1], duration: 800 }, stagger(60, { start: 900 }))

		// ── 設計原則 ──
		set('.principles-rule', { scaleX: 0 })
		set('.principle', { opacity: 0 })

		createTimeline({
			defaults: { ease: 'out(4)' },
			autoplay: onScroll({ target: '.principles', enter: '85% top', repeat: false }),
		})
			.add('.principles-rule', { scaleX: [0, 1], duration: 1400, ease: 'inOut(4)' })
			.add('.principle', { opacity: [0, 1], y: [30, 0], duration: 1000 }, stagger(120, { start: 250 }))

		// ── 工具卡：游標光暈與傾斜（僅限滑鼠）──
		if (!finePointer) return

		const cleanups = [...root.value.querySelectorAll('.tool-link')].map((card) => {
			const glow = createAnimatable(card.querySelector('.tool-glow'), { x: 700, y: 700, ease: 'out(3)' })
			const tilt = createAnimatable(card, { rotateX: 900, rotateY: 900, ease: 'out(3)' })

			const move = (e) => {
				const rect = card.getBoundingClientRect()
				const px = e.clientX - rect.left
				const py = e.clientY - rect.top
				glow.x(px)
				glow.y(py)
				tilt.rotateY((px / rect.width - 0.5) * 5)
				tilt.rotateX((0.5 - py / rect.height) * 5)
			}
			const leave = () => {
				tilt.rotateX(0)
				tilt.rotateY(0)
			}

			card.addEventListener('pointermove', move)
			card.addEventListener('pointerleave', leave)
			return () => {
				card.removeEventListener('pointermove', move)
				card.removeEventListener('pointerleave', leave)
			}
		})

		return () => cleanups.forEach((fn) => fn())
	})
})

onBeforeUnmount(() => scope?.revert())
</script>

<template>
	<main ref="root" class="home">
		<!-- ── 首屏 ── -->
		<section class="hero">
			<div class="container hero-inner">
				<div class="hero-copy">
					<p class="eyebrow hero-eyebrow">Ledger Studio — Personal Finance Atelier</p>
					<h1 class="hero-title">記下每一筆，<br />看清<em>每一分錢</em>。</h1>
					<p class="lead lead-balance hero-lead">
						為台股投資與信用卡帳單打造的個人理財工具。
						把每一筆交易與消費記下來，再轉成看得懂的損益、報酬率與消費分析。
					</p>
					<div class="hero-actions">
						<RouterLink to="/trade" class="btn btn-primary">
							開始試算
							<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
								<path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</RouterLink>
						<a href="#tools" class="btn" @click.prevent="root.querySelector('#tools').scrollIntoView({ behavior: 'smooth' })">瀏覽全部工具</a>
					</div>
					<ul class="hero-meta">
						<li>資料只存在本機</li>
						<li>免登入</li>
						<li>台股規則內建</li>
					</ul>
				</div>
				<div class="hero-visual">
					<LedgerCollage />
				</div>
			</div>
		</section>

		<!-- ── 工具 ── -->
		<section id="tools" class="tools">
			<div class="container">
				<header class="tools-head">
					<div>
						<p class="eyebrow">Tools · 工具</p>
						<h2 class="section-title">三件工具，<br />各司其職。</h2>
					</div>
					<p class="lead lead-balance section-lead">
						交易前的精算、持股的長期追蹤、每月帳單的回顧，分別交給專門的工具處理，彼此不打擾。
					</p>
				</header>

				<div class="tools-grid">
					<article v-for="tool in tools" :key="tool.key" class="tool" :style="{ '--accent': tool.accent }">
						<RouterLink :to="tool.to" class="tool-link">
							<span class="tool-glow" aria-hidden="true" />

							<div class="tool-top">
								<span class="tool-index">{{ tool.index }}</span>
							</div>

							<div class="tool-art" aria-hidden="true">
								<svg v-if="tool.key === 'trade'" viewBox="0 0 280 150">
									<defs>
										<linearGradient id="art-area" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0" class="stop-accent" stop-opacity=".28" />
											<stop offset="1" class="stop-accent" stop-opacity="0" />
										</linearGradient>
									</defs>
									<path class="art-grid" d="M0 30H280M0 70H280M0 110H280" />
									<path class="art-fade" d="M0 118C28 112 44 126 70 108S116 86 140 94 190 58 214 64 256 30 280 26V150H0Z" fill="url(#art-area)" />
									<path class="art-dash" d="M0 78H280" />
									<path class="art-draw art-line" d="M0 118C28 112 44 126 70 108S116 86 140 94 190 58 214 64 256 30 280 26" />
									<g class="art-fade">
										<circle cx="178" cy="78" r="9" class="art-ring" />
										<circle cx="178" cy="78" r="3.5" class="art-dot" />
										<text x="280" y="96" text-anchor="end" class="art-label">BREAKEVEN 128.40</text>
									</g>
								</svg>

								<svg v-else-if="tool.key === 'portfolio'" viewBox="0 0 280 150">
									<path class="art-grid" d="M0 140H280" />
									<rect
										v-for="(h, i) in bars"
										:key="i"
										class="art-bar"
										:x="6 + i * 30"
										:y="140 - h"
										width="18"
										:height="h"
										rx="3"
										:style="{ opacity: 0.25 + i * 0.09 }"
									/>
									<g class="art-fade">
										<text x="0" y="14" class="art-label">ROI</text>
										<text x="0" y="36" class="art-figure">+18.6%</text>
									</g>
								</svg>

								<svg v-else viewBox="0 0 280 150">
									<circle cx="72" cy="75" r="52" class="art-track" />
									<path
										v-for="(seg, i) in donut"
										:key="i"
										class="art-draw art-arc"
										:d="arc(72, 75, 52, seg[0], seg[1])"
										:style="{ strokeOpacity: seg[2] }"
									/>
									<g class="art-fade">
										<text x="72" y="70" text-anchor="middle" class="art-label">本期</text>
										<text x="72" y="92" text-anchor="middle" class="art-figure">42.3K</text>
									</g>
									<g v-for="(row, i) in [['餐飲', '36%'], ['交通', '20%'], ['購物', '14%']]" :key="row[0]" class="art-fade">
										<circle cx="164" :cy="48 + i * 28" r="4" class="art-dot" :style="{ opacity: donut[i][2] }" />
										<text x="178" :y="52 + i * 28" class="art-legend">{{ row[0] }}</text>
										<text x="280" :y="52 + i * 28" text-anchor="end" class="art-label">{{ row[1] }}</text>
									</g>
								</svg>
							</div>

							<div class="tool-body">
								<p class="tool-en">{{ tool.en }}</p>
								<h3 class="tool-title">{{ tool.title }}</h3>
								<p class="lead tool-desc">{{ tool.desc }}</p>
								<ul class="tool-tags">
									<li v-for="tag in tool.tags" :key="tag">{{ tag }}</li>
								</ul>
							</div>

							<span class="tool-cta">
								進入工具
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
									<path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</span>
						</RouterLink>
					</article>
				</div>
			</div>
		</section>

		<!-- ── 設計原則 ── -->
		<section class="principles">
			<div class="container">
				<div class="principles-rule" />
				<div class="principles-grid">
					<div v-for="p in principles" :key="p.no" class="principle">
						<span class="principle-no">{{ p.no }}</span>
						<h3 class="principle-title">{{ p.title }}</h3>
						<p class="lead principle-desc">{{ p.desc }}</p>
					</div>
				</div>
			</div>
		</section>
	</main>
</template>

<style scoped>
/* ── 首屏 ── */
.hero {
	position: relative;
	overflow: hidden;
}

/* 帳本橫線 */
.hero::before {
	content: "";
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: repeating-linear-gradient(to bottom, transparent 0 47px, var(--line) 47px 48px);
	mask-image: radial-gradient(ellipse 70% 60% at 30% 40%, #000 20%, transparent 75%);
	-webkit-mask-image: radial-gradient(ellipse 70% 60% at 30% 40%, #000 20%, transparent 75%);
}

.hero-inner {
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
	align-items: center;
	gap: clamp(2.5rem, 6vw, 5.5rem);
	min-height: min(calc(100svh - 4rem), 900px);
	padding-block: clamp(2.5rem, 5vw, 4rem);
}

.hero-eyebrow {
	color: var(--brass);
	margin-bottom: 1.75rem;
}

.hero-title {
	font-family: var(--font-serif);
	font-size: clamp(2.3rem, 4.4vw, 4.1rem);
	font-weight: 900;
	line-height: 1.16;
	letter-spacing: 0.01em;
}

.hero-title em {
	font-style: normal;
	color: var(--brass);
}

.hero-lead {
	max-width: 34rem;
	margin-top: 1.75rem;
	font-size: clamp(1rem, 1.3vw, 1.08rem);
	color: var(--ink-2);
}

.hero-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	margin-top: 2.5rem;
}

.hero-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem 1.25rem;
	margin: 2.25rem 0 0;
	padding: 0;
	list-style: none;
	font-size: 0.8rem;
	color: var(--ink-3);
}

.hero-meta li {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.hero-meta li::before {
	content: "";
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--brass);
	opacity: 0.7;
}

/* ── 區塊標題 ── */
.tools {
	padding-block: clamp(4.5rem, 10vw, 8rem);
}

.tools-head {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 1.5rem 4rem;
	flex-wrap: wrap;
	margin-bottom: clamp(2.5rem, 5vw, 4rem);
}

.section-title {
	margin-top: 1rem;
	font-family: var(--font-serif);
	font-size: clamp(2rem, 4vw, 3.2rem);
	font-weight: 900;
	line-height: 1.2;
}

.section-lead {
	max-width: 26rem;
	color: var(--ink-2);
}

/* ── 工具卡 ── */
.tools-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
	gap: 1.25rem;
}

.tool {
	perspective: 1200px;
}

.tool-link {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	padding: 1.75rem;
	overflow: hidden;
	border: 1px solid var(--line-strong);
	border-radius: 24px;
	background: var(--panel-bg);
	transition: border-color 0.5s;
	isolation: isolate;
}

.tool-link:hover {
	border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}

.tool-glow {
	position: absolute;
	top: 0;
	left: 0;
	z-index: -1;
	width: 360px;
	height: 360px;
	margin: -180px 0 0 -180px;
	border-radius: 50%;
	background: radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 65%);
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.5s;
}

.tool-link:hover .tool-glow {
	opacity: 1;
}

.tool-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.tool-index {
	font-family: var(--font-display);
	font-size: 1.1rem;
	font-style: italic;
	color: var(--accent);
}

.tool-art {
	margin: 1.75rem 0 2rem;
}

.tool-art svg {
	display: block;
	width: 100%;
	height: auto;
	overflow: visible;
}

.tool-body {
	flex: 1;
}

.tool-en {
	font-family: var(--font-mono);
	font-size: 0.7rem;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--ink-3);
}

.tool-title {
	margin-top: 0.35rem;
	font-family: var(--font-serif);
	font-size: 1.55rem;
	font-weight: 600;
}

.tool-desc {
	margin-top: 0.75rem;
	font-size: 0.92rem;
	color: var(--ink-2);
}

.tool-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	margin: 1.25rem 0 0;
	padding: 0;
	list-style: none;
}

.tool-tags li {
	padding: 0.2rem 0.65rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--ink) 7%, transparent);
	font-size: 0.75rem;
	color: var(--ink-2);
}

.tool-cta {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	margin-top: 1.75rem;
	padding-top: 1.25rem;
	border-top: 1px solid var(--line);
	font-size: 0.88rem;
	font-weight: 500;
	color: var(--accent);
}

.tool-cta svg {
	transition: transform 0.5s var(--ease-out);
}

.tool-link:hover .tool-cta svg {
	transform: translateX(6px);
}

/* ── 卡片插圖 ── */
.stop-accent {
	stop-color: var(--accent);
}

.art-grid {
	stroke: var(--line);
	stroke-width: 1;
}

.art-dash {
	stroke: var(--ink-3);
	stroke-width: 1;
	stroke-dasharray: 3 5;
}

.art-line {
	fill: none;
	stroke: var(--accent);
	stroke-width: 2;
	stroke-linecap: round;
}

.art-ring {
	fill: none;
	stroke: var(--accent);
	stroke-opacity: 0.35;
}

.art-dot {
	fill: var(--accent);
}

.art-bar {
	fill: var(--accent);
	transform-box: fill-box;
	transform-origin: bottom;
}

.art-track {
	fill: none;
	stroke: var(--line);
	stroke-width: 14;
}

.art-arc {
	fill: none;
	stroke: var(--accent);
	stroke-width: 14;
}

.art-label {
	font-family: var(--font-mono);
	font-size: 10px;
	letter-spacing: 0.08em;
	fill: var(--ink-3);
}

.art-legend {
	font-family: var(--font-sans);
	font-size: 12px;
	fill: var(--ink-2);
}

.art-figure {
	font-family: var(--font-display);
	font-size: 20px;
	fill: var(--ink);
}

/* ── 設計原則 ── */
.principles {
	padding-block: 0 clamp(4.5rem, 10vw, 7rem);
}

.principles-rule {
	height: 1px;
	background: linear-gradient(90deg, var(--brass), var(--line-strong) 40%, transparent);
	transform-origin: left;
}

.principles-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
	gap: 2rem clamp(2rem, 5vw, 4rem);
	padding-top: 2.5rem;
}

.principle-no {
	font-family: var(--font-display);
	font-size: 0.95rem;
	font-style: italic;
	color: var(--brass);
}

.principle-title {
	margin-top: 0.75rem;
	font-size: 1.1rem;
	font-weight: 700;
}

.principle-desc {
	margin-top: 0.5rem;
	font-size: 0.9rem;
	color: var(--ink-2);
}

@media (max-width: 900px) {
	.hero-inner {
		grid-template-columns: 1fr;
		min-height: 0;
	}

	.hero-visual {
		width: 100%;
		max-width: 520px;
		justify-self: center;
	}
}
</style>
