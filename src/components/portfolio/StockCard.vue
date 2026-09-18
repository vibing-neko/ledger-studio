<script>
import { ref as sharedRef } from 'vue'

// 全頁共用：同一時間只開一個刪除確認列，值為 'stock-<id>' 或 'tx-<id>'
const openConfirm = sharedRef(null)
// 確認列的倒數計時器，同樣全頁只有一個
let countdown = null
</script>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { animate, createTimer } from 'animejs'
import { brokerFee, transactionTax } from '../../utils/fees.js'
import { txCosts } from '../../utils/portfolio.js'
import { fmtNumber, lotsText } from '../../utils/format.js'
import { prefersReducedMotion } from '../../utils/motion.js'
import DateField from '../DateField.vue'

const props = defineProps({
	stock: { type: Object, required: true },
	txs: { type: Array, required: true },
	summary: { type: Object, required: true },
	fees: { type: Object, required: true },
	collapsed: { type: Boolean, default: false },
	dragging: { type: Boolean, default: false },
	dragOver: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle', 'remove', 'add-tx', 'remove-tx', 'dragstart', 'dragend', 'dragover', 'drop'])

const tone = (v) => (v > 0 ? 'rise' : v < 0 ? 'fall' : '')
const signed = (v, decimals = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNumber(Math.abs(v), decimals)

// 名稱欄依內容伸縮：用輸入框當下的字型量出文字實際寬度，最短約 4 個字寬，最長 10 個字寬
const nameInput = ref(null)
const fontsLoaded = ref(0)
const onFontsLoaded = () => fontsLoaded.value++
let measureCtx = null

const nameWidth = computed(() => {
	fontsLoaded.value // 網頁字型載入後重新量
	const el = nameInput.value
	if (!el) return 'calc(4em + 0.7rem + 2px)'
	const style = getComputedStyle(el)
	measureCtx ??= document.createElement('canvas').getContext('2d')
	measureCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
	const em = parseFloat(style.fontSize)
	// 文字寬度只多留 1px 給游標，再加上實際的左右內距與框線，左右留白才會對稱
	const text = measureCtx.measureText(props.stock.name || '').width + 1
	const box = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, key) => sum + parseFloat(style[key]), 0)
	return `${(Math.min(10 * em, Math.max(4 * em, text)) + box).toFixed(1)}px`
})

onMounted(() => {
	document.fonts?.addEventListener('loadingdone', onFontsLoaded)
	document.fonts?.ready.then(onFontsLoaded)
})

// 數字欄位：清空存成 null（代表未填／自動計算）
function setNum(target, key, e) {
	const v = e.target.value
	target[key] = v === '' ? null : Number(v)
}

// 手續費、證交稅留空時的自動金額，當作 placeholder 提示
function autoFee(tx) {
	const gross = (tx.price || 0) * (tx.shares || 0)
	return gross > 0 ? fmtNumber(brokerFee(gross, props.fees.discount, props.fees.minFee)) : '自動'
}

function autoTax(tx) {
	const gross = (tx.price || 0) * (tx.shares || 0)
	return gross > 0 ? fmtNumber(transactionTax(gross, props.stock.type)) : '自動'
}

function amount(tx) {
	if (!(tx.price > 0 && tx.shares > 0)) return '—'
	return fmtNumber(txCosts(tx, props.stock, props.fees).total)
}

const root = ref(null)

// 刪除股票與交易：按 × 後浮出確認列，不佔版面，明確選「刪除」或「取消」。
// 開新的確認列時，其他卡片已開的會自動收起
const confirmStock = computed(() => openConfirm.value === `stock-${props.stock.id}`)
const confirmTx = computed(() => {
	const key = openConfirm.value
	return key?.startsWith('tx-') && props.txs.some((tx) => `tx-${tx.id}` === key) ? Number(key.slice(3)) : null
})

// 確認列開著 3 秒沒有動作就自動收起，滑鼠移上去時暫停
const CONFIRM_MS = 3000

function stopCountdown() {
	countdown?.cancel()
	countdown = null
}

// 確認列關閉時若焦點在它裡面，把焦點還給當初按的 × 按鈕，鍵盤操作才不會迷路
function returnFocus(key) {
	const trigger = key.startsWith('stock-')
		? root.value?.querySelector('.remove')
		: root.value?.querySelector(`tr[data-tx="${key.slice(3)}"] .row-del`)
	const box = trigger?.parentElement.querySelector('.del-confirm')
	if (box?.contains(document.activeElement)) trigger.focus({ preventScroll: true })
}

function ask(key, selector) {
	stopCountdown()
	openConfirm.value = key
	nextTick(() => {
		const box = root.value?.querySelector(selector)
		box?.querySelector('.del-no')?.focus({ preventScroll: true })
		countdown = createTimer({
			duration: CONFIRM_MS,
			onComplete: () => {
				countdown = null
				if (openConfirm.value !== key) return
				returnFocus(key)
				openConfirm.value = null
			},
		})
	})
}

const pauseCountdown = () => countdown?.pause()
const resumeCountdown = () => countdown?.resume()

const askStock = () => ask(`stock-${props.stock.id}`, '.stock-confirm')
const askTx = (id) => ask(`tx-${id}`, 'tbody .del-confirm')

function cancelConfirm() {
	stopCountdown()
	if (openConfirm.value) returnFocus(openConfirm.value)
	openConfirm.value = null
}

function removeStock() {
	cancelConfirm()
	emit('remove')
}

function removeTx(id) {
	cancelConfirm()
	emit('remove-tx', id)
}

function popIn(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], x: [12, 0], duration: 260, ease: 'out(3)', onComplete: done })
}

