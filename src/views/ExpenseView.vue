<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createScope, createTimeline, splitText, stagger, set, animate } from 'animejs'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import TabPane from '../components/TabPane.vue'
import FileDrop from '../components/FileDrop.vue'
import ImportConfirm from '../components/ImportConfirm.vue'
import CardManager from '../components/expense/CardManager.vue'
import CategoryManager from '../components/expense/CategoryManager.vue'
import EntryForm from '../components/expense/EntryForm.vue'
import ExpenseTable from '../components/expense/ExpenseTable.vue'
import BillOverview from '../components/expense/BillOverview.vue'
import CategoryDonut from '../components/expense/CategoryDonut.vue'
import SpendPace from '../components/expense/SpendPace.vue'
import MonthlyTrend from '../components/expense/MonthlyTrend.vue'
import InstallmentTracker from '../components/expense/InstallmentTracker.vue'
import { useStoredRef } from '../composables/useStoredRef.js'
import {
	DEFAULT_CATEGORIES,
	CARD_COLORS,
	todayISO,
	billMonthOf,
	shiftMonth,
	parseMonth,
	periodOf,
	dueDateOf,
	closingISO,
	daysBetween,
	postingsOf,
	shortDate,
} from '../utils/expense.js'
import { fmtNumber } from '../utils/format.js'
import { enterUp, leaveFade, prefersReducedMotion, skipLeave } from '../utils/motion.js'

// 預設值用函式產生，避免陣列被共用；分類 id 1–9，其餘項目從 10 開始編號
const emptyBook = () => ({
	updatedAt: null,
	seq: 10,
	cards: [],
	categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: i + 1, name })),
	txs: [],
	// 已繳款的帳單，key 是 `卡片 id:YYYY-MM`
	paid: {},
})

const [book] = useStoredRef('ledger-studio:expense:book', emptyBook())
const [view] = useStoredRef('ledger-studio:expense:view', { tab: 'ledger', card: 'all', lastCardId: null, lastCategoryId: null })

// 記帳／分析兩個分頁，記住上次停在哪一頁（同交易試算）
const tabs = [
	{ value: 'ledger', label: '記帳' },
	{ value: 'analysis', label: '分析' },
]

watch(
	() => [book.value.cards, book.value.categories, book.value.txs, book.value.paid],
	() => (book.value.updatedAt = new Date().toISOString()),
	{ deep: true },
)

// ── 目前檢視的帳單月份與卡片篩選 ──
const cardById = computed(() => new Map(book.value.cards.map((c) => [c.id, c])))

// 「本期」：今天刷卡會記進的那一期，以最近使用的卡片為準（各卡結帳日不同）。
// 月份不存檔，每次打開都從本期開始
function openMonth() {
	const card = cardById.value.get(view.value.lastCardId) || book.value.cards[0]
	return billMonthOf(todayISO(), card?.closingDay ?? 31)
}

const month = ref(openMonth())
const monthTitle = computed(() => {
	const { y, m } = parseMonth(month.value)
	return `${y} 年 ${m} 月帳單`
})

const hasCards = computed(() => book.value.cards.length > 0)
const colorOf = (card) => CARD_COLORS[card.color % CARD_COLORS.length]

// 篩選的卡片被刪掉時回到全部
watch(cardById, (map) => {
	if (view.value.card !== 'all' && !map.has(view.value.card)) view.value.card = 'all'
})

const cardOptions = computed(() => [
	{ value: 'all', label: '全部卡片' },
	...book.value.cards.map((c) => ({ value: c.id, label: c.name })),
])
// 下拉選單用的選項：卡片帶色塊與末四碼，分類帶使用筆數
const cardChoices = computed(() => book.value.cards.map((c) => ({ value: c.id, label: c.name, color: colorOf(c), meta: c.last4 })))
const categoryChoices = computed(() =>
	book.value.categories.map((c) => {
		const count = book.value.txs.filter((tx) => tx.categoryId === c.id).length
		return { value: c.id, label: c.name, meta: count ? `${count} 筆` : '' }
	}),
)

const inFilter = (cardId) => view.value.card === 'all' || view.value.card === cardId
const shownCards = computed(() => book.value.cards.filter((c) => inFilter(c.id)))

