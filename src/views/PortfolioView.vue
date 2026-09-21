<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createScope, createTimeline, splitText, stagger, set } from 'animejs'
import NumberField from '../components/NumberField.vue'
import TextField from '../components/TextField.vue'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import AddStockForm from '../components/portfolio/AddStockForm.vue'
import ModalDialog from '../components/ModalDialog.vue'
import FileDrop from '../components/FileDrop.vue'
import ImportConfirm from '../components/ImportConfirm.vue'
import StockCard from '../components/portfolio/StockCard.vue'
import PortfolioCharts from '../components/portfolio/PortfolioCharts.vue'
import { useStoredRef } from '../composables/useStoredRef.js'
import { summarizePortfolio, realizedSeries, sortTxs } from '../utils/portfolio.js'
import { enterUp, leaveFade, prefersReducedMotion } from '../utils/motion.js'

// 預設值用函式產生，避免陣列被共用
const emptyReport = () => ({ name: '', notes: '', updatedAt: null, seq: 1, stocks: [], txs: [] })

const [report] = useStoredRef('ledger-studio:portfolio:report', emptyReport())
const [fees] = useStoredRef('ledger-studio:fees', { discount: 100, minFee: 20 })
const [view] = useStoredRef('ledger-studio:portfolio:view', { collapsed: [] })

const safeFees = computed(() => ({
	discount: fees.value.discount > 0 ? fees.value.discount : 100,
	minFee: fees.value.minFee >= 0 ? fees.value.minFee : 20,
}))

// ── 結算 ──
const analysis = computed(() => summarizePortfolio(report.value.stocks, report.value.txs, safeFees.value))
const totals = computed(() => analysis.value.totals)
const curve = computed(() => realizedSeries(report.value.stocks, report.value.txs, safeFees.value))
const chartItems = computed(() => report.value.stocks.map((s) => ({ ...s, ...analysis.value.byStock.get(s.id) })))

const txsOf = computed(() => {
	const map = new Map(report.value.stocks.map((s) => [s.id, []]))
	for (const tx of sortTxs(report.value.txs)) map.get(tx.stockId)?.push(tx)
	return map
})

const hasStocks = computed(() => report.value.stocks.length > 0)
// 有持股但沒填現價的檔數：市值與未實現損益不含這些
const unpriced = computed(() => chartItems.value.filter((s) => s.holdingShares > 0 && !s.hasPrice).length)
const hasTrades = computed(() => totals.value.soldCost + totals.value.holdingCost > 0)
const tone = (v) => (v > 0 ? 'rise' : v < 0 ? 'fall' : '')