function popOut(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, x: 8, duration: 160, ease: 'in(2)', onComplete: done })
}

// 現價欄依內容伸縮（等寬字，以 ch 計），最短約「678.9」的 5 個字寬，最長 8 個字寬
const priceWidth = (v) => `calc(${Math.min(8, Math.max(5, String(v ?? '').length)) + 0.5}ch + 0.6rem)`

function onDragStart(e) {
	e.dataTransfer.effectAllowed = 'move'
	e.dataTransfer.setData('text/plain', String(props.stock.id))
	e.dataTransfer.setDragImage(e.currentTarget.closest('.stock-card'), 24, 24)
	emit('dragstart')
}

// 日期是在日曆上選定（或打字後按 Enter／離開欄位）才寫入，寫入後立刻依日期重新排序。
// 若這一列因此換了位置，短暫亮起底色，並在它跑出畫面時捲過去
function setDate(tx, iso) {
	const before = props.txs.map((t) => t.id).join()
	tx.date = iso
	nextTick(() => {
		if (props.txs.map((t) => t.id).join() === before) return
		const row = root.value?.querySelector(`tr[data-tx="${tx.id}"]`)
		if (!row) return
		row.classList.remove('moved')
		void row.offsetWidth
		row.classList.add('moved')
		setTimeout(() => row.classList.remove('moved'), 1800)
		// 等移動動畫結束再判斷是否在畫面內
		setTimeout(() => {
			const r = row.getBoundingClientRect()
			if (r.top < 90 || r.bottom > window.innerHeight - 40) {
				row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
			}
		}, 480)
	})
}

// 交易因日期改變而換順序時才播放移動動畫，版面位移不動畫
const sorting = ref(false)
let sortingTimer = null

watch(
	() => props.txs.map((tx) => tx.id).join(),
	() => {
		sorting.value = true
		clearTimeout(sortingTimer)
		sortingTimer = setTimeout(() => (sorting.value = false), 600)
	},
	{ flush: 'pre' },
)

// ── 展開收合與列的進出場 ──
function expand(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, {
		height: [0, el.scrollHeight],
		opacity: [0, 1],
		duration: 420,
		ease: 'out(3)',
		onComplete: () => {
			el.style.removeProperty('height')
			el.style.removeProperty('opacity')
			done()
		},
	})
}

function shrink(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { height: [el.scrollHeight, 0], opacity: 0, duration: 300, ease: 'inOut(2)', onComplete: done })
}

function rowEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, {
		opacity: [0, 1],
		x: [-10, 0],
		duration: 450,
		ease: 'out(3)',
		onComplete: () => {
			el.style.removeProperty('opacity')
			el.style.removeProperty('transform')
			done()
		},
	})
}

function rowLeave(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, x: 12, duration: 220, ease: 'in(2)', onComplete: done })
}

onBeforeUnmount(() => {
	// 離開頁面或卡片被刪除時，不要留下這張卡片開著的確認狀態
	if (confirmStock.value || confirmTx.value != null) cancelConfirm()
	document.fonts?.removeEventListener('loadingdone', onFontsLoaded)
	clearTimeout(sortingTimer)
})
</script>

<template>
	<article
		ref="root"
		class="stock-card"
		:class="{ dragging, 'drag-over': dragOver }"
		@dragover.prevent="emit('dragover')"
		@drop.prevent="emit('drop')"
	>
		<header class="stock-head">
			<span class="handle" draggable="true" title="拖曳排序" @dragstart="onDragStart" @dragend="emit('dragend')">
				<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
					<circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" />
					<circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" />
					<circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" />
				</svg>
			</span>

			<button
				type="button"
				class="chevron"
				:class="{ closed: collapsed }"
				:aria-expanded="!collapsed"
				:aria-label="collapsed ? '展開交易紀錄' : '收合交易紀錄'"
				@click="emit('toggle')"
			>
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
					<path d="M2.5 4.5L6 8L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>

			<div class="ident">
				<span class="symbol">{{ stock.symbol }}</span>
				<input
					v-model="stock.name"
					ref="nameInput"
					class="name"
					type="text"
					placeholder="名稱"
					aria-label="股票名稱"
					:style="{ width: nameWidth }"
				/>
				<button
					type="button"
					class="type-tag"
					:class="stock.type"
					:title="`點一下切換類型（賣出證交稅 ${stock.type === 'etf' ? '0.1%' : '0.3%'}）`"
					@click="stock.type = stock.type === 'etf' ? 'stock' : 'etf'"
				>
					{{ stock.type === 'etf' ? 'ETF' : '個股' }}
				</button>
			</div>

			<dl class="stats">
				<div>
					<dt>持股</dt>
					<dd>{{ summary.holdingShares > 0 ? fmtNumber(summary.holdingShares) : '—' }}</dd>
				</div>
				<div>
					<dt>平均成本</dt>
					<dd>{{ summary.avgCost != null ? fmtNumber(summary.avgCost, 2) : '—' }}</dd>
				</div>
				<div>
					<dt>已實現</dt>
					<dd :class="tone(summary.realized)">{{ summary.soldCost > 0 ? signed(Math.round(summary.realized)) : '—' }}</dd>
				</div>
				<div>
					<dt>報酬率</dt>
					<dd :class="tone(summary.roi)">{{ summary.roi != null ? signed(summary.roi, 2) + '%' : '—' }}</dd>
				</div>
			</dl>

			<label class="price">
				<span>現價</span>
				<input
					type="number"
					inputmode="decimal"
					min="0"
					step="0.01"
					placeholder="—"
					:value="stock.price ?? ''"
					:style="{ width: priceWidth(stock.price) }"
					@input="setNum(stock, 'price', $event)"
				/>
			</label>

			<div class="remove-wrap">
				<button
					type="button"
					class="remove"
					:class="{ active: confirmStock }"
					:aria-label="confirmStock ? '取消刪除' : `刪除 ${stock.symbol}`"
					:title="confirmStock ? '取消' : '刪除這檔股票'"
					@click="confirmStock ? cancelConfirm() : askStock()"
				>
					<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
						<path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</button>
				<Transition :css="false" @enter="popIn" @leave="popOut">
					<div
						v-if="confirmStock"
						class="del-confirm stock-confirm"
						role="group"
						:aria-label="`確認刪除 ${stock.symbol}`"
						@keydown.esc="cancelConfirm"
						@mouseenter="pauseCountdown"
						@mouseleave="resumeCountdown"
					>
						<span>刪除 {{ stock.symbol }}{{ txs.length ? ` 及 ${txs.length} 筆交易` : '' }}？</span>
						<button type="button" class="del-yes" @click="removeStock">刪除</button>
						<button type="button" class="del-no" @click="cancelConfirm">取消</button>
					</div>
				</Transition>
			</div>
		</header>

		<Transition :css="false" @enter="expand" @leave="shrink">
			<div v-show="!collapsed" class="stock-body">
				<p v-if="summary.oversold" class="warn">有賣出股數超過當時的持股，超出的部分沒有計入損益。</p>
				<p v-if="summary.holdingShares > 0 && !(stock.price > 0)" class="hint-line">
					持有 {{ lotsText(summary.holdingShares) }}，填入現價就能算出未實現損益。
				</p>

				<div v-if="txs.length" class="tx-wrap">
					<table class="tx">
						<colgroup>
							<col style="width: 9%" />
							<col style="width: 17%" />
							<col style="width: 11%" />
							<col style="width: 10%" />
							<col style="width: 10%" />
							<col style="width: 10%" />
							<col style="width: 13%" />
							<col style="width: 15%" />
							<col style="width: 5%" />
						</colgroup>
						<thead>
							<tr>
								<th>類型</th>
								<th>日期</th>
								<th class="num">價格</th>
								<th class="num">股數</th>
								<th class="num">手續費</th>
								<th class="num">證交稅</th>
								<th class="num">金額</th>
								<th>備註</th>
								<th><span class="sr-only">刪除</span></th>
							</tr>
						</thead>
						<TransitionGroup tag="tbody" :css="false" :move-class="sorting ? 'row-move' : 'row-still'" @enter="rowEnter" @leave="rowLeave">
							<tr v-for="tx in txs" :key="tx.id" :data-tx="tx.id" :class="{ confirming: confirmTx === tx.id }">
								<td>
									<button
										type="button"
										class="kind"
										:class="tx.kind"
										title="點一下切換買進／賣出"
										@click="tx.kind = tx.kind === 'buy' ? 'sell' : 'buy'"
									>
										{{ tx.kind === 'buy' ? '買進' : '賣出' }}
									</button>
								</td>
								<td>
									<DateField :model-value="tx.date" label="日期" variant="cell" @update:model-value="setDate(tx, $event)" />
								</td>
								<td class="num">
									<input
										type="number"
										class="cell"
										inputmode="decimal"
										min="0"
										step="0.01"
										placeholder="0.00"
										aria-label="成交價格"
										:value="tx.price ?? ''"
										@input="setNum(tx, 'price', $event)"
									/>
								</td>
								<td class="num">
									<input
										type="number"
										class="cell"
										inputmode="numeric"
										min="0"
										step="1"
										placeholder="0"
										aria-label="股數"
										:value="tx.shares ?? ''"
										@input="setNum(tx, 'shares', $event)"
									/>
								</td>
								<td class="num">
									<input
										type="number"
										class="cell"
										inputmode="numeric"
										min="0"
										step="1"
										aria-label="手續費，留空自動計算"
										:placeholder="autoFee(tx)"
										:value="tx.fee ?? ''"
										@input="setNum(tx, 'fee', $event)"
									/>
								</td>
								<td class="num">
									<input
										v-if="tx.kind === 'sell'"
										type="number"
										class="cell"
										inputmode="numeric"
										min="0"
										step="1"
										aria-label="證交稅，留空自動計算"
										:placeholder="autoTax(tx)"
										:value="tx.tax ?? ''"
										@input="setNum(tx, 'tax', $event)"
									/>
									<span v-else class="na">—</span>
								</td>
								<td class="num amount" :class="tx.kind">{{ amount(tx) }}</td>
								<td><input v-model="tx.note" type="text" class="cell" placeholder="備註" aria-label="備註" /></td>
								<td class="del-cell">
									<button
										type="button"
										class="row-del"
										:class="{ active: confirmTx === tx.id }"
										:aria-label="confirmTx === tx.id ? '取消刪除' : '刪除這筆交易'"
										:title="confirmTx === tx.id ? '取消' : '刪除'"
										@click="confirmTx === tx.id ? cancelConfirm() : askTx(tx.id)"
									>
										<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
											<path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
										</svg>
									</button>
									<Transition :css="false" @enter="popIn" @leave="popOut">
										<div
											v-if="confirmTx === tx.id"
											class="del-confirm"
											role="group"
											aria-label="確認刪除交易"
											@keydown.esc="cancelConfirm"
											@mouseenter="pauseCountdown"
											@mouseleave="resumeCountdown"
										>
											<span>刪除這筆交易？</span>
											<button type="button" class="del-yes" @click="removeTx(tx.id)">刪除</button>
											<button type="button" class="del-no" @click="cancelConfirm">取消</button>
										</div>
									</Transition>
								</td>
							</tr>
						</TransitionGroup>
					</table>
				</div>
				<p v-else class="tx-empty">還沒有交易紀錄，按下方按鈕新增第一筆。</p>

				<button type="button" class="add-tx" @click="emit('add-tx')">
					<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
						<path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
					新增 {{ stock.symbol }} 交易
				</button>
			</div>
		</Transition>
	</article>