const slideDir = ref(1)

function goMonth(delta) {
	slideDir.value = delta >= 0 ? 1 : -1
	month.value = shiftMonth(month.value, delta)
}

function goTo(key) {
	slideDir.value = key >= month.value ? 1 : -1
	month.value = key
}

function titleEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], x: [slideDir.value * 18, 0], duration: 380, ease: 'out(3)', onComplete: done })
}

function titleLeave(el, done) {
	if (prefersReducedMotion()) return skipLeave(done)
	animate(el, { opacity: 0, x: slideDir.value * -12, duration: 160, ease: 'in(2)', onComplete: done })
}

// ── 本期入帳 ──
const allPostings = computed(() => book.value.txs.flatMap((tx) => postingsOf(tx, cardById.value.get(tx.cardId))))
const shownPostings = computed(() => allPostings.value.filter((p) => inFilter(p.card.id)))
const monthPostings = computed(() => shownPostings.value.filter((p) => p.month === month.value))

// 表格列出「從本期開始入帳」的消費，新的在上面
const monthTxs = computed(() =>
	monthPostings.value
		.filter((p) => p.index === 1)
		.map((p) => p.tx)
		.sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)),
)

// 先前的分期消費在本期入帳的部分
const carried = computed(() =>
	monthPostings.value.filter((p) => p.index > 1).sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1)),
)

const monthTotal = computed(() => monthPostings.value.reduce((sum, p) => sum + p.amount, 0))
const categoryName = (id) => book.value.categories.find((c) => c.id === id)?.name ?? '—'

const paidKey = (cardId, key) => `${cardId}:${key}`
const isPaid = (cardId, key) => !!book.value.paid[paidKey(cardId, key)]

function togglePaid(cardId) {
	const key = paidKey(cardId, month.value)
	const next = { ...book.value.paid }
	if (next[key]) delete next[key]
	else next[key] = true
	book.value.paid = next
}

// 每張卡這一期的帳單：金額、狀態、繳款倒數、額度使用率
const bills = computed(() => {
	const today = todayISO()
	return shownCards.value.map((card) => {
		const { start, end } = periodOf(month.value, card.closingDay)
		const closing = closingISO(month.value, card.closingDay)
		const due = dueDateOf(month.value, card.closingDay, card.dueDay)
		const total = monthPostings.value.filter((p) => p.card.id === card.id).reduce((sum, p) => sum + p.amount, 0)
		// 結帳日當天仍在累積，隔天才算已出帳
		const closed = daysBetween(closing, today) > 0
		// 狀態：未出帳 → 無需繳款（金額 ≤ 0）／已繳／已過繳款日（沒標記也不當成漏繳，多數人設自動扣繳）／待繳
		let status = 'due'
		if (!closed) status = 'open'
		else if (total <= 0) status = 'none'
		else if (isPaid(card.id, month.value)) status = 'paid'
		else if (daysBetween(due, today) > 0) status = 'past'

		// 未繳金額：繳款日還沒過、也沒標記已繳的各期（含目前還在累積的那一期）
		const openKey = billMonthOf(today, card.closingDay)
		const used = allPostings.value
			.filter((p) => {
				if (p.card.id !== card.id || p.month > openKey || isPaid(card.id, p.month)) return false
				return daysBetween(dueDateOf(p.month, card.closingDay, card.dueDay), today) <= 0
			})
			.reduce((sum, p) => sum + p.amount, 0)

		return {
			card,
			color: colorOf(card),
			total,
			range: `${shortDate(start)} – ${shortDate(end)}`,
			closing: shortDate(closing),
			due: shortDate(due),
			status,
			days: daysBetween(today, due),
			used: Math.max(0, used),
			limit: card.limit,
			pct: card.limit ? Math.min(100, Math.max(0, (used / card.limit) * 100)) : 0,
		}
	})
})

// ── 卡片、分類 ──
const cardManager = ref(null)

function addCard(data) {
	const first = !hasCards.value
	book.value.cards.push({ id: book.value.seq++, ...data })
	if (!book.value.txs.length) month.value = openMonth()
	// 第一張卡加入後，原本的「新增第一張卡」按鈕消失了，焦點直接放到記一筆的項目欄
	if (first) nextTick(() => root.value?.querySelector('.entry-title input')?.focus({ preventScroll: true }))
}

