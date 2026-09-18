// 加碼兩平價搜尋的正確性檢查：worker 的結果必須和「完全枚舉」一模一樣
// 用法：node scripts/verify-breakeven.mjs
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const messages = []
globalThis.self = { postMessage: (m) => messages.push(m) }
await import(pathToFileURL(join(here, '../src/workers/breakeven.worker.js')).href)

const FEE = 0.001425
const TAX = { stock: 0.003, etf: 0.001 }
const ODD = 999

function brute(c) {
	const add = c.target - c.shares0
	const rate = FEE * (c.discount / 100)
	const dCents = 100 * c.target * (1 - FEE - TAX[c.type])
	const stepC = Math.round(c.priceStep * 100)
	const baseC = Math.round(c.priceMin * 100)
	const n = Math.floor((Math.round(c.priceMax * 100) - baseC) / stepC) + 1
	const prices = Array.from({ length: n }, (_, i) => baseC + i * stepC)
	const fee = (s, p) => Math.round((s * p * rate) / 100)
	const nMin = c.beMin == null ? -Infinity : Math.ceil(c.beMin)
	const nMax = c.beMax == null ? Infinity : Math.floor(c.beMax)
	const best = new Map()

	const take = (totalCents, k) => {
		const be = c.roundMode === 'floor' ? Math.floor((totalCents / dCents) * 100 + 1e-7) : Math.round((totalCents / dCents) * 100)
		if (be % 100) return
		const value = be / 100
		if (value < nMin || value > nMax) return
		const key = `${value}|${k}`
		if (!best.has(key) || totalCents < best.get(key)) best.set(key, totalCents)
	}

	const maxLots = c.useLots ? Math.floor(add / 1000) : 0
	for (let lots = 0; lots <= maxLots; lots++) {
		const lotShares = lots * 1000
		const rest = add - lotShares
		const lotOrders = lots > 0 ? 1 : 0
		const lotPrices = lots > 0 ? prices : [null]
		for (const lp of lotPrices) {
			let lotCents = 0
			if (lp !== null) {
				const f = fee(lotShares, lp)
				if (f < c.minFee) continue
				lotCents = lotShares * lp + f * 100
			}
			if (rest === 0) {
				if (lots > 0 && c.splitMin <= 1 && c.splitMax >= 1) take(c.cost0 * 100 + lotCents, 1)
				continue
			}
			const oddMin = Math.max(1, Math.ceil(rest / ODD), c.splitMin - lotOrders)
			for (let odd = oddMin; odd <= c.splitMax - lotOrders; odd++) {
				for (let tailOrders = 1; tailOrders <= odd; tailOrders++) {
					const headOrders = odd - tailOrders
					const k = odd + lotOrders
					if (headOrders === 0) {
						if (rest % tailOrders) continue
						const s = rest / tailOrders
						if (s > ODD) continue
						for (const p of prices) {
							const f = fee(s, p)
							if (f < c.minFee) continue
							take(c.cost0 * 100 + lotCents + tailOrders * (s * p + f * 100), k)
						}
						continue
					}
					for (let hs = 1; hs <= Math.min(ODD, Math.floor((rest - tailOrders) / headOrders)); hs++) {
						const remaining = rest - headOrders * hs
						if (remaining % tailOrders) continue
						const ts = remaining / tailOrders
						if (ts > ODD) continue
						for (const hp of prices) {
							const hf = fee(hs, hp)
							if (hf < c.minFee) continue
							const headCents = headOrders * (hs * hp + hf * 100)
							for (const tp of prices) {
								const tf = fee(ts, tp)
								if (tf < c.minFee) continue
								take(c.cost0 * 100 + lotCents + headCents + tailOrders * (ts * tp + tf * 100), k)
							}
						}
					}
				}
			}
		}
	}
	return best
}

const cases = [
	{ name: '個股/四捨五入/含整張', cost0: 109070, shares0: 1000, discount: 45, minFee: 20, type: 'stock', target: 3000, priceMin: 104, priceMax: 107, priceStep: 0.5, splitMin: 1, splitMax: 5, roundMode: 'round', beMin: 100, beMax: 115, useLots: true },
	{ name: 'ETF/無條件捨去/含整張', cost0: 109070, shares0: 1000, discount: 45, minFee: 20, type: 'etf', target: 2500, priceMin: 100, priceMax: 103, priceStep: 0.5, splitMin: 1, splitMax: 4, roundMode: 'floor', beMin: null, beMax: null, useLots: true },
	{ name: '只用零股', cost0: 50000, shares0: 500, discount: 28, minFee: 20, type: 'stock', target: 2000, priceMin: 95, priceMax: 97, priceStep: 0.5, splitMin: 2, splitMax: 4, roundMode: 'round', beMin: null, beMax: null, useLots: false },
	{ name: '新開倉/整張為主', cost0: 0, shares0: 0, discount: 60, minFee: 20, type: 'stock', target: 2200, priceMin: 80, priceMax: 82, priceStep: 0.5, splitMin: 1, splitMax: 3, roundMode: 'round', beMin: null, beMax: null, useLots: true },
]

for (const c of cases) {
	messages.length = 0
	self.onmessage({ data: c })
	const done = messages.find((m) => m.type === 'done')
	const got = new Map()
	for (const g of done.results) for (const o of g.options) {
		got.set(`${g.be}|${o.k}`, Math.round(o.totalCost * 100))
		// 檢查組合本身合法
		const shares = (o.lots?.shares ?? 0) + o.groups.reduce((s, x) => s + x.orders * x.shares, 0)
		const orders = (o.lots ? 1 : 0) + o.groups.reduce((s, x) => s + x.orders, 0)
		if (shares !== c.target - c.shares0) throw new Error(`股數不符 ${c.name} ${JSON.stringify(o)}`)
		if (orders !== o.k) throw new Error(`筆數不符 ${c.name} ${JSON.stringify(o)}`)
		for (const x of o.groups) if (x.shares > 999 || x.shares < 1) throw new Error('零股超限')
		if (o.lots && o.lots.shares % 1000) throw new Error('整張數不對')
	}
	const want = brute(c)
	const keys = new Set([...got.keys(), ...want.keys()])
	let diff = 0
	for (const k of keys) if ((got.get(k) ?? -1) !== (want.get(k) ?? -1)) { diff++; if (diff < 4) console.log('  差異', k, got.get(k), want.get(k)) }
	console.log(`${c.name}: worker ${got.size} 組 / 枚舉 ${want.size} 組, 差異 ${diff}, 內層檢查 ${done.checked} 次, ${done.ms.toFixed(1)}ms`)
}
