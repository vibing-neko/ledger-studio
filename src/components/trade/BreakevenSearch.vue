<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { animate, stagger, set } from 'animejs'
import NumberField from '../NumberField.vue'
import SegmentedControl from '../SegmentedControl.vue'
import { fmtNumber, lotsText } from '../../utils/format.js'
import { prefersReducedMotion } from '../../utils/motion.js'

const props = defineProps({
	settings: { type: Object, required: true },
	inputs: { type: Object, required: true },
})

const ODD_LOT_MAX = 999
const COMBO_LIMIT = 2e8
const buyModes = [
	{ value: true, label: '整張＋零股' },
	{ value: false, label: '只用零股' },
]
const roundModes = [
	{ value: 'round', label: '四捨五入' },
	{ value: 'floor', label: '無條件捨去' },
]

const root = ref(null)
const runBtn = ref(null)
const status = ref('idle') // idle | running | done
const progress = ref(0)
const results = ref([])
const summary = ref(null)
const selected = ref(null)
const errors = ref({})
const notice = ref('')
const stale = ref(false)
let worker = null

const positive = (v) => typeof v === 'number' && v > 0
const isInt = (v) => Number.isInteger(v) && v >= 1

const addShares = computed(() => (positive(props.inputs.target) ? props.inputs.target - (props.settings.shares || 0) : null))

// 預估搜尋量：外層是「整張張數 × 整張價位 × 前段股數 × 前段價位」，最後一組價位用反推
const plan = computed(() => {
	const p = props.inputs
	const add = addShares.value
	if (!(add > 0 && positive(p.priceMin) && p.priceMax >= p.priceMin && positive(p.priceStep))) return null
	if (!isInt(p.splitMin) || !isInt(p.splitMax)) return null

	const prices = Math.floor((p.priceMax - p.priceMin) / p.priceStep + 1e-9) + 1
	const maxLots = p.useLots ? Math.floor(add / 1000) : 0
	let combos = 0
	let minOrders = Infinity

	for (let lots = 0; lots <= maxLots; lots++) {
		const rest = add - lots * 1000
		const lotOrders = lots > 0 ? 1 : 0
		const lotPrices = lots > 0 ? prices : 1
		if (rest === 0) {
			minOrders = Math.min(minOrders, lotOrders)
			combos += lotPrices
			continue
		}
		const oddMin = Math.max(1, Math.ceil(rest / ODD_LOT_MAX))
		minOrders = Math.min(minOrders, oddMin + lotOrders)
		for (let odd = Math.max(oddMin, p.splitMin - lotOrders); odd <= p.splitMax - lotOrders; odd++) {
			for (let tail = 1; tail <= odd; tail++) {
				const head = odd - tail
				combos += head === 0 ? lotPrices : lotPrices * prices * Math.min(ODD_LOT_MAX, Math.floor(rest / head))
			}
		}
	}

	return { add, prices, maxLots, minOrders, combos }
})

const planText = computed(() => {
	const x = plan.value
	if (!x) return '填好加碼計畫後，會顯示預估的搜尋量'
	const combos = x.combos >= 1e8 ? `${fmtNumber(x.combos / 1e8, 1)} 億` : x.combos >= 1e4 ? `${fmtNumber(x.combos / 1e4, 1)} 萬` : fmtNumber(x.combos)
	const lots = x.maxLots > 0 ? ` · 最多 ${x.maxLots} 張整股` : ''
	return `加碼 ${fmtNumber(x.add)} 股 · ${x.prices} 個價位${lots} · 約 ${combos} 種前段組合`
})

const group = computed(() => results.value.find((r) => r.be === selected.value))
const cheapest = computed(() => {
	if (!group.value) return null
	const min = Math.min(...group.value.options.map((o) => o.totalCost))
	// 只有在唯一最低時才標記
	return group.value.options.filter((o) => o.totalCost === min).length === 1 ? min : null
})

watch(
	() => [props.settings, props.inputs],
	() => {
		if (status.value === 'done') stale.value = true
	},
	{ deep: true },
)