function updateCard(id, data) {
	Object.assign(cardById.value.get(id), data)
}

function removeCard(id) {
	book.value.cards = book.value.cards.filter((c) => c.id !== id)
	book.value.txs = book.value.txs.filter((tx) => tx.cardId !== id)
	book.value.paid = Object.fromEntries(Object.entries(book.value.paid).filter(([key]) => !key.startsWith(`${id}:`)))
}

function addCategory(name) {
	book.value.categories.push({ id: book.value.seq++, name })
}

function removeCategory(id) {
	book.value.categories = book.value.categories.filter((c) => c.id !== id)
}

// ── 消費 ──
const notice = ref(null)
let noticeTimer = null

function say(where, type, text, action = null) {
	clearTimeout(noticeTimer)
	notice.value = { where, type, text, action }
	noticeTimer = setTimeout(() => (notice.value = null), action ? 5000 : 3200)
}

// 新增或修改後，若那筆消費不在目前的畫面上，提示它去了哪一期，並提供前往的按鈕
function reportPlacement(tx, verb) {
	const first = postingsOf(tx, cardById.value.get(tx.cardId))[0]
	if (!first) return
	const label = `${parseMonth(first.month).y === parseMonth(month.value).y ? '' : `${parseMonth(first.month).y} 年 `}${parseMonth(first.month).m} 月帳單`
	if (first.month !== month.value) {
		say('entry', 'ok', `${verb} ${label}`, { label: '前往', run: () => goTo(first.month) })
	} else if (!inFilter(tx.cardId)) {
		say('entry', 'ok', `${verb} ${first.card.name}，目前只顯示其他卡片`, { label: '顯示全部', run: () => (view.value.card = 'all') })
	}
}

function addTx(data) {
	const tx = { id: book.value.seq++, ...data, shift: 0, note: '' }
	book.value.txs.push(tx)
	view.value.lastCardId = data.cardId
	view.value.lastCategoryId = data.categoryId
	reportPlacement(tx, '已記到')
}

function removeTx(id) {
	book.value.txs = book.value.txs.filter((tx) => tx.id !== id)
}

// ── 匯入匯出 ──
const fileInput = ref(null)

function exportBook() {
	const payload = { app: 'ledger-studio', kind: 'expense', version: 1, exportedAt: new Date().toISOString(), ...book.value }
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
	const link = document.createElement('a')
	link.href = URL.createObjectURL(blob)
	link.download = `信用卡記帳_${new Date().toISOString().slice(0, 10)}.json`
	link.click()
	setTimeout(() => URL.revokeObjectURL(link.href), 1000)
	say('data', 'ok', '已匯出 JSON 檔')
}

const num = (v) => {
	if (v === '' || v == null) return null
	const n = Number(v)
	return isFinite(n) ? n : null
}
const day = (v) => (Number.isInteger(num(v)) && v >= 1 && v <= 31 ? Number(v) : null)