</template>

<style scoped>
.stock-card {
	position: relative;
	border: 1px solid var(--line-strong);
	border-radius: 20px;
	background: var(--panel-bg);
	transition: border-color 0.3s, box-shadow 0.3s, opacity 0.3s;
}

.stock-card.dragging {
	opacity: 0.4;
}

.stock-card.drag-over {
	border-color: var(--brass);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass) 18%, transparent);
}

/* ── 標題列 ── */
.stock-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.6rem 1rem;
	padding: 0.85rem 1rem 0.85rem 0.75rem;
}

.handle {
	display: grid;
	place-items: center;
	width: 1.4rem;
	height: 2rem;
	border-radius: 6px;
	color: var(--ink-3);
	cursor: grab;
	transition: color 0.2s, background 0.2s;
}

.handle svg {
	fill: currentColor;
}

.handle:hover {
	color: var(--ink);
	background: color-mix(in srgb, var(--ink) 6%, transparent);
}

.handle:active {
	cursor: grabbing;
}

.chevron {
	display: grid;
	place-items: center;
	width: 1.9rem;
	height: 1.9rem;
	margin-left: -0.5rem;
	border: 0;
	border-radius: 50%;
	background: none;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, background 0.2s;
}

.chevron:hover {
	color: var(--ink);
	background: color-mix(in srgb, var(--ink) 6%, transparent);
}