function validate() {
	const s = props.settings
	const p = props.inputs
	const e = {}
	const shares0 = s.shares || 0

	// 價格以「分」計算，最多到小數兩位
	const cents = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

	if (!positive(p.target)) e.target = '請輸入加碼後總股數'
	else if (!Number.isInteger(p.target)) e.target = '請輸入整數股數'
	else if (p.target <= shares0) e.target = `需大於原有股數 ${fmtNumber(shares0)} 股`
	if (!positive(p.priceMin)) e.priceMin = '請輸入價格下限'
	else if (!cents(p.priceMin)) e.priceMin = '價格最多到小數兩位'
	if (!positive(p.priceMax)) e.priceMax = '請輸入價格上限'
	else if (!cents(p.priceMax)) e.priceMax = '價格最多到小數兩位'
	else if (positive(p.priceMin) && p.priceMax < p.priceMin) e.priceMax = '上限不能低於下限'
	if (!positive(p.priceStep)) e.priceStep = '請輸入價格級距'
	else if (p.priceStep < 0.01 || !cents(p.priceStep)) e.priceStep = '最小 0.01 元，最多到小數兩位'
	if (!isInt(p.splitMin)) e.splitMin = '請輸入 1 以上的整數'
	if (!isInt(p.splitMax)) e.splitMax = '請輸入 1 以上的整數'
	else if (isInt(p.splitMin) && p.splitMax < p.splitMin) e.splitMax = '不能少於最少筆數'
	if (p.beMin != null && p.beMax != null && p.beMax < p.beMin) e.beMax = '上限不能低於下限'

	if (!Object.keys(e).length && plan.value) {
		const need = plan.value.minOrders
		if (need > p.splitMax) {
			e.splitMax = p.useLots
				? `加碼 ${fmtNumber(plan.value.add)} 股至少要分 ${need} 筆`
				: `只用零股的話，加碼 ${fmtNumber(plan.value.add)} 股至少要分 ${need} 筆（每筆最多 999 股）`
		}
	}

	let message = ''
	if (shares0 > 0 && !positive(s.cost)) message = '請在左側填入原有總成本'
	else if (!Object.keys(e).length && plan.value?.combos > COMBO_LIMIT) message = '組合數太多，請縮小價格區間、加大級距或減少筆數'

	return { e, message }
}

function shake() {
	if (prefersReducedMotion()) return
	animate(runBtn.value, {
		x: [{ to: -8 }, { to: 7 }, { to: -5 }, { to: 3 }, { to: 0 }],
		duration: 380,
		ease: 'out(2)',
	})
}

function run() {
	const { e, message } = validate()
	errors.value = e
	notice.value = message
	if (Object.keys(e).length || message) return shake()

	const s = props.settings
	const p = props.inputs
	const payload = {
		cost0: s.cost || 0,
		shares0: s.shares || 0,
		discount: positive(s.discount) ? s.discount : 100,
		minFee: s.minFee >= 0 ? s.minFee : 20,
		type: s.type,
		target: p.target,
		priceMin: p.priceMin,
		priceMax: p.priceMax,
		priceStep: p.priceStep,
		splitMin: p.splitMin,
		splitMax: p.splitMax,
		roundMode: p.roundMode,
		beMin: p.beMin,
		beMax: p.beMax,
		useLots: !!p.useLots,
	}

	worker?.terminate()
	status.value = 'running'
	progress.value = 0
	stale.value = false

	worker = new Worker(new URL('../../workers/breakeven.worker.js', import.meta.url), { type: 'module' })
	worker.onmessage = ({ data }) => {
		if (data.type === 'progress') {
			progress.value = data.done / data.total
			return
		}
		worker.terminate()
		worker = null
		results.value = data.results
		summary.value = { checked: data.checked, seconds: data.ms / 1000 }
		selected.value = data.results[0]?.be ?? null
		status.value = 'done'
		nextTick(() => revealResults(true))
	}
	// 背景執行緒出錯時不要一直停在「搜尋中」
	worker.onerror = () => {
		worker?.terminate()
		worker = null
		status.value = summary.value ? 'done' : 'idle'
		notice.value = '搜尋時發生錯誤，請調整條件後再試一次'
	}
	worker.postMessage(payload)
}

function cancel() {
	worker?.terminate()
	worker = null
	status.value = summary.value ? 'done' : 'idle'
}