function normalize(data) {
	if (!Array.isArray(data?.cards) || !Array.isArray(data?.txs)) throw new Error('format')

	const cards = data.cards
		.map((c, i) => ({
			id: Number(c.id),
			name: String(c.name || '未命名卡片'),
			last4: /^\d{4}$/.test(c.last4) ? c.last4 : '',
			closingDay: day(c.closingDay),
			dueDay: day(c.dueDay),
			limit: num(c.limit) > 0 ? num(c.limit) : null,
			color: Number.isInteger(c.color) ? c.color : i,
		}))
		.filter((c) => Number.isInteger(c.id) && c.closingDay && c.dueDay)

	const categories = Array.isArray(data.categories) && data.categories.length
		? data.categories.map((c) => ({ id: Number(c.id), name: String(c.name || '未命名') })).filter((c) => Number.isInteger(c.id))
		: emptyBook().categories
	const catIds = new Set(categories.map((c) => c.id))
	const cardIds = new Set(cards.map((c) => c.id))

	const txs = data.txs
		.filter((tx) => cardIds.has(Number(tx.cardId)))
		.map((tx) => {
			const installments = Math.floor(num(tx.installments) || 1)
			return {
				id: Number(tx.id),
				cardId: Number(tx.cardId),
				date: /^\d{4}-\d{2}-\d{2}$/.test(tx.date) ? tx.date : '',
				categoryId: catIds.has(Number(tx.categoryId)) ? Number(tx.categoryId) : categories[0].id,
				title: String(tx.title || ''),
				amount: num(tx.amount) != null ? Math.round(num(tx.amount)) : null,
				installments: installments >= 1 && installments <= 60 ? installments : 1,
				shift: tx.shift ? 1 : 0,
				note: String(tx.note || ''),
			}
		})
		.filter((tx) => Number.isInteger(tx.id) && tx.date)

	const cardIdSet = new Set(cards.map((c) => c.id))
	const paid = {}
	for (const [key, value] of Object.entries(data.paid || {})) {
		const [cardId, month] = key.split(':')
		if (value && cardIdSet.has(Number(cardId)) && /^\d{4}-\d{2}$/.test(month || '')) paid[key] = true
	}

	const seq = Math.max(9, ...cards.map((c) => c.id), ...categories.map((c) => c.id), ...txs.map((tx) => tx.id)) + 1
	return { updatedAt: null, seq, cards, categories, txs, paid }
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

const hasData = computed(() => hasCards.value || book.value.txs.length > 0)

function pickFile() {
	if (!hasData.value) return fileInput.value.click()
	confirmTwice('import', () => fileInput.value.click())
}

// 讀檔並檢查格式；投資報表拖到這一頁時明確說明
async function readBook(file) {
	if (!/\.json$/i.test(file.name)) throw new Error('只能匯入 .json 檔')
	let data
	try {
		data = JSON.parse(await file.text())
	} catch {
		throw new Error('讀不到記帳資料，請確認是這個工具匯出的 JSON 檔')
	}
	if (Array.isArray(data?.stocks)) throw new Error('這是投資報表，請到「投資報酬率分析」匯入')
	try {
		return normalize(data)
	} catch {
		throw new Error('讀不到記帳資料，請確認是這個工具匯出的 JSON 檔')
	}
}

function applyImport(next, where) {
	book.value = next
	view.value.card = 'all'
	month.value = openMonth()
	say(where, 'ok', `已匯入 ${next.cards.length} 張卡片、${next.txs.length} 筆消費`)
}

// 按鈕匯入：覆蓋前已經按兩次確認過
async function onFile(e) {
	const file = e.target.files[0]
	e.target.value = ''
	if (!file) return
	try {
		applyImport(await readBook(file), 'data')
	} catch (err) {
		say('data', 'error', err.message)
	}
}

// 拖放匯入：有資料時先開確認視窗；提示用固定在畫面底部的那一個，捲到哪裡都看得到
const pendingImport = ref(null)
const statsOf = (b) => [
	{ label: '張卡片', value: b.cards.length },
	{ label: '筆消費', value: b.txs.length },
]

async function onDropFile(file) {
	try {
		const next = await readBook(file)
		if (hasData.value) pendingImport.value = { next, name: file.name }
		else applyImport(next, 'entry')
	} catch (err) {
		say('entry', 'error', err.message)
	}
}

function confirmImport() {
	const { next } = pendingImport.value
	pendingImport.value = null
	applyImport(next, 'entry')
}

function clearAll() {
	confirmTwice('clear', () => {
		book.value = emptyBook()
		view.value = { tab: view.value.tab, card: 'all', lastCardId: null, lastCategoryId: null }
		month.value = openMonth()
		say('data', 'ok', '已清除記帳資料')
	})
}

// ── 進場動畫 ──
const root = ref(null)
let scope = null

onMounted(() => {
	scope = createScope({
		root: root.value,
		mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
	}).addOnce((self) => {
		if (self.matches.reduceMotion) return

		const { chars } = splitText('.page-title', { chars: { wrap: 'clip' } })
		set(chars, { y: '110%' })
		set('.page-eyebrow, .page-lead, .workspace > *', { opacity: 0 })

		createTimeline({ defaults: { ease: 'out(4)' } })
			.add('.page-eyebrow', { opacity: [0, 1], x: [-12, 0], duration: 700 }, 0)
			.add(chars, { y: '0%', duration: 900 }, stagger(45, { start: 80 }))
			.add('.page-lead', { opacity: [0, 1], y: [12, 0], duration: 800 }, 350)
			.add('.workspace > *', { opacity: [0, 1], y: [28, 0], duration: 900 }, stagger(90, { start: 450 }))
	})
})

onBeforeUnmount(() => {
	clearTimeout(noticeTimer)
	clearTimeout(confirmTimer)
	scope?.revert()
})
</script>

<template>
	<main ref="root" class="container expense">
		<header class="page-head">
			<p class="eyebrow page-eyebrow">Tool 03 · Card Expenses</p>
			<h1 class="page-title">信用卡記帳分析</h1>
			<p class="lead lead-balance page-lead">逐筆記下每張卡的消費，依各卡的結帳日自動歸到對應的帳單，分期也會逐期攤進之後的帳單。</p>
		</header>

		<div class="layout">

			<section class="workspace">
				<!-- 還沒有卡片 -->
				<section v-if="!hasCards" class="panel empty">
					<svg class="empty-art" viewBox="0 0 140 90" aria-hidden="true">
						<rect x="14" y="16" width="86" height="56" rx="9" class="empty-card" transform="rotate(-6 57 44)" />
						<rect x="38" y="22" width="86" height="56" rx="9" class="empty-card front" />
						<path d="M38 36h86" class="empty-stripe" />
						<path d="M50 62h24" class="empty-rows" />
					</svg>
					<p class="empty-title">先新增一張信用卡</p>
					<p class="lead empty-desc">設定卡片的結帳日與繳款日後，每筆消費就會自動歸到對應的帳單週期，分期也會逐期攤進之後的帳單。</p>
					<button type="button" class="btn btn-primary" @click="cardManager.startAdd()">新增第一張卡</button>
				</section>

				<template v-else>
					<!-- 帳單月份 -->
					<section class="panel month-bar">
						<div class="month-nav">
							<button type="button" class="month-step" aria-label="上一期帳單" @click="goMonth(-1)">
								<svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
									<path d="M7.5 2.5L4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</button>
							<div class="month-title-wrap" aria-live="polite">
								<Transition mode="out-in" :css="false" @enter="titleEnter" @leave="titleLeave">
									<h2 :key="month" class="month-title">{{ monthTitle }}</h2>
								</Transition>
							</div>
							<button type="button" class="month-step" aria-label="下一期帳單" @click="goMonth(1)">
								<svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
									<path d="M4.5 2.5L8 6 4.5 9.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</button>
							<button v-if="month !== openMonth()" type="button" class="today-btn" @click="goTo(openMonth())">回到本期</button>
						</div>

						<div class="month-total">
							<span class="eyebrow">本期入帳</span>
							<p class="month-sum">
								<small>NT$</small>
								<AnimatedNumber :value="monthTotal" />
							</p>
							<span class="month-count">{{ monthTxs.length }} 筆消費<template v-if="carried.length"> · {{ carried.length }} 筆分期</template></span>
						</div>

						<div v-if="book.cards.length > 1" class="month-foot">
							<SegmentedControl v-model="view.card" :options="cardOptions" label="篩選卡片" />
						</div>
					</section>

					<!-- 記帳／分析分頁；分析跟著上方的帳單月份與卡片篩選。
					     KeepAlive 裡不要放註解：開發模式會保留註解，被當成多個子節點，切回記帳時會整頁空白 -->
					<SegmentedControl v-model="view.tab" :options="tabs" label="檢視內容" size="lg" class="tabs" />

					<Transition mode="out-in" :css="false" @enter="enterUp" @leave="leaveFade">
						<KeepAlive>
							<TabPane v-if="view.tab === 'ledger'" key="ledger">
								<BillOverview :bills="bills" @toggle-paid="togglePaid" @edit="cardManager.startEdit($event)" />

								<!-- 記一筆 -->
								<div class="entry-wrap">
									<EntryForm
										:cards="book.cards"
										:categories="book.categories"
										:last-card-id="view.lastCardId"
										:last-category-id="view.lastCategoryId"
										:card-choices="cardChoices"
										:category-choices="categoryChoices"
										@add="addTx"
									/>
								</div>

								<!-- 消費明細 -->
								<section class="panel detail">
									<header class="section-head">
										<h2 class="section-title">消費明細</h2>
										<span class="eyebrow">點「入帳」可延後一期</span>
									</header>
									<ExpenseTable
										v-if="monthTxs.length"
										:txs="monthTxs"
										:cards="book.cards"
										:card-choices="cardChoices"
										:category-choices="categoryChoices"
										@remove="removeTx"
										@changed="reportPlacement($event, '已移到')"
									/>
									<p v-else class="detail-empty">這一期還沒有消費紀錄。在上方「記一筆」輸入，會依消費日自動歸到對應的帳單。</p>
								</section>

								<!-- 分期入帳 -->
								<section v-if="carried.length" class="panel carried">
									<header class="section-head">
										<h2 class="section-title">本期分期入帳</h2>
										<span class="eyebrow">先前的分期消費，要回原本那一期修改</span>
									</header>
									<ul class="carried-list">
										<li v-for="p in carried" :key="`${p.tx.id}-${p.index}`" :style="{ '--card': colorOf(p.card) }">
											<span class="carried-card">{{ p.card.name }}</span>
											<span class="carried-title">{{ p.tx.title || categoryName(p.tx.categoryId) }}</span>
											<span class="carried-meta">{{ shortDate(p.tx.date) }} 消費 · 第 {{ p.index }}/{{ p.count }} 期</span>
											<span class="carried-amount" :class="{ refund: p.amount < 0 }">{{ fmtNumber(p.amount) }}</span>
											<button type="button" class="carried-go" @click="goTo(postingsOf(p.tx, p.card)[0].month)">查看原消費</button>
										</li>
									</ul>
								</section>
							</TabPane>
							<TabPane v-else key="analysis" class="analysis-grid">
								<CategoryDonut :postings="shownPostings" :categories="book.categories" :month="month" />
								<SpendPace :postings="shownPostings" :cards="shownCards" :month="month" />
								<MonthlyTrend class="wide" :postings="shownPostings" :month="month" @go="goTo" />
								<InstallmentTracker class="wide" :postings="shownPostings" :categories="book.categories" :month="month" />
							</TabPane>
						</KeepAlive>
					</Transition>
				</template>
			</section>

			<!-- 卡片、分類與資料：設定好就很少動，放在明細之後 -->
			<section class="settings">
				<header class="settings-head">
					<h2 class="section-title">卡片與設定</h2>
				</header>
				<div class="settings-grid">
					<CardManager ref="cardManager" :cards="book.cards" :txs="book.txs" @add="addCard" @update="updateCard" @remove="removeCard" />
					<CategoryManager :categories="book.categories" :txs="book.txs" @add="addCategory" @remove="removeCategory" />

					<section class="panel data">
						<p class="data-count">
							<span><b>{{ book.cards.length }}</b> 張卡片</span>
							<span><b>{{ book.txs.length }}</b> 筆消費</span>
						</p>
						<div class="data-actions">
							<button type="button" class="btn btn-sm" :class="{ confirming: confirming === 'import' }" @click="pickFile">
								<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
									<path d="M7 9V2M4 5l3-3 3 3M2.5 9.5v2h9v-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
								{{ confirming === 'import' ? '會覆蓋目前資料，再按一次' : '匯入 JSON' }}
							</button>
							<button type="button" class="btn btn-sm" :disabled="!hasData" @click="exportBook">
								<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
									<path d="M7 2v7M4 6l3 3 3-3M2.5 9.5v2h9v-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
								匯出 JSON
							</button>
							<input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
						</div>

						<Transition :css="false" @enter="enterUp" @leave="leaveFade">
							<p v-if="notice?.where === 'data'" class="notice" :class="notice.type" role="status">{{ notice.text }}</p>
						</Transition>

						<footer class="data-foot">
							<span class="saved">
								<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
									<path d="M2.5 6.2L5 8.5L9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
								自動儲存在此瀏覽器
							</span>
							<button type="button" class="clear" :class="{ confirming: confirming === 'clear' }" @click="clearAll">
								{{ confirming === 'clear' ? '再按一次確認清除' : '清除資料' }}
							</button>
						</footer>
					</section>
				</div>
			</section>
		</div>
		<!-- 記下、修改、拖放匯入的提示：放在分頁外，切到分析分頁也看得到；掛到 body，頁面進場後留下的 transform 才不會影響 fixed 定位 -->
		<Teleport to="body">
			<Transition :css="false" @enter="enterUp" @leave="leaveFade">
				<p v-if="notice?.where === 'entry'" class="notice entry-notice" :class="notice.type" role="status">
					{{ notice.text }}
					<button v-if="notice.action" type="button" class="notice-action" @click="notice.action.run(); notice = null">
						{{ notice.action.label }}
					</button>
				</p>
			</Transition>
		</Teleport>

		<FileDrop hint="會取代目前的記帳資料，已有資料時匯入前會再確認" @file="onDropFile" @error="say('entry', 'error', $event)" />
		<ImportConfirm
			:open="!!pendingImport"
			:file-name="pendingImport?.name"
			:current="statsOf(book)"
			:next="pendingImport ? statsOf(pendingImport.next) : []"
			@close="pendingImport = null"
			@confirm="confirmImport"
			@backup="exportBook"
		/>
	</main>
</template>

<style scoped>
.expense {
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
	grid-template-columns: minmax(0, 1fr);
	gap: 1.25rem;
}

/* ── 分頁 ── */
.tabs {
	justify-self: start;
}

/* ── 分析 ── */
.tab-pane.analysis-grid {
	grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
	align-items: stretch;
}

.analysis-grid > * {
	min-width: 0;
}

.analysis-grid > .wide {
	grid-column: 1 / -1;
}

/* ── 卡片與設定 ── */
.settings {
	margin-top: 1.5rem;
	padding-top: 1.75rem;
	border-top: 1px solid var(--line);
}

.settings-head {
	margin-bottom: 1rem;
}

.settings-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1rem;
	align-items: start;
}

