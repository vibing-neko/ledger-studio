import { FEE_RATE, TAX_RATES } from '../utils/fees.js'

// 零股單筆上限；整張單一次買 L 張（L × 1000 股）
const ODD_LOT_MAX = 999

/**
 * 搜尋能讓損益兩平價剛好落在整數的加碼組合。
 *
 * 加碼方式：可選的 1 筆整張單 + 最多兩組零股單（每組內同股數同價位）。
 *
 * 作法：兩平價取到整數 n，等同於總成本落在 n × D 附近寬度 0.01 × D 的區間內
 * （D = 加碼後總股數 × (1 − 賣出費率)）。因此最後一組的價位不必逐一嘗試，
 * 直接由區間反推，再檢查價格級距上的那一兩個價位即可。
 * 金額全部以「分」為整數計算，避免浮點誤差。
 */
self.onmessage = ({ data }) => {
	const started = performance.now()
	const { cost0, shares0, discount, minFee, type, target, priceMin, priceMax, priceStep, splitMin, splitMax, roundMode, useLots } = data

	const add = target - shares0
	const baseCostCents = Math.round(cost0 * 100)
	const rateFrac = FEE_RATE * (discount / 100)
	const dCents = 100 * target * (1 - FEE_RATE - TAX_RATES[type])

	const stepC = Math.round(priceStep * 100)
	const baseC = Math.round(priceMin * 100)
	const priceCount = Math.floor((Math.round(priceMax * 100) - baseC) / stepC) + 1
	const priceAt = (i) => baseC + i * stepC

	const nMin = data.beMin == null ? -Infinity : Math.ceil(data.beMin)
	const nMax = data.beMax == null ? Infinity : Math.floor(data.beMax)

	const feeOf = (shares, priceC) => Math.round((shares * priceC * rateFrac) / 100)
	const orderCents = (shares, priceC) => shares * priceC + feeOf(shares, priceC) * 100

	// 兩平價為 n 時，總成本（分）的合法區間
	const windowOf = (n) => {
		const lo = roundMode === 'floor' ? n * dCents : (n - 0.005) * dCents
		const hi = roundMode === 'floor' ? (n + 0.01) * dCents : (n + 0.005) * dCents
		return [Math.ceil(lo), Math.ceil(hi) - 1]
	}

	const best = new Map()
	let checked = 0

	const record = (n, k, totalCents, lots, groups) => {
		const key = `${n}|${k}`
		const prev = best.get(key)
		if (prev && prev.totalCents <= totalCents) return
		best.set(key, { be: n, k, totalCents, exact: totalCents / dCents, lots, groups })
	}

	// 手續費隨價位遞增：連最高價位都不到最低手續費的股數，不論價位都會被排除，直接略過
	const maxPriceC = priceAt(priceCount - 1)
	const tooSmall = (shares) => feeOf(shares, maxPriceC) < minFee

	// 由成本區間反推最後一組的價位
	const solveLast = (fixedCents, orders, shares, k, build) => {
		if (tooSmall(shares)) return
		const totalLo = fixedCents + orders * orderCents(shares, priceAt(0))
		const totalHi = fixedCents + orders * orderCents(shares, priceAt(priceCount - 1))
		const from = Math.max(nMin, Math.ceil(totalLo / dCents - 0.01))
		const to = Math.min(nMax, Math.floor(totalHi / dCents + 0.01))

		for (let n = from; n <= to; n++) {
			const [lo, hi] = windowOf(n)
			// 每筆成本 ≈ 股數 × 價位 × (1 + 費率)，手續費四捨五入的誤差最多 1 元
			const margin = 100 / shares + 1
			const perLo = (lo - fixedCents) / orders
			const perHi = (hi - fixedCents) / orders
			const first = Math.max(0, Math.ceil((perLo / (shares * (1 + rateFrac)) - margin - baseC) / stepC))
			const last = Math.min(priceCount - 1, Math.floor((perHi / (shares * (1 + rateFrac)) + margin - baseC) / stepC))

			for (let i = first; i <= last; i++) {
				checked++
				const priceC = priceAt(i)
				const fee = feeOf(shares, priceC)
				if (fee < minFee) continue
				const total = fixedCents + orders * (shares * priceC + fee * 100)
				if (total < lo || total > hi) continue
				const [lots, groups] = build(priceC, fee)
				record(n, k, total, lots, groups)
			}
		}
	}

	const maxLots = useLots ? Math.floor(add / 1000) : 0

	// 進度以「前段組合數」計：每種股數乘上價位數，和畫面上預估的搜尋量一致
	const oddRange = (rest, lotOrders) => [Math.max(1, Math.ceil(rest / ODD_LOT_MAX), splitMin - lotOrders), splitMax - lotOrders]
	const headMaxOf = (rest, headOrders, tailOrders) => Math.min(ODD_LOT_MAX, Math.floor((rest - tailOrders) / headOrders))
	const workOf = (rest, lotOrders) => {
		if (rest === 0) return 1
		const [oddMin, oddMax] = oddRange(rest, lotOrders)
		let work = 0
		for (let odd = oddMin; odd <= oddMax; odd++) {
			for (let tailOrders = 1; tailOrders <= odd; tailOrders++) {
				const headOrders = odd - tailOrders
				work += headOrders === 0 ? 1 : priceCount * Math.max(0, headMaxOf(rest, headOrders, tailOrders))
			}
		}
		return work
	}

	let totalWork = 0
	for (let lotCount = 0; lotCount <= maxLots; lotCount++) {
		totalWork += (lotCount > 0 ? priceCount : 1) * workOf(add - lotCount * 1000, lotCount > 0 ? 1 : 0)
	}
	let doneWork = 0
	let lastPost = 0
	const tick = (n) => {
		doneWork += n
		const now = performance.now()
		if (now - lastPost < 50) return
		lastPost = now
		self.postMessage({ type: 'progress', done: doneWork, total: totalWork })
	}

	for (let lotCount = 0; lotCount <= maxLots; lotCount++) {
		const lotShares = lotCount * 1000
		const rest = add - lotShares
		const lotOrders = lotCount > 0 ? 1 : 0
		const work = workOf(rest, lotOrders)

		// 整張單的價位；沒有整張單時只跑一次
		const lotPrices = lotCount > 0 ? Array.from({ length: priceCount }, (_, i) => priceAt(i)) : [null]

		// 剛好整張買完
		if (rest === 0) {
			if (lotCount > 0 && splitMin <= 1 && splitMax >= 1) {
				solveLast(baseCostCents, 1, lotShares, 1, (priceC, fee) => [{ lots: lotCount, shares: lotShares, priceC, fee }, []])
			}
			tick(lotPrices.length)
			continue
		}

		const [oddMin, oddMax] = oddRange(rest, lotOrders)

		for (const lotPriceC of lotPrices) {
			let lotCents = 0
			let lotInfo = null
			if (lotPriceC !== null) {
				const fee = feeOf(lotShares, lotPriceC)
				if (fee < minFee) {
					tick(work)
					continue
				}
				lotCents = lotShares * lotPriceC + fee * 100
				lotInfo = { lots: lotCount, shares: lotShares, priceC: lotPriceC, fee }
			}

			for (let odd = oddMin; odd <= oddMax; odd++) {
				const k = odd + lotOrders
				for (let tailOrders = 1; tailOrders <= odd; tailOrders++) {
					const headOrders = odd - tailOrders

					// 只有一組零股：股數由總數決定，直接解價位
					if (headOrders === 0) {
						tick(1)
						if (rest % tailOrders) continue
						const shares = rest / tailOrders
						if (shares > ODD_LOT_MAX) continue
						solveLast(baseCostCents + lotCents, tailOrders, shares, k, (priceC, fee) => [
							lotInfo,
							[{ orders: tailOrders, shares, priceC, fee }],
						])
						continue
					}

					// 兩組零股：前段逐一嘗試，後段的價位用反推
					const headMax = headMaxOf(rest, headOrders, tailOrders)
					for (let headShares = 1; headShares <= headMax; headShares++) {
						tick(priceCount)
						if (tooSmall(headShares)) continue
						const remaining = rest - headOrders * headShares
						if (remaining % tailOrders) continue
						const tailShares = remaining / tailOrders
						if (tailShares > ODD_LOT_MAX || tooSmall(tailShares)) continue

						for (let i = 0; i < priceCount; i++) {
							const headPriceC = priceAt(i)
							const headFee = feeOf(headShares, headPriceC)
							if (headFee < minFee) continue
							const headCents = headOrders * (headShares * headPriceC + headFee * 100)
							solveLast(baseCostCents + lotCents + headCents, tailOrders, tailShares, k, (priceC, fee) => [
								lotInfo,
								[
									{ orders: headOrders, shares: headShares, priceC: headPriceC, fee: headFee },
									{ orders: tailOrders, shares: tailShares, priceC, fee },
								],
							])
						}
					}
				}
			}
		}
	}

	// 整理成：兩平價 → 各種筆數
	const byBe = new Map()
	for (const option of best.values()) {
		if (!byBe.has(option.be)) byBe.set(option.be, [])
		byBe.get(option.be).push({
			k: option.k,
			totalCost: option.totalCents / 100,
			exact: option.exact,
			lots: option.lots && { ...option.lots, price: option.lots.priceC / 100 },
			groups: option.groups.map((g) => ({ ...g, price: g.priceC / 100 })),
		})
	}

	const results = [...byBe]
		.sort((a, b) => a[0] - b[0])
		.map(([be, options]) => ({ be, options: options.sort((a, b) => a.k - b.k) }))

	self.postMessage({ type: 'done', results, checked, ms: performance.now() - started })
}