function revealResults(withChips) {
	if (prefersReducedMotion() || !root.value) return
	const $ = (s) => root.value.querySelectorAll(s)
	const cards = $('.option')
	set(cards, { opacity: 0 })
	animate(cards, { opacity: [0, 1], y: [18, 0], duration: 650, ease: 'out(4)', delay: stagger(70) })
	animate($('.split-seg'), { scaleX: [0, 1], duration: 700, ease: 'out(3)', delay: stagger(20, { start: 200 }) })
	if (withChips) animate($('.chip'), { opacity: [0, 1], scale: [0.9, 1], duration: 500, ease: 'out(3)', delay: stagger(40) })
}

function choose(be) {
	if (be === selected.value) return
	if (prefersReducedMotion()) {
		selected.value = be
		return
	}
	animate(root.value.querySelectorAll('.option'), {
		opacity: 0,
		y: -8,
		duration: 180,
		ease: 'in(2)',
		onComplete: () => {
			selected.value = be
			nextTick(() => revealResults(false))
		},
	})
}

onBeforeUnmount(() => worker?.terminate())
</script>

<template>
	<div ref="root" class="search">
		<section class="panel plan">
			<header class="section-head">
				<h3 class="section-title">加碼計畫</h3>
			</header>
			<p class="lead plan-desc">
				可以先買整張、再用零股湊尾數（零股每筆 1–999 股），零股最多分成兩種股數與價位的組合，
				找出讓損益兩平價剛好落在整數的方式。單筆手續費低於最低手續費的組合會被排除，避免被多收。
			</p>

			<div class="plan-grid">
				<NumberField
					v-model="inputs.target"
					class="span-2"
					label="加碼後總股數"
					suffix="股"
					step="1"
					:error="errors.target"
					:hint="addShares > 0 ? `需加碼 ${fmtNumber(addShares)} 股（${lotsText(addShares)}）` : '含原有持股的目標股數'"
				/>
				<div class="field">
					<span class="field-label">加碼方式</span>
					<SegmentedControl v-model="inputs.useLots" :options="buyModes" label="加碼方式" block />
					<p class="field-hint">{{ inputs.useLots ? '可用 1 筆整張單加零股' : '全部用零股分筆' }}</p>
				</div>
				<NumberField v-model="inputs.priceStep" label="價格級距" suffix="元" step="0.01" :error="errors.priceStep" hint="依升降單位，例如 0.5" />
				<NumberField v-model="inputs.priceMin" label="買進價格下限" suffix="元" step="0.01" :error="errors.priceMin" />
				<NumberField v-model="inputs.priceMax" label="買進價格上限" suffix="元" step="0.01" :error="errors.priceMax" />
				<div class="field">
					<span class="field-label">兩平價取到小數兩位</span>
					<SegmentedControl v-model="inputs.roundMode" :options="roundModes" label="兩平價進位方式" block />
				</div>
				<NumberField v-model="inputs.splitMin" label="最少分幾筆" suffix="筆" step="1" :error="errors.splitMin" hint="含整張單" />
				<NumberField v-model="inputs.splitMax" label="最多分幾筆" suffix="筆" step="1" :error="errors.splitMax" hint="含整張單" />
				<div class="pair">
					<NumberField v-model="inputs.beMin" label="兩平價下限" suffix="元" step="1" hint="選填" />
					<NumberField v-model="inputs.beMax" label="兩平價上限" suffix="元" step="1" :error="errors.beMax" hint="選填" />
				</div>
			</div>

			<div class="actions">
				<button ref="runBtn" type="button" class="btn btn-primary" :disabled="status === 'running'" @click="run">
					{{ status === 'running' ? '搜尋中…' : '開始搜尋' }}
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
						<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" />
						<path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
					</svg>
				</button>
				<p class="plan-note" :class="{ warn: notice }">{{ notice || planText }}</p>
			</div>

			<div v-if="status === 'running'" class="progress">
				<div class="progress-track">
					<span class="progress-fill" :style="{ transform: `scaleX(${progress})` }" />
				</div>
				<span class="progress-text">{{ Math.round(progress * 100) }}%</span>
				<button type="button" class="text-btn" @click="cancel">取消</button>
			</div>
		</section>

		<section v-if="summary" class="panel results">
			<header class="results-head">
				<div>
					<p class="eyebrow">Results · 搜尋結果</p>
					<h3 class="section-title">
						{{ results.length ? `找到 ${results.length} 個整數兩平價` : '沒有符合的組合' }}
					</h3>
				</div>
				<p class="results-meta">
					檢查 {{ fmtNumber(summary.checked) }} 組 · {{ summary.seconds < 0.01 ? '不到 0.01' : fmtNumber(summary.seconds, 2) }} 秒
				</p>
			</header>

			<p v-if="stale" class="stale">條件已變更，重新搜尋才會更新結果</p>

			<p v-if="!results.length" class="none">
				在目前的價格區間與筆數範圍內，湊不出整數兩平價。可以試著放寬價格區間、縮小價格級距，或提高最多筆數。
			</p>

			<template v-else>
				<div class="chips" role="tablist" aria-label="兩平價">
					<button
						v-for="r in results"
						:key="r.be"
						type="button"
						role="tab"
						class="chip"
						:class="{ on: r.be === selected }"
						:aria-selected="r.be === selected"
						@click="choose(r.be)"
					>
						<span class="chip-value">{{ fmtNumber(r.be) }}</span>
						<span class="chip-count">{{ r.options.length }} 種</span>
					</button>
				</div>

				<div v-if="group" class="options">
					<article
						v-for="o in group.options"
						:key="`${group.be}-${o.k}`"
						class="option"
						:class="{ best: o.totalCost === cheapest }"
					>
						<header class="option-head">
							<span class="option-k">分 {{ o.k }} 筆</span>
							<span v-if="o.totalCost === cheapest && group.options.length > 1" class="badge">總成本最低</span>
						</header>

						<div class="split" aria-hidden="true">
							<span v-if="o.lots" class="split-seg lots" :style="{ flexGrow: o.lots.shares }" />
							<template v-for="(g, gi) in o.groups" :key="gi">
								<span
									v-for="i in g.orders"
									:key="`${gi}-${i}`"
									class="split-seg"
									:class="{ last: gi === o.groups.length - 1 }"
									:style="{ flexGrow: g.shares }"
								/>
							</template>
						</div>

						<ul class="option-lines">
							<li v-if="o.lots">
								<span class="line-label">整張 1 筆</span>
								<span class="line-main">{{ o.lots.lots }} 張 × {{ fmtNumber(o.lots.price, 2) }}</span>
								<span class="line-fee">手續費 {{ o.lots.fee }}</span>
							</li>
							<li v-for="(g, gi) in o.groups" :key="gi">
								<span class="line-label">
									零股 {{ g.orders }} 筆{{ g.orders > 1 ? '，每筆' : '' }}
								</span>
								<span class="line-main">{{ fmtNumber(g.shares) }} 股 × {{ fmtNumber(g.price, 2) }}</span>
								<span class="line-fee">手續費 {{ g.fee }}</span>
							</li>
						</ul>

						<footer class="option-foot">
							<span>總成本 <b>{{ fmtNumber(Math.round(o.totalCost)) }}</b> 元</span>
							<span>精確兩平價 <b>{{ fmtNumber(o.exact, 4) }}</b></span>
						</footer>
					</article>
				</div>
			</template>
		</section>
	</div>
