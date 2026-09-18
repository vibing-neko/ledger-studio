import { brokerFee, transactionTax } from './fees.js'

// 交易照日期排序（同日期依 id），加權平均成本法需要時間順序
export function sortTxs(txs) {
	return [...txs].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id)
}

export const isValidTx = (tx) => tx.price > 0 && tx.shares > 0

// 單筆交易的金額。手續費與證交稅留空就依費率自動算，填了就以填的為準（對帳用）。
// shares 可只計入部分股數（賣超時只算得到的那部分）
export function txCosts(tx, stock, fees, shares = tx.shares) {
	const ratio = tx.shares > 0 ? shares / tx.shares : 0
	const gross = (tx.price || 0) * shares
	const fee = gross > 0 ? (tx.fee == null ? brokerFee(gross, fees.discount, fees.minFee) : Math.round(tx.fee * ratio)) : 0
	const tax = tx.kind === 'sell' && gross > 0 ? (tx.tax == null ? transactionTax(gross, stock.type) : Math.round(tx.tax * ratio)) : 0
	return { gross, fee, tax, total: tx.kind === 'buy' ? gross + fee : gross - fee - tax }
}

// 單一股票的結算
export function summarizeStock(stock, txs, fees) {
	let holdingShares = 0
	let holdingCost = 0
	let buyCost = 0
	let sellRevenue = 0
	let soldCost = 0
	let realized = 0
	let oversold = false

	for (const tx of sortTxs(txs)) {
		if (!isValidTx(tx)) continue

		if (tx.kind === 'buy') {
			const { total } = txCosts(tx, stock, fees)
			holdingShares += tx.shares
			holdingCost += total
			buyCost += total
			continue
		}

		// 賣出股數超過當時持股時，超出的部分不計入
		const shares = Math.min(tx.shares, holdingShares)
		if (shares < tx.shares) oversold = true
		if (shares <= 0) continue

		const { total } = txCosts(tx, stock, fees, shares)
		const costOut = (holdingCost / holdingShares) * shares
		holdingShares -= shares
		holdingCost -= costOut
		sellRevenue += total
		soldCost += costOut
		realized += total - costOut
	}

	const hasPrice = stock.price > 0 && holdingShares > 0
	const marketValue = hasPrice ? stock.price * holdingShares : 0
	const sellFee = hasPrice ? brokerFee(marketValue, fees.discount, fees.minFee) : 0
	const sellTax = hasPrice ? transactionTax(marketValue, stock.type) : 0
	const unrealized = hasPrice ? marketValue - sellFee - sellTax - holdingCost : null

	const base = soldCost + holdingCost
	const total = realized + (unrealized ?? 0)

	return {
		id: stock.id,
		buyCost,
		sellRevenue,
		soldCost,
		realized,
		realizedPct: soldCost > 0 ? (realized / soldCost) * 100 : null,
		holdingShares,
		holdingCost,
		avgCost: holdingShares > 0 ? holdingCost / holdingShares : null,
		hasPrice,
		marketValue,
		sellFee,
		sellTax,
		unrealized,
		unrealizedPct: hasPrice && holdingCost > 0 ? (unrealized / holdingCost) * 100 : null,
		total,
		// 只有買進、沒有賣出也沒填現價時，損益還無從算起，報酬率留空而不是 0%
		roi: base > 0 && (soldCost > 0 || hasPrice) ? (total / base) * 100 : null,
		oversold,
	}
}

// 整份報表的結算
export function summarizePortfolio(stocks, txs, fees) {
	const byStock = new Map()
	for (const stock of stocks) {
		byStock.set(
			stock.id,
			summarizeStock(stock, txs.filter((tx) => tx.stockId === stock.id), fees),
		)
	}

	const list = [...byStock.values()]
	const sum = (key) => list.reduce((acc, s) => acc + (s[key] || 0), 0)
	const soldCost = sum('soldCost')
	const holdingCost = sum('holdingCost')
	const realized = sum('realized')
	const unrealized = list.reduce((acc, s) => acc + (s.unrealized || 0), 0)
	const hasPrice = list.some((s) => s.hasPrice)
	const base = soldCost + holdingCost

	return {
		byStock,
		totals: {
			realized,
			realizedPct: soldCost > 0 ? (realized / soldCost) * 100 : null,
			unrealized: hasPrice ? unrealized : null,
			holdingCost,
			marketValue: sum('marketValue'),
			soldCost,
			buyCost: sum('buyCost'),
			sellRevenue: sum('sellRevenue'),
			total: realized + unrealized,
			roi: base > 0 && (soldCost > 0 || hasPrice) ? ((realized + unrealized) / base) * 100 : null,
			hasPrice,
		},
	}
}

// 累計已實現損益曲線：依日期累加每一筆賣出的已實現損益
export function realizedSeries(stocks, txs, fees) {
	const stockById = new Map(stocks.map((s) => [s.id, s]))
	const state = new Map(stocks.map((s) => [s.id, { shares: 0, cost: 0 }]))
	const points = []
	let cumulative = 0

	for (const tx of sortTxs(txs)) {
		const stock = stockById.get(tx.stockId)
		const holding = state.get(tx.stockId)
		if (!stock || !holding || !isValidTx(tx)) continue

		if (tx.kind === 'buy') {
			const { total } = txCosts(tx, stock, fees)
			holding.shares += tx.shares
			holding.cost += total
			continue
		}

		const shares = Math.min(tx.shares, holding.shares)
		if (shares <= 0) continue
		const { total } = txCosts(tx, stock, fees, shares)
		const costOut = (holding.cost / holding.shares) * shares
		holding.shares -= shares
		holding.cost -= costOut
		cumulative += total - costOut
		points.push({ date: tx.date, value: cumulative, symbol: stock.symbol })
	}

	return points
}
