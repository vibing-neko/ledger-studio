// 投資報酬率分析的算式檢查：拿手算的結果對照 portfolio.js
// 用法：node scripts/verify-portfolio.mjs
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { summarizeStock, summarizePortfolio, realizedSeries } = await import(
	pathToFileURL(join(here, '../src/utils/portfolio.js')).href
)

const fees = { discount: 100, minFee: 20 }
const ok = (name, got, want, tol = 1e-6) => {
	const pass = Math.abs(got - want) <= tol
	console.log(`${pass ? '✓' : '✗'} ${name}: ${got} ${pass ? '' : `(應為 ${want})`}`)
}

// 1. 手算對照：買 1000 @100、賣 500 @110，折扣 100%（不打折）
const stock = { id: 1, symbol: '2330', type: 'stock', price: 110 }
const txs = [
	{ id: 1, stockId: 1, kind: 'buy', date: '2026-01-05', price: 100, shares: 1000, fee: null, tax: null },
	{ id: 2, stockId: 1, kind: 'sell', date: '2026-02-10', price: 110, shares: 500, fee: null, tax: null },
]
const s = summarizeStock(stock, txs, fees)
ok('買進成本（含手續費 143）', s.buyCost, 100143)
ok('平均成本', s.avgCost, 100.143)
ok('已實現損益', s.realized, 54757 - 50071.5)
ok('持倉成本', s.holdingCost, 50071.5)
ok('未實現損益（現價 110）', s.unrealized, 55000 - 78 - 165 - 50071.5)
ok('報酬率 %', s.roi, ((s.realized + s.unrealized) / (s.soldCost + s.holdingCost)) * 100)

// 2. 賣超：只計入當時持股
const over = summarizeStock(stock, [
	txs[0],
	{ id: 3, stockId: 1, kind: 'sell', date: '2026-02-10', price: 110, shares: 2500, fee: null, tax: null },
], fees)
console.log(`${over.oversold ? '✓' : '✗'} 賣超有標記，持倉歸零: ${over.holdingShares}`)
ok('賣超只算 1000 股', over.realized, 110000 - Math.round(110000 * 0.001425) - Math.floor(110000 * 0.003) - 100143)

// 3. 手動填的手續費與稅優先
const manual = summarizeStock(stock, [
	{ id: 1, stockId: 1, kind: 'buy', date: '2026-01-05', price: 100, shares: 1000, fee: 20, tax: null },
	{ id: 2, stockId: 1, kind: 'sell', date: '2026-02-10', price: 110, shares: 1000, fee: 30, tax: 300 },
], fees)
ok('手動費用：已實現', manual.realized, 110000 - 30 - 300 - 100020)

// 4. ETF 證交稅 0.1%
const etf = summarizeStock({ id: 2, symbol: '0050', type: 'etf', price: null }, [
	{ id: 1, stockId: 2, kind: 'buy', date: '2026-01-05', price: 100, shares: 1000, fee: null, tax: null },
	{ id: 2, stockId: 2, kind: 'sell', date: '2026-03-05', price: 110, shares: 1000, fee: null, tax: null },
], fees)
ok('ETF 已實現（稅 0.1%）', etf.realized, 110000 - Math.round(110000 * 0.001425) - Math.floor(110000 * 0.001) - 100143)
ok('沒填現價時未實現為 null', etf.unrealized === null ? 1 : 0, 1)

// 5. 整體加總與曲線
const stocks = [stock, { id: 2, symbol: '0050', type: 'etf', price: null }]
const all = [...txs, { id: 5, stockId: 2, kind: 'buy', date: '2026-01-20', price: 50, shares: 2000, fee: null, tax: null },
	{ id: 6, stockId: 2, kind: 'sell', date: '2026-03-01', price: 55, shares: 1000, fee: null, tax: null }]
const port = summarizePortfolio(stocks, all, fees)
const sum2 = summarizeStock(stocks[1], all.filter((t) => t.stockId === 2), fees)
ok('整體已實現 = 兩檔相加', port.totals.realized, s.realized + sum2.realized)
const line = realizedSeries(stocks, all, fees)
console.log(`✓ 曲線點數 ${line.length}，最後累計 ${line.at(-1).value.toFixed(2)}`)
ok('曲線最後一點 = 整體已實現', line.at(-1).value, port.totals.realized)