</template>

<style scoped>
.search {
	display: grid;
	gap: 1.25rem;
}

.plan-desc {
	max-width: 44rem;
	margin: -0.35rem 0 1.4rem;
	font-size: 0.84rem;
	color: var(--ink-2);
}

.plan-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1rem 1rem;
}

.span-2 {
	grid-column: span 2;
}

.pair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.75rem 1.25rem;
	margin-top: 1.5rem;
	padding-top: 1.25rem;
	border-top: 1px solid var(--line);
}

.btn:disabled {
	opacity: 0.6;
	cursor: progress;
}

.plan-note {
	font-size: 0.8rem;
	color: var(--ink-3);
}

.plan-note.warn {
	color: var(--vermilion);
}

.progress {
	display: flex;
	align-items: center;
	gap: 0.9rem;
	margin-top: 1rem;
}

.progress-track {
	flex: 1;
	height: 4px;
	overflow: hidden;
	border-radius: 4px;
	background: var(--line);
}

.progress-fill {
	display: block;
	height: 100%;
	background: linear-gradient(90deg, var(--brass), var(--brass-light));
	transform-origin: left;
	transition: transform 0.2s linear;
}

.progress-text {
	width: 2.5rem;
	font-family: var(--font-mono);
	font-size: 0.75rem;
	color: var(--ink-2);
	text-align: right;
}