const updatedText = computed(() => {
	const d = new Date(report.value.updatedAt)
	const pad = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

watch(
	() => [report.value.name, report.value.notes, report.value.stocks, report.value.txs],
	() => (report.value.updatedAt = new Date().toISOString()),
	{ deep: true },
)

// ── 股票與交易 ──
const showAdd = ref(false)

function addStock(data) {
	const id = report.value.seq++
	report.value.stocks.push({ id, ...data })
	showAdd.value = false
	// 等新增視窗關閉、解除捲動鎖定後，再把新的一列捲到畫面中
	pendingReveal = id
	addTx(id, false)
}

let pendingReveal = null

function revealPending() {
	if (pendingReveal == null) return
	revealField(lastPriceInput(pendingReveal))
	pendingReveal = null
}

function removeStock(id) {
	report.value.stocks = report.value.stocks.filter((s) => s.id !== id)
	report.value.txs = report.value.txs.filter((tx) => tx.stockId !== id)
	view.value.collapsed = view.value.collapsed.filter((c) => c !== id)
}

const lastPriceInput = (stockId) => {
	const rows = root.value?.querySelectorAll(`[data-stock="${stockId}"] tbody tr`)
	return [...(rows || [])].at(-1)?.querySelector('input[aria-label="成交價格"]')
}

// 欄位不在畫面中間區域時，捲到畫面中央
let revealing = false

function revealField(input) {
	if (!input) return
	const rect = input.getBoundingClientRect()
	if (rect.top >= 120 && rect.bottom <= window.innerHeight - 120) return
	revealing = true
	window.scrollBy({ top: rect.top - window.innerHeight / 2, behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
	setTimeout(() => {
		revealing = false
		recordAnchor()
	}, 800)
}

function addTx(stockId, reveal = true) {
	const id = report.value.seq++
	const today = new Date()
	const date = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
	report.value.txs.push({ id, stockId, kind: 'buy', date, price: null, shares: null, fee: null, tax: null, note: '' })
	view.value.collapsed = view.value.collapsed.filter((c) => c !== stockId)

	// 新的一列直接聚焦在價格欄
	nextTick(() => {
		const input = lastPriceInput(stockId)
		input?.focus({ preventScroll: true })
		if (reveal) revealField(input)
	})
}

function removeTx(id) {
	report.value.txs = report.value.txs.filter((tx) => tx.id !== id)
}

// ── 收合 ──
const isCollapsed = (id) => view.value.collapsed.includes(id)
const allCollapsed = computed(() => hasStocks.value && report.value.stocks.every((s) => isCollapsed(s.id)))

function toggleCollapse(id) {
	view.value.collapsed = isCollapsed(id) ? view.value.collapsed.filter((c) => c !== id) : [...view.value.collapsed, id]
}

function toggleAll() {
	view.value.collapsed = allCollapsed.value ? [] : report.value.stocks.map((s) => s.id)
}

// ── 拖曳排序 ──
const dragId = ref(null)
const overId = ref(null)

// 只有順序真的改變時才播放移動動畫；上方區塊變高造成的位移不動畫，才不會干擾輸入中的欄位
const sorting = ref(false)
let sortingTimer = null

watch(
	() => report.value.stocks.map((s) => s.id).join(),
	() => {
		sorting.value = true
		clearTimeout(sortingTimer)
		sortingTimer = setTimeout(() => (sorting.value = false), 600)
	},
	{ flush: 'pre' },
)

function dropOn(targetId) {
	const from = dragId.value
	dragId.value = overId.value = null
	if (from == null || from === targetId) return
	// 先記下目標原本的位置再移動：往上拖放到目標前面，往下拖放到目標後面
	const list = [...report.value.stocks]
	const to = list.findIndex((s) => s.id === targetId)
	const [item] = list.splice(list.findIndex((s) => s.id === from), 1)
	list.splice(to, 0, item)
	report.value.stocks = list
}

// ── 匯入匯出 ──
const fileInput = ref(null)
const notice = ref(null)
let noticeTimer = null

function say(type, text) {
	clearTimeout(noticeTimer)
	notice.value = { type, text }
	noticeTimer = setTimeout(() => (notice.value = null), 3200)
}

function exportReport() {
	const payload = { app: 'ledger-studio', kind: 'portfolio', version: 1, exportedAt: new Date().toISOString(), ...report.value }
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
	const link = document.createElement('a')
	link.href = URL.createObjectURL(blob)
	link.download = `投資報表_${report.value.name.trim() || '未命名'}_${new Date().toISOString().slice(0, 10)}.json`
	link.click()
	setTimeout(() => URL.revokeObjectURL(link.href), 1000)
	say('ok', '已匯出 JSON 檔')
}

const num = (v) => {
	if (v === '' || v == null) return null
	const n = Number(v)
	return isFinite(n) ? n : null
}

// 接受本站匯出的格式，以及舊版 invest-tracker.html 的格式
function normalize(data) {
	if (Array.isArray(data?.stocks) && Array.isArray(data?.txs)) {
		const stocks = data.stocks.map((s) => ({
			id: Number(s.id),
			symbol: String(s.symbol || '').toUpperCase(),
			name: String(s.name || ''),
			type: s.type === 'etf' ? 'etf' : 'stock',
			price: num(s.price),
		}))
		const ids = new Set(stocks.map((s) => s.id))
		const txs = data.txs
			.filter((tx) => ids.has(Number(tx.stockId)))
			.map((tx) => ({
				id: Number(tx.id),
				stockId: Number(tx.stockId),
				kind: tx.kind === 'sell' ? 'sell' : 'buy',
				date: String(tx.date || ''),
				price: num(tx.price),
				shares: num(tx.shares),
				fee: num(tx.fee),
				tax: num(tx.tax),
				note: String(tx.note || ''),
			}))
		const seq = Math.max(0, ...stocks.map((s) => s.id), ...txs.map((tx) => tx.id)) + 1
		return { name: String(data.name || ''), notes: String(data.notes || ''), updatedAt: null, seq, stocks, txs }
	}

	if (Array.isArray(data?.stocks) && Array.isArray(data?.transactions)) {
		let seq = 1
		const idOf = new Map()
		const stocks = data.stocks.map((s) => {
			const symbol = String(s.symbol || '').toUpperCase()
			const id = seq++
			idOf.set(symbol, id)
			// 舊版沒有類型欄位，00 開頭的代號視為 ETF
			return { id, symbol, name: String(s.name || ''), type: /^00/.test(symbol) ? 'etf' : 'stock', price: null }
		})
		const txs = data.transactions
			.filter((tx) => idOf.has(String(tx.symbol || '').toUpperCase()))
			.map((tx) => {
				const kind = tx.type === 'sell' ? 'sell' : 'buy'
				// 舊版未填的費用存成 0，這裡改成留空（自動計算）
				return {
					id: seq++,
					stockId: idOf.get(String(tx.symbol).toUpperCase()),
					kind,
					date: String(tx.date || ''),
					price: num(tx.price),
					shares: num(tx.shares),
					fee: num(tx.fee) > 0 ? num(tx.fee) : null,
					tax: kind === 'sell' && num(tx.tax) > 0 ? num(tx.tax) : null,
					note: String(tx.note || ''),
				}
			})
		return { name: String(data.reportName || ''), notes: String(data.reportNotes || ''), updatedAt: null, seq, stocks, txs }
	}

	throw new Error('format')
}

// 覆蓋既有資料前需要再按一次
const confirming = ref(null)
let confirmTimer = null

function confirmTwice(action, run) {
	if (confirming.value !== action) {
		clearTimeout(confirmTimer)
		confirming.value = action
		confirmTimer = setTimeout(() => (confirming.value = null), 3000)
		return
	}
	clearTimeout(confirmTimer)
	confirming.value = null
	run()
}

function pickFile() {
	if (!hasStocks.value) return fileInput.value.click()
	confirmTwice('import', () => fileInput.value.click())
}

// 讀檔並檢查格式；信用卡記帳的檔案拖到這一頁時明確說明
async function readReport(file) {
	if (!/\.json$/i.test(file.name)) throw new Error('只能匯入 .json 檔')
	let data
	try {
		data = JSON.parse(await file.text())
	} catch {
		throw new Error('讀不到報表資料，請確認是這個工具或舊版匯出的 JSON 檔')
	}
	if (Array.isArray(data?.cards)) throw new Error('這是信用卡記帳資料，請到「信用卡記帳分析」匯入')
	try {
		return normalize(data)
	} catch {
		throw new Error('讀不到報表資料，請確認是這個工具或舊版匯出的 JSON 檔')
	}
}

function applyImport(next) {
	report.value = next
	view.value.collapsed = []
	say('ok', `已匯入 ${next.stocks.length} 檔股票、${next.txs.length} 筆交易`)
}

// 按鈕匯入：覆蓋前已經按兩次確認過
async function onFile(e) {
	const file = e.target.files[0]
	e.target.value = ''
	if (!file) return
	try {
		applyImport(await readReport(file))
	} catch (err) {
		say('error', err.message)
	}
}

// 拖放匯入：已有股票時先開確認視窗
const pendingImport = ref(null)
const statsOf = (r) => [
	{ label: '檔股票', value: r.stocks.length },
	{ label: '筆交易', value: r.txs.length },
]

async function onDropFile(file) {
	try {
		const next = await readReport(file)
		if (hasStocks.value) pendingImport.value = { next, name: file.name }
		else applyImport(next)
	} catch (err) {
		say('error', err.message)
	}
}

function confirmImport() {
	const { next } = pendingImport.value
	pendingImport.value = null
	applyImport(next)
}

function clearAll() {
	confirmTwice('clear', () => {
		report.value = emptyReport()
		view.value.collapsed = []
		showAdd.value = false
		say('ok', '已清除這份報表')
	})
}

// ── 輸入時固定游標位置 ──
// 總覽、圖表、卡片內的提示會隨輸入改變高度，把正在輸入的欄位推走。
// 記下欄位在畫面上的位置，版面高度一變就把差距捲回來；使用者自己捲動時同步更新記錄
let anchorTop = null
let layoutObserver = null

const focusedField = () => {
	const el = document.activeElement
	return root.value?.contains(el) && el.matches('input, textarea') ? el : null
}

function recordAnchor() {
	if (revealing) return
	anchorTop = focusedField()?.getBoundingClientRect().top ?? null
}

function keepAnchor() {
	const el = focusedField()
	if (!el || anchorTop == null || revealing) return
	const shift = el.getBoundingClientRect().top - anchorTop
	if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' })
}

// ── 進場動畫 ──
const root = ref(null)
let scope = null

onMounted(() => {
	root.value.addEventListener('focusin', recordAnchor)
	window.addEventListener('scroll', recordAnchor, { passive: true })
	layoutObserver = new ResizeObserver(keepAnchor)
	layoutObserver.observe(root.value)

	scope = createScope({
		root: root.value,
		mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
	}).addOnce((self) => {
		if (self.matches.reduceMotion) return

		const { chars } = splitText('.page-title', { chars: { wrap: 'clip' } })
		set(chars, { y: '110%' })
		set('.page-eyebrow, .page-lead, .side, .workspace > *', { opacity: 0 })

		createTimeline({ defaults: { ease: 'out(4)' } })
			.add('.page-eyebrow', { opacity: [0, 1], x: [-12, 0], duration: 700 }, 0)
			.add(chars, { y: '0%', duration: 900 }, stagger(45, { start: 80 }))
			.add('.page-lead', { opacity: [0, 1], y: [12, 0], duration: 800 }, 350)
			.add('.side', { opacity: [0, 1], y: [28, 0], duration: 900 }, 450)
			.add('.workspace > *', { opacity: [0, 1], y: [28, 0], duration: 900 }, stagger(90, { start: 550 }))
	})
})

onBeforeUnmount(() => {
	window.removeEventListener('scroll', recordAnchor)
	layoutObserver?.disconnect()
	clearTimeout(noticeTimer)
	clearTimeout(confirmTimer)
	clearTimeout(sortingTimer)
	scope?.revert()
})
</script>

<template>
	<main ref="root" class="container portfolio">
		<header class="page-head">
			<p class="eyebrow page-eyebrow">Tool 02 · Portfolio Returns</p>
			<h1 class="page-title">投資報酬率分析</h1>
			<p class="lead lead-balance page-lead">逐筆記下每一檔的買賣，以加權平均成本法結算已實現與未實現損益，看清楚每一檔、以及整體的投資報酬率。</p>
		</header>

		<div class="layout">
			<!-- 報表設定 -->
			<aside class="panel side">
				<header class="section-head">
					<h2 class="section-title">報表</h2>
					<span v-if="report.updatedAt" class="eyebrow">更新於 {{ updatedText }}</span>
				</header>

				<div class="side-fields">
					<TextField v-model="report.name" label="報表名稱" placeholder="例如：2026 台股" hint="匯出時會用在檔名" />
					<div class="pair">
						<NumberField v-model="fees.discount" label="手續費折扣" suffix="%" step="1" hint="6 折填 60" />
						<NumberField v-model="fees.minFee" label="最低手續費" suffix="元" step="1" hint="預設 20 元" />
					</div>
					<div class="field">
						<label for="portfolio-notes" class="field-label">備註</label>
						<textarea id="portfolio-notes" v-model="report.notes" rows="3" placeholder="投資策略、提醒事項…" />
					</div>
				</div>

				<p class="side-count">
					<span><b>{{ report.stocks.length }}</b> 檔股票</span>
					<span><b>{{ report.txs.length }}</b> 筆交易</span>
				</p>

				<div class="side-actions">
					<button type="button" class="btn btn-sm" :class="{ confirming: confirming === 'import' }" @click="pickFile">
						<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
							<path d="M7 9V2M4 5l3-3 3 3M2.5 9.5v2h9v-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
						{{ confirming === 'import' ? '會覆蓋目前資料，再按一次' : '匯入 JSON' }}
					</button>
					<button type="button" class="btn btn-sm" :disabled="!hasStocks" @click="exportReport">
						<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
							<path d="M7 2v7M4 6l3 3 3-3M2.5 9.5v2h9v-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
						匯出 JSON
					</button>
					<input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
				</div>

				<Transition :css="false" @enter="enterUp" @leave="leaveFade">
					<p v-if="notice" class="notice" :class="notice.type" role="status">{{ notice.text }}</p>
				</Transition>

				<footer class="side-foot">
					<span class="saved">
						<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
							<path d="M2.5 6.2L5 8.5L9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
						自動儲存在此瀏覽器
					</span>
					<button type="button" class="clear" :class="{ confirming: confirming === 'clear' }" @click="clearAll">
						{{ confirming === 'clear' ? '再按一次確認清除' : '清除報表' }}
					</button>
				</footer>
			</aside>

			<section class="workspace">
				<!-- 總覽 -->
				<Transition :css="false" @enter="enterUp" @leave="leaveFade">
					<section v-if="hasStocks" class="panel overview" :class="[tone(totals.total), { waiting: totals.roi == null }]">
						<div class="overview-main">
							<p class="eyebrow">Total Return · 總損益</p>
							<p class="overview-value">
								<AnimatedNumber :value="totals.roi != null ? Math.round(totals.total) : null" signed />
								<small>元</small>
							</p>
							<p v-if="!hasTrades" class="overview-sub">輸入第一筆交易的價格與股數，就會開始結算</p>
							<p v-else-if="totals.roi == null" class="overview-sub">還沒有賣出，也還沒填現價；在個股卡片填入現價就會算出未實現損益</p>
							<p v-else class="overview-sub">
								報酬率
								<b><AnimatedNumber :value="totals.roi" :decimals="2" signed /><template v-if="totals.roi != null">%</template></b>
								<span v-if="hasTrades && totals.holdingCost > 0 && !totals.hasPrice" class="overview-note">持股尚未填現價，目前只含已實現損益</span>
							</p>
						</div>
						<dl class="facts">
							<div>
								<dt>已實現損益</dt>
								<dd :class="tone(totals.realized)">
									<AnimatedNumber :value="totals.soldCost > 0 ? Math.round(totals.realized) : null" signed />
								</dd>
								<dd class="facts-sub">
									<template v-if="totals.realizedPct != null">{{ totals.realizedPct >= 0 ? '+' : '−' }}{{ Math.abs(totals.realizedPct).toFixed(2) }}%</template>
									<template v-else>尚無賣出</template>
								</dd>
							</div>
							<div>
								<dt>未實現損益</dt>
								<dd :class="tone(totals.unrealized)">
									<AnimatedNumber :value="totals.unrealized != null ? Math.round(totals.unrealized) : null" signed />
								</dd>
								<dd class="facts-sub">{{ totals.hasPrice ? '已扣預估賣出費用' : '填入現價後計算' }}</dd>
							</div>
							<div>
								<dt>持倉成本</dt>
								<dd><AnimatedNumber :value="totals.holdingCost > 0 ? Math.round(totals.holdingCost) : null" /></dd>
								<dd class="facts-sub">含買進手續費</dd>
							</div>
							<div>
								<dt>持倉市值</dt>
								<dd><AnimatedNumber :value="totals.hasPrice ? Math.round(totals.marketValue) : null" /></dd>
								<dd class="facts-sub">{{ totals.hasPrice && unpriced ? `${unpriced} 檔未填現價，不計入` : '依填入的現價' }}</dd>
							</div>
						</dl>
					</section>
				</Transition>

				<Transition :css="false" @enter="enterUp" @leave="leaveFade">
					<PortfolioCharts v-if="hasStocks" :curve="curve" :items="chartItems" />
				</Transition>

				<!-- 個股紀錄 -->
				<div class="stocks-head">
					<h2 class="section-title">個股紀錄</h2>
					<div class="stocks-actions">
						<button v-if="report.stocks.length > 1" type="button" class="btn btn-sm btn-ghost" @click="toggleAll">
							{{ allCollapsed ? '全部展開' : '全部收合' }}
						</button>
						<button v-if="hasStocks" type="button" class="btn btn-sm btn-primary" @click="showAdd = true">
							<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
							</svg>
							新增股票
						</button>
					</div>
				</div>

				<ModalDialog :open="showAdd" title="新增股票" eyebrow="New Stock · 加入後再逐筆記錄交易" @close="showAdd = false" @after-leave="revealPending">
					<AddStockForm :existing="report.stocks" @add="addStock" @cancel="showAdd = false" />
				</ModalDialog>

				<section v-if="!hasStocks" class="panel empty">
					<svg class="empty-art" viewBox="0 0 140 90" aria-hidden="true">
						<rect x="10" y="12" width="84" height="62" rx="8" class="empty-sheet" />
						<path d="M22 30H70M22 42H82M22 54H60" class="empty-rows" />
						<path d="M60 74L82 58L98 64L128 30" class="empty-line" />
						<circle cx="128" cy="30" r="4" class="empty-dot" />
					</svg>
					<p class="empty-title">建立你的第一份投資報表</p>
					<p class="lead empty-desc">新增股票後逐筆記下買進與賣出，就會自動算出已實現損益、平均成本與報酬率。也可以匯入先前匯出的 JSON。</p>
					<div class="empty-actions">
						<button type="button" class="btn btn-primary" @click="showAdd = true">新增第一檔股票</button>
						<button type="button" class="btn" @click="pickFile">匯入 JSON</button>
					</div>
				</section>

				<TransitionGroup tag="div" class="cards" :css="false" :move-class="sorting ? 'card-move' : 'card-still'" @enter="enterUp" @leave="leaveFade">
					<StockCard
						v-for="stock in report.stocks"
						:key="stock.id"
						:data-stock="stock.id"
						:stock="stock"
						:txs="txsOf.get(stock.id) || []"
						:summary="analysis.byStock.get(stock.id)"
						:fees="safeFees"
						:collapsed="isCollapsed(stock.id)"
						:dragging="dragId === stock.id"
						:drag-over="overId === stock.id && dragId !== stock.id"
						@toggle="toggleCollapse(stock.id)"
						@remove="removeStock(stock.id)"
						@add-tx="addTx(stock.id)"
						@remove-tx="removeTx"
						@dragstart="dragId = stock.id"
						@dragend="dragId = overId = null"
						@dragover="overId = stock.id"
						@drop="dropOn(stock.id)"
					/>
				</TransitionGroup>
			</section>
		</div>

		<FileDrop hint="會取代目前的投資報表，已有股票時匯入前會再確認" @file="onDropFile" @error="say('error', $event)" />
		<ImportConfirm
			:open="!!pendingImport"
			:file-name="pendingImport?.name"
			:current="statsOf(report)"
			:next="pendingImport ? statsOf(pendingImport.next) : []"
			@close="pendingImport = null"
			@confirm="confirmImport"
			@backup="exportReport"
		/>
	</main>
</template>

<style scoped>
.portfolio {
	padding-block: clamp(2.5rem, 6vw, 4.5rem) clamp(4rem, 8vw, 6rem);
}

.page-head {
	max-width: 46rem;
	margin-bottom: clamp(2rem, 4vw, 3rem);
}

.page-eyebrow {
	color: var(--brass);
}

.page-title {
	margin-top: 0.9rem;
	font-family: var(--font-serif);
	font-size: clamp(2.4rem, 5vw, 3.6rem);
	font-weight: 900;
	line-height: 1.15;
}

.page-lead {
	margin-top: 1rem;
	color: var(--ink-2);
}

.layout {
	display: grid;
	grid-template-columns: 300px minmax(0, 1fr);
	gap: 1.5rem;
	align-items: start;
}

.rise {
	--tone: var(--rise);
}

.fall {
	--tone: var(--fall);
}

dd.rise {
	color: var(--rise);
}

dd.fall {
	color: var(--fall);
}

/* ── 側欄 ── */
.side {
	position: sticky;
	top: 5.25rem;
}

.side-fields {
	display: grid;
	gap: 1rem;
}

.pair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

textarea {
	width: 100%;
	min-height: 4.5rem;
	padding: 0.65rem 0.85rem;
	border: 1px solid var(--line-strong);
	border-radius: 12px;
	outline: none;
	background: var(--sunken-bg);
	color: var(--ink);
	font: inherit;
	font-size: 0.88rem;
	line-height: 1.6;
	resize: vertical;
	transition: border-color 0.25s, box-shadow 0.25s;
}

textarea:focus {
	border-color: var(--brass);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass) 18%, transparent);
}

textarea::placeholder {
	color: var(--ink-3);
	opacity: 0.7;
}

.side-count {
	display: flex;
	gap: 1.25rem;
	margin-top: 1.1rem;
	font-size: 0.8rem;
	color: var(--ink-3);
}

.side-count b {
	margin-right: 0.25rem;
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--ink);
}

.side-actions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.5rem;
	margin-top: 0.9rem;
}

