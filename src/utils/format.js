export function fmtNumber(value, decimals = 0) {
	return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// 1,500 股 → 1 張又 500 股
export function lotsText(shares) {
	if (!(shares > 0)) return ''
	const lots = Math.floor(shares / 1000)
	const odd = Math.round(shares % 1000)
	if (!lots) return `零股 ${odd} 股`
	return odd ? `${lots} 張又 ${odd} 股` : `${fmtNumber(lots)} 張`
}