.chevron svg {
	transition: transform 0.35s var(--ease-out);
}

.chevron.closed svg {
	transform: rotate(-90deg);
}

.ident {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
	flex: 1 1 14rem;
}

.symbol {
	font-family: var(--font-mono);
	font-size: 1rem;
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--brass);
}

.name {
	flex: none;
	min-width: 0;
	padding: 0.2rem 0.35rem;
	border: 1px solid transparent;
	border-radius: 8px;
	outline: none;
	background: transparent;
	color: var(--ink);
	font-family: var(--font-serif);
	font-size: 1.05rem;
	font-weight: 600;
	transition: border-color 0.2s, background 0.2s;
}

.name:hover {
	border-color: var(--line);
}

.name:focus {
	border-color: var(--brass);
	background: var(--sunken-bg);
}

.name::placeholder {
	color: var(--ink-3);
	font-weight: 400;
}

/* 固定尺寸，「個股」與「ETF」切換時大小一致 */
.type-tag {
	flex-shrink: 0;
	display: inline-grid;
	place-items: center;
	width: 2.9rem;
	height: 1.4rem;
	padding: 0;
	line-height: 1;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: none;
	font-size: 0.7rem;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.type-tag:hover {
	border-color: var(--ink-3);
	color: var(--ink);
}

.type-tag.etf {
	border-color: color-mix(in srgb, var(--sky) 45%, transparent);
	background: color-mix(in srgb, var(--sky) 10%, transparent);
	color: var(--sky);
}

.stats {
	display: flex;
	gap: 0.3rem 1.4rem;
	margin: 0;
}

.stats > div {
	text-align: right;
}

.stats dt {
	font-size: 0.68rem;
	color: var(--ink-3);
}

.stats dd {
	margin: 0;
	font-family: var(--font-mono);
	font-size: 0.85rem;
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}

.rise {
	color: var(--rise);
}

.fall {
	color: var(--fall);
}

.price {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	height: 2.2rem;
	padding-left: 0.7rem;
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	background: var(--sunken-bg);
	font-size: 0.72rem;
	color: var(--ink-3);
	transition: border-color 0.2s, box-shadow 0.2s;
}

.price:focus-within {
	border-color: var(--brass);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass) 18%, transparent);
}