.data {
	position: relative;
}

.data-count {
	display: flex;
	gap: 1.25rem;
	font-size: 0.8rem;
	color: var(--ink-3);
}

.data-count b {
	margin-right: 0.25rem;
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--ink);
}

.data-actions {
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

.notice {
	position: absolute;
	right: 1rem;
	bottom: 3.6rem;
	left: 1rem;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.55rem 0.8rem;
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-card);
	font-size: 0.78rem;
}

.notice.ok {
	border-color: color-mix(in srgb, var(--fall) 45%, transparent);
	color: var(--fall);
}

.notice.error {
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	color: var(--vermilion);
}

.notice-action {
	flex-shrink: 0;
	padding: 0.2rem 0.7rem;
	border: 1px solid currentColor;
	border-radius: 999px;
	background: none;
	font-size: 0.75rem;
	color: inherit;
	cursor: pointer;
}

.data-foot {
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

/* 帳單月份 */
.month-bar {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 1rem 2rem;
	align-items: center;
	background:
		radial-gradient(600px 240px at 0% 0%, color-mix(in srgb, var(--brass) 12%, transparent), transparent 70%),
		var(--panel-bg);
}

.month-nav {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.month-step {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 2.2rem;
	height: 2.2rem;
	border: 1px solid var(--line-strong);
	border-radius: 50%;
	background: none;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.month-step:hover {
	border-color: var(--brass);
	color: var(--brass);
	background: color-mix(in srgb, var(--brass) 8%, transparent);
}

.month-title-wrap {
	min-width: 11.5rem;
	overflow: hidden;
	text-align: center;
}

.month-title {
	font-family: var(--font-serif);
	font-size: clamp(1.3rem, 2.4vw, 1.6rem);
	font-weight: 600;
	white-space: nowrap;
}

.today-btn {
	margin-left: 0.25rem;
	padding: 0.25rem 0.75rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: none;
	font-size: 0.75rem;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s;
}

.today-btn:hover {
	border-color: var(--ink-3);
	color: var(--ink);
}

.month-total {
	grid-row: span 2;
	text-align: right;
}

.month-sum {
	display: flex;
	align-items: baseline;
	justify-content: flex-end;
	gap: 0.4rem;
	margin-top: 0.2rem;
	font-family: var(--font-display);
	font-size: clamp(2.2rem, 4.5vw, 3.2rem);
	line-height: 1;
	letter-spacing: -0.03em;
}

.month-sum small {
	font-family: var(--font-mono);
	font-size: 0.8rem;
	letter-spacing: 0.05em;
	color: var(--brass);
}

.month-count {
	display: block;
	margin-top: 0.45rem;
	font-size: 0.78rem;
	color: var(--ink-3);
}

.month-foot {
	min-width: 0;
	overflow-x: auto;
	scrollbar-width: none;
}

/* 記一筆 */
.entry-wrap {
	position: relative;
}

/* 記下或修改後的提示固定在畫面底部，從明細表格改日期、延後時也看得到。
   置中用 translate 屬性，不會和進場動畫寫入的 transform 互相覆蓋 */
.entry-notice {
	position: fixed;
	right: auto;
	bottom: calc(1.5rem + env(safe-area-inset-bottom));
	left: 50%;
	z-index: 60;
	width: max-content;
	max-width: calc(100vw - 2rem);
	translate: -50% 0;
	padding: 0.65rem 0.9rem;
	font-size: 0.82rem;
	box-shadow: var(--shadow-lift);
}

/* 明細 */
.detail-empty {
	padding: 1.5rem 1rem;
	font-size: 0.85rem;
	color: var(--ink-3);
	text-align: center;
}

.carried-list {
	display: grid;
	margin: 0;
	padding: 0;
	list-style: none;
}

.carried-list li {
	display: grid;
	grid-template-columns: 7rem minmax(0, 1fr) auto 6rem auto;
	align-items: center;
	gap: 1rem;
	padding: 0.55rem 0.4rem;
	border-top: 1px solid var(--line);
	font-size: 0.85rem;
}

.carried-list li:first-child {
	border-top: 0;
}

.carried-card {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	overflow: hidden;
	color: var(--ink-2);
	white-space: nowrap;
	text-overflow: ellipsis;
}

.carried-card::before {
	content: "";
	flex-shrink: 0;
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 2px;
	background: var(--card);
}

.carried-title {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.carried-meta {
	font-size: 0.75rem;
	color: var(--ink-3);
}

.carried-amount {
	font-family: var(--font-mono);
	text-align: right;
	font-variant-numeric: tabular-nums;
}

.carried-amount.refund {
	color: var(--fall);
}

.carried-go {
	padding: 0.2rem 0.65rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: none;
	font-size: 0.72rem;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s;
}

.carried-go:hover {
	border-color: var(--brass);
	color: var(--brass);
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

.empty-card {
	fill: none;
	stroke: var(--line-strong);
	stroke-width: 1.5;
}

.empty-card.front {
	fill: color-mix(in srgb, var(--brass) 10%, transparent);
	stroke: var(--brass);
}

.empty-stripe {
	stroke: var(--brass);
	stroke-width: 6;
	opacity: 0.5;
}

.empty-rows {
	stroke: var(--brass);
	stroke-width: 3;
	stroke-linecap: round;
}

.empty-title {
	font-family: var(--font-serif);
	font-size: 1.25rem;
	font-weight: 600;
}

.empty-desc {
	max-width: 30rem;
	margin: 0.5rem 0 1.5rem;
	font-size: 0.88rem;
	color: var(--ink-2);
}

@media (max-width: 960px) {
	.tab-pane.analysis-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.settings-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 480px) {
	.tabs {
		justify-self: stretch;
		display: flex;
	}

	.tabs :deep(.seg-btn) {
		flex: 1;
	}
}

@media (max-width: 640px) {
	.settings-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.month-bar {
		grid-template-columns: minmax(0, 1fr);
	}

	.month-total {
		grid-row: auto;
		text-align: left;
	}

	.month-sum {
		justify-content: flex-start;
	}

	.month-title-wrap {
		min-width: 0;
		flex: 1;
	}

	.carried-list li {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.2rem 0.75rem;
	}

	.carried-meta {
		grid-column: 1;
	}

	.carried-go {
		display: none;
	}
}
</style>