.btn-sm {
	justify-content: center;
	height: 2.35rem;
	padding-inline: 0.9rem;
	font-size: 0.8rem;
	gap: 0.4rem;
}

.btn-sm:hover svg {
	transform: none;
}

.btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.btn.confirming {
	grid-column: 1 / -1;
	order: -1;
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	background: color-mix(in srgb, var(--vermilion) 10%, transparent);
	color: var(--vermilion);
}

.btn-ghost {
	border-color: transparent;
	color: var(--ink-2);
}

.notice {
	position: absolute;
	right: 1rem;
	bottom: 3.6rem;
	left: 1rem;
	z-index: 2;
	padding: 0.55rem 0.8rem;
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	background: var(--card-bg);
	box-shadow: var(--shadow-card);
	font-size: 0.78rem;
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
}

.notice.ok {
	border-color: color-mix(in srgb, var(--fall) 45%, transparent);
	color: var(--fall);
}

.notice.error {
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	color: var(--vermilion);
}

.side-foot {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	margin-top: 1.3rem;
	padding-top: 1rem;
	border-top: 1px solid var(--line);
	font-size: 0.75rem;
	color: var(--ink-3);
}

.saved {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
}

.saved svg {
	color: var(--fall);
}

.clear {
	padding: 0.3rem 0.7rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	font-size: 0.75rem;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.3s, border-color 0.3s, background 0.3s;
}