.price input {
	height: 100%;
	padding: 0 0.6rem 0 0;
	border: 0;
	outline: none;
	background: transparent;
	color: var(--ink);
	font-family: var(--font-mono);
	font-size: 0.88rem;
	text-align: right;
	appearance: textfield;
	-moz-appearance: textfield;
}

.price input::-webkit-inner-spin-button,
.price input::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

/* 確認列用絕對定位浮在按鈕左側，按鈕本身尺寸固定，同一列的其他元素不會被推動 */
.remove-wrap {
	position: relative;
}

.remove {
	display: grid;
	place-items: center;
	width: 2rem;
	height: 2rem;
	padding: 0;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	font-size: 0.72rem;
	color: var(--ink-3);
	white-space: nowrap;
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.remove:hover {
	color: var(--vermilion);
	border-color: color-mix(in srgb, var(--vermilion) 35%, transparent);
}

.remove.active {
	color: var(--vermilion);
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	background: color-mix(in srgb, var(--vermilion) 10%, transparent);
}

/* ── 內容 ── */
.stock-body {
	overflow: hidden;
	border-top: 1px solid var(--line);
}

.warn,
.hint-line {
	margin: 0.75rem 1rem 0;
	padding: 0.5rem 0.75rem;
	border-radius: 10px;
	font-size: 0.76rem;
}

.warn {
	background: color-mix(in srgb, var(--vermilion) 10%, transparent);
	color: var(--vermilion);
}

.hint-line {
	background: color-mix(in srgb, var(--ink) 5%, transparent);
	color: var(--ink-3);
}

.tx-wrap {
	position: relative;
	overflow-x: auto;
	padding: 0.35rem 0.5rem 0;
}

.tx {
	width: 100%;
	min-width: 800px;
	table-layout: fixed;
	border-collapse: collapse;
	font-size: 0.85rem;
}

/* th 的左右 padding（0.7rem）= td（0.3rem）+ input（0.4rem），表頭與數值才會對齊 */
.tx th {
	padding: 0.6rem 0.7rem;
	border-bottom: 1px solid var(--line);
	font-size: 0.72rem;
	font-weight: 400;
	color: var(--ink-3);
	text-align: left;
	white-space: nowrap;
}

.tx td {
	padding: 0.3rem 0.3rem;
	border-bottom: 1px solid var(--line);
	vertical-align: middle;
}

.tx tbody tr:last-child td {
	border-bottom: 0;
}

.tx .num {
	text-align: right;
}

.tx tbody tr {
	transition: background 0.2s;
}

.tx tbody tr:hover {
	background: color-mix(in srgb, var(--ink) 3%, transparent);
}

.tx tbody tr.confirming {
	background: color-mix(in srgb, var(--vermilion) 8%, transparent);
}

/* 改日期後換了位置的列：底色亮起再淡出 */
.tx tbody tr.moved {
	animation: row-moved 1.8s var(--ease-out);
}

@keyframes row-moved {
	0%,
	35% {
		background: color-mix(in srgb, var(--brass) 20%, transparent);
	}

	100% {
		background: transparent;
	}
}

.row-move {
	transition: transform 0.45s var(--ease-out);
}

.cell {
	width: 100%;
	height: 2.1rem;
	padding: 0 0.4rem;
	border: 1px solid transparent;
	border-radius: 8px;
	outline: none;
	background: transparent;
	color: var(--ink);
	font-family: var(--font-mono);
	font-size: 0.84rem;
	font-variant-numeric: tabular-nums;
	transition: border-color 0.2s, background 0.2s;
	appearance: textfield;
	-moz-appearance: textfield;
}

.cell::-webkit-inner-spin-button,
.cell::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.cell[type="text"] {
	font-family: var(--font-sans);
}

.num .cell {
	text-align: right;
}

.cell:hover {
	border-color: var(--line);
}

.cell:focus {
	border-color: var(--brass);
	background: var(--sunken-bg);
}

.cell::placeholder {
	color: var(--ink-3);
	opacity: 0.75;
}

.kind {
	margin-left: 0.4rem;
	padding: 0.15rem 0.55rem;
	border: 0;
	border-radius: 6px;
	font-size: 0.75rem;
	cursor: pointer;
	transition: filter 0.2s;
}

.kind:hover {
	filter: brightness(1.15);
}

/* 台灣習慣：買進紅、賣出綠 */
.kind.buy {
	background: color-mix(in srgb, var(--rise) 14%, transparent);
	color: var(--rise);
}

.kind.sell {
	background: color-mix(in srgb, var(--fall) 14%, transparent);
	color: var(--fall);
}

.na {
	padding-right: 0.4rem;
	color: var(--ink-3);
}

.amount {
	padding-right: 0.7rem !important;
	font-family: var(--font-mono);
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.row-del {
	display: grid;
	place-items: center;
	width: 1.8rem;
	height: 1.8rem;
	margin-inline: auto;
	border: 0;
	border-radius: 50%;
	background: none;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.2s, background 0.2s;
}

.row-del:hover,
.row-del.active {
	color: var(--vermilion);
	background: color-mix(in srgb, var(--vermilion) 12%, transparent);
}

/* 刪除確認：浮在該列右側，蓋住備註欄 */
.del-cell {
	position: relative;
}

.del-confirm {
	position: absolute;
	inset-block: 0;
	right: calc(100% + 0.1rem);
	z-index: 2;
	display: flex;
	align-items: center;
	gap: 0.35rem;
	height: 2.3rem;
	margin-block: auto;
	padding: 0 0.3rem 0 0.85rem;
	border: 1px solid color-mix(in srgb, var(--vermilion) 40%, transparent);
	border-radius: 999px;
	/* 疊在頁面底色上變成不透明，下面的數字才不會透出來 */
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-card);
	font-size: 0.78rem;
	color: var(--ink-2);
	white-space: nowrap;
}

.stock-confirm {
	right: calc(100% + 0.35rem);
	z-index: 3;
}

.del-yes,
.del-no {
	height: 1.7rem;
	padding: 0 0.75rem;
	border: 1px solid transparent;
	border-radius: 999px;
	font-size: 0.76rem;
	cursor: pointer;
	transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.del-yes {
	margin-left: 0.2rem;
	background: var(--vermilion);
	color: var(--on-brass);
}

.del-yes:hover {
	background: color-mix(in srgb, var(--vermilion) 85%, var(--ink));
}

.del-no {
	border-color: var(--line-strong);
	background: none;
	color: var(--ink-2);
}

.del-no:hover {
	border-color: var(--ink-3);
	color: var(--ink);
}

.tx-empty {
	padding: 1.5rem 1rem 0.5rem;
	font-size: 0.82rem;
	color: var(--ink-3);
	text-align: center;
}

.add-tx {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	width: calc(100% - 1rem);
	margin: 0.5rem;
	padding: 0.6rem;
	border: 1px dashed var(--line-strong);
	border-radius: 12px;
	background: none;
	font-size: 0.8rem;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.add-tx:hover {
	border-color: var(--brass);
	background: color-mix(in srgb, var(--brass) 7%, transparent);
	color: var(--brass);
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
}

@media (max-width: 760px) {
	/* 標題列換行後把刪除鈕推到最右邊，確認列往左展開才放得下 */
	.remove-wrap {
		margin-left: auto;
	}

	.stats {
		order: 5;
		width: 100%;
		justify-content: space-between;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
	}

	.stats > div {
		text-align: left;
	}
}
</style>
