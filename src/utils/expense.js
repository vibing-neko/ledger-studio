// 信用卡帳單週期與分期的計算。月份一律用 'YYYY-MM' 字串，日期用 'YYYY-MM-DD'

export const DEFAULT_CATEGORIES = ['餐飲', '交通', '購物', '娛樂', '居家', '醫療', '訂閱', '旅遊', '其他']

// 卡片標記色（定義在 base.css，深淺色各一套）；卡片存的是索引
export const CARD_COLORS = Array.from({ length: 8 }, (_, i) => `var(--card-${i + 1})`)

const pad = (n) => String(n).padStart(2, '0')
const daysIn = (y, m) => new Date(y, m, 0).getDate()

export const monthKey = (y, m) => `${y}-${pad(m)}`

export function parseMonth(key) {
	const [y, m] = key.split('-').map(Number)
	return { y, m }
}

export function shiftMonth(key, n) {
	const { y, m } = parseMonth(key)
	const t = y * 12 + (m - 1) + n
	return monthKey(Math.floor(t / 12), (t % 12) + 1)
}

export function todayISO() {
	const d = new Date()
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const currentMonth = () => todayISO().slice(0, 7)

// 某個月實際的結帳日：結帳日大於當月天數時以月底為準
export function closingDateOf(key, closingDay) {
	const { y, m } = parseMonth(key)
	return Math.min(closingDay, daysIn(y, m))
}

// 消費日自動歸屬的帳單：當月結帳日（含）以前算當月帳單，之後算下個月
export function billMonthOf(dateISO, closingDay) {
	const key = dateISO.slice(0, 7)
	return Number(dateISO.slice(8, 10)) <= closingDateOf(key, closingDay) ? key : shiftMonth(key, 1)
}

// 帳單涵蓋的消費日：上個月結帳日隔天 ～ 本月結帳日
export function periodOf(key, closingDay) {
	const prev = shiftMonth(key, -1)
	const { y, m } = parseMonth(prev)
	const startDay = closingDateOf(prev, closingDay) + 1
	return {
		start: startDay > daysIn(y, m) ? `${key}-01` : `${prev}-${pad(startDay)}`,
		end: `${key}-${pad(closingDateOf(key, closingDay))}`,
	}
}

// 繳款截止日：結帳日之後第一個繳款日
export function dueDateOf(key, closingDay, dueDay) {
	const { y, m } = parseMonth(key)
	const sameMonth = Math.min(dueDay, daysIn(y, m))
	if (sameMonth > closingDateOf(key, closingDay)) return `${key}-${pad(sameMonth)}`
	const next = shiftMonth(key, 1)
	const n = parseMonth(next)
	return `${next}-${pad(Math.min(dueDay, daysIn(n.y, n.m)))}`
}

// 一筆消費拆成各期入帳：從歸屬的帳單（加上手動延後的期數）開始，每期一筆；
// 金額除不盡時餘數放在第一期（負數金額同樣適用）
export function postingsOf(tx, card) {
	if (!tx.date || !card) return []
	const count = Math.max(1, Math.floor(tx.installments || 1))
	const amount = Math.round(tx.amount || 0)
	const base = Math.trunc(amount / count)
	const start = shiftMonth(billMonthOf(tx.date, card.closingDay), tx.shift || 0)
	return Array.from({ length: count }, (_, i) => ({
		tx,
		card,
		month: shiftMonth(start, i),
		amount: i === 0 ? amount - base * (count - 1) : base,
		index: i + 1,
		count,
	}))
}

// 'YYYY-MM-DD' → '9/5'
export const shortDate = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

// 某期帳單的結帳日（'YYYY-MM-DD'）
export const closingISO = (key, closingDay) => `${key}-${String(closingDateOf(key, closingDay)).padStart(2, '0')}`

// 兩個日期相差幾天（b − a，只看日期不看時間）
export function daysBetween(a, b) {
	const toDate = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
	return Math.round((toDate(b) - toDate(a)) / 86400000)
}