.clear:hover {
	color: var(--ink);
	border-color: var(--line-strong);
}

.clear.confirming {
	color: var(--vermilion);
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	background: color-mix(in srgb, var(--vermilion) 10%, transparent);
}

/* ── 工作區 ── */
.workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 1.25rem;
	min-width: 0;
}

/* 總覽 */
.overview {
	--tone: var(--ink);
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 1.5rem 2.5rem;
	background:
		radial-gradient(600px 240px at 0% 0%, color-mix(in srgb, var(--brass) 14%, transparent), transparent 70%),
		var(--panel-bg);
}

.overview-value {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
	margin-top: 0.4rem;
	font-family: var(--font-display);
	font-size: clamp(2.6rem, 5.5vw, 4rem);
	line-height: 1;
	letter-spacing: -0.03em;
	color: var(--tone);
}

.overview.waiting .overview-value {
	color: var(--ink-3);
}

.overview-value small {
	font-family: var(--font-sans);
	font-size: 0.9rem;
	letter-spacing: 0;
	color: var(--ink-3);
}

.overview-sub {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.2rem 0.5rem;
	margin-top: 0.7rem;
	font-size: 0.85rem;
	color: var(--ink-2);
}

.overview-sub b {
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--tone);
}

.overview-note {
	font-size: 0.75rem;
	color: var(--ink-3);
}