.text-btn {
	padding: 0;
	border: 0;
	background: none;
	font-size: 0.8rem;
	color: var(--ink-3);
	text-decoration: underline;
	text-underline-offset: 3px;
	cursor: pointer;
}

.text-btn:hover {
	color: var(--ink);
}

/* ── 結果 ── */
.results-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 0.5rem 1rem;
	margin-bottom: 1.25rem;
}

.results-head .section-title {
	margin-top: 0.3rem;
}

.results-meta {
	font-family: var(--font-mono);
	font-size: 0.72rem;
	color: var(--ink-3);
}

.stale {
	margin-bottom: 1rem;
	padding: 0.55rem 0.85rem;
	border-radius: 10px;
	background: color-mix(in srgb, var(--vermilion) 12%, transparent);
	font-size: 0.8rem;
	color: var(--vermilion);
}

.none {
	font-size: 0.88rem;
	color: var(--ink-2);
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin-bottom: 1.25rem;
}

.chip {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
	padding: 0.5rem 0.95rem;
	border: 1px solid var(--line-strong);
	border-radius: 14px;
	background: transparent;
	cursor: pointer;
	transition: border-color 0.3s, background 0.3s;
}

.chip:hover {
	border-color: var(--ink-3);
}

.chip.on {
	border-color: color-mix(in srgb, var(--brass) 55%, transparent);
	background: color-mix(in srgb, var(--brass) 13%, transparent);
}

.chip-value {
	font-family: var(--font-display);
	font-size: 1.25rem;
	line-height: 1;
}

.chip.on .chip-value {
	color: var(--brass-light);
}

.chip-count {
	font-size: 0.7rem;
	color: var(--ink-3);
}

.options {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr));
	gap: 0.9rem;
}

.option {
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
	padding: 1.1rem 1.15rem;
	border: 1px solid var(--line);
	border-radius: 16px;
	background: var(--sunken-bg);
}

.option.best {
	border-color: color-mix(in srgb, var(--brass) 45%, transparent);
}

.option-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.option-k {
	font-family: var(--font-serif);
	font-size: 1.05rem;
	font-weight: 600;
}

.badge {
	padding: 0.1rem 0.55rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--brass) 15%, transparent);
	font-size: 0.68rem;
	color: var(--brass);
}

.split {
	display: flex;
	gap: 3px;
	height: 6px;
}

.split-seg {
	flex-basis: 0;
	border-radius: 3px;
	background: color-mix(in srgb, var(--ink) 30%, transparent);
	transform-origin: left;
}

.split-seg.last {
	background: var(--brass);
}

.split-seg.lots {
	background: color-mix(in srgb, var(--brass) 55%, transparent);
}

.option-lines {
	display: grid;
	gap: 0.55rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.option-lines li {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.1rem 0.75rem;
}

.line-label {
	grid-column: 1 / -1;
	font-size: 0.72rem;
	color: var(--ink-3);
}

.line-main {
	font-family: var(--font-mono);
	font-size: 0.92rem;
}

.line-fee {
	font-size: 0.75rem;
	color: var(--ink-2);
	align-self: center;
}

.option-foot {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 0.25rem 1rem;
	padding-top: 0.75rem;
	border-top: 1px solid var(--line);
	font-size: 0.75rem;
	color: var(--ink-3);
}

.option-foot b {
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--ink);
}

@media (max-width: 720px) {
	.plan-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.pair {
		grid-column: 1 / -1;
	}
}

@media (max-width: 440px) {
	.plan-grid {
		grid-template-columns: 1fr;
	}

	.span-2 {
		grid-column: auto;
	}
}
</style>
