// 台股交易成本規則
export const FEE_RATE = 0.001425
export const TAX_RATES = { stock: 0.003, etf: 0.001 }

// 手續費原始金額：成交金額 × 0.1425% × 折扣（%），四捨五入
export function rawFee(amount, discount) {
	return Math.round(amount * FEE_RATE * (discount / 100))
}

// 實際收取的手續費：不足最低手續費時補足
export function brokerFee(amount, discount, minFee) {
	return Math.max(minFee, rawFee(amount, discount))
}

// 證交稅：賣出金額 × 稅率，無條件捨去
export function transactionTax(amount, type) {
	return Math.floor(amount * TAX_RATES[type])
}

// 損益兩平價：賣出手續費一律以不打折計算
export function breakEvenPrice(totalCost, shares, type) {
	return totalCost / (shares * (1 - FEE_RATE - TAX_RATES[type]))
}