.facts {
	display: grid;
	grid-template-columns: repeat(4, auto);
	gap: 1rem 2rem;
	margin: 0;
}

.facts dt {
	font-size: 0.72rem;
	color: var(--ink-3);
}

.facts dd {
	margin: 0.2rem 0 0;
	font-family: var(--font-mono);
	font-size: 1.1rem;
	white-space: nowrap;
}

.facts .facts-sub {
	margin-top: 0.1rem;
	font-family: var(--font-sans);
	font-size: 0.7rem;
	color: var(--ink-3);
}

/* 個股 */
.stocks-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	margin-top: 0.75rem;
}

.stocks-actions {
	display: flex;
	gap: 0.5rem;
}

.cards {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 0.9rem;
}

.cards:empty {
	display: none;
}

.card-move {
	transition: transform 0.45s var(--ease-out);
}

/* 空狀態 */
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-block: 3.5rem;
	text-align: center;
}

.empty-art {
	width: 9rem;
	margin-bottom: 1.25rem;
}

.empty-sheet {
	fill: none;
	stroke: var(--line-strong);
}

.empty-rows {
	stroke: var(--line-strong);
	stroke-width: 3;
	stroke-linecap: round;
}

.empty-line {
	fill: none;
	stroke: var(--brass);
	stroke-width: 2;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.empty-dot {
	fill: var(--brass);
}

.empty-title {
	font-family: var(--font-serif);
	font-size: 1.25rem;
	font-weight: 600;
}

.empty-desc {
	max-width: 30rem;
	margin-top: 0.5rem;
	font-size: 0.88rem;
	color: var(--ink-2);
}

.empty-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0.6rem;
	margin-top: 1.5rem;
}

@media (max-width: 1100px) {
	.facts {
		grid-template-columns: repeat(2, auto);
	}
}

@media (max-width: 960px) {
	.layout {
		grid-template-columns: minmax(0, 1fr);
	}

	/* 單欄時先看總覽與個股，報表設定（名稱、費率、匯入匯出）移到最後 */
	.side {
		position: relative;
		top: 0;
		order: 1;
	}
}

@media (max-width: 520px) {
	.facts {
		width: 100%;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
