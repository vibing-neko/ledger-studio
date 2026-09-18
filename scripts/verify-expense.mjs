// 信用卡帳單週期與分期的檢查：拿手算的結果對照 expense.js
// 用法：node scripts/verify-expense.mjs
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { billMonthOf, periodOf, dueDateOf, postingsOf, shiftMonth } = await import(
	pathToFileURL(join(here, '../src/utils/expense.js')).href
)

let failed = 0
const eq = (name, got, want) => {
	const pass = JSON.stringify(got) === JSON.stringify(want)
	if (!pass) failed++
	console.log(`${pass ? '✓' : '✗'} ${name}: ${JSON.stringify(got)}${pass ? '' : `（應為 ${JSON.stringify(want)}）`}`)
}

// 1. 月份位移跨年
eq('2026-12 + 1', shiftMonth('2026-12', 1), '2027-01')
eq('2026-01 − 1', shiftMonth('2026-01', -1), '2025-12')

// 2. 結帳日 5 日：5 日（含）以前算當月，6 日起算下個月
eq('9/5 → 9 月帳單', billMonthOf('2026-09-05', 5), '2026-09')
eq('9/6 → 10 月帳單', billMonthOf('2026-09-06', 5), '2026-10')
eq('9 月帳單區間', periodOf('2026-09', 5), { start: '2026-08-06', end: '2026-09-05' })

// 3. 結帳日 31 日：小月以月底為準，區間首尾相接
eq('2/28 → 2 月帳單', billMonthOf('2026-02-28', 31), '2026-02')
eq('3/1 → 3 月帳單', billMonthOf('2026-03-01', 31), '2026-03')
eq('3 月帳單區間（2 月底結帳）', periodOf('2026-03', 31), { start: '2026-03-01', end: '2026-03-31' })
eq('5 月帳單區間（4/30 結帳）', periodOf('2026-05', 31), { start: '2026-05-01', end: '2026-05-31' })
eq('結帳日 30、3 月帳單區間', periodOf('2026-03', 30), { start: '2026-03-01', end: '2026-03-30' })
eq('結帳日 30、3/31 → 4 月帳單', billMonthOf('2026-03-31', 30), '2026-04')
eq('結帳日 30、4 月帳單區間', periodOf('2026-04', 30), { start: '2026-03-31', end: '2026-04-30' })

// 4. 跨年
eq('12/26 結帳日 25 → 隔年 1 月帳單', billMonthOf('2026-12-26', 25), '2027-01')
eq('2027-01 帳單區間', periodOf('2027-01', 25), { start: '2026-12-26', end: '2027-01-25' })

// 5. 繳款截止日：結帳日之後第一個繳款日
eq('結帳 5 日、繳款 20 日 → 同月', dueDateOf('2026-09', 5, 20), '2026-09-20')
eq('結帳 25 日、繳款 10 日 → 下個月', dueDateOf('2026-09', 25, 10), '2026-10-10')
eq('結帳 31 日、繳款 15 日 → 下個月', dueDateOf('2026-01', 31, 15), '2026-02-15')
eq('4 月結帳 30、繳款 31 → 5/31（不能同日）', dueDateOf('2026-04', 30, 31), '2026-05-31')
eq('1 月結帳 20、繳款 31 → 1/31', dueDateOf('2026-01', 20, 31), '2026-01-31')

// 6. 分期：餘數放第一期，從歸屬帳單開始逐期入帳
const card = { id: 1, closingDay: 25 }
const split = postingsOf({ date: '2026-09-26', amount: 10000, installments: 3, shift: 0 }, card)
eq('10000 分 3 期金額', split.map((p) => p.amount), [3334, 3333, 3333])
eq('分期入帳月份', split.map((p) => p.month), ['2026-10', '2026-11', '2026-12'])
eq('分期加總不變', split.reduce((s, p) => s + p.amount, 0), 10000)

// 7. 負數（退款）分期、手動延後一期
const refund = postingsOf({ date: '2026-09-10', amount: -1000, installments: 3, shift: 1 }, card)
eq('−1000 分 3 期', refund.map((p) => p.amount), [-334, -333, -333])
eq('延後一期從 10 月開始', refund[0].month, '2026-10')

// 8. 一次付清、未填金額
eq('一次付清只有一期', postingsOf({ date: '2026-09-10', amount: 500, installments: 1 }, card).length, 1)
eq('金額未填視為 0', postingsOf({ date: '2026-09-10', amount: null, installments: 1 }, card)[0].amount, 0)

console.log(failed ? `\n${failed} 項不符` : '\n全部通過')
process.exit(failed ? 1 : 0)
