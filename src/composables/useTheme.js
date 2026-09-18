import { ref, watch } from 'vue'

const KEY = 'ledger-studio:theme'
export const THEME_MODES = ['system', 'light', 'dark']

const read = () => {
	try {
		const saved = localStorage.getItem(KEY)
		return THEME_MODES.includes(saved) ? saved : 'system'
	} catch {
		return 'system'
	}
}

const theme = ref(read())
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function apply() {
	const root = document.documentElement
	if (theme.value === 'system') root.removeAttribute('data-theme')
	else root.dataset.theme = theme.value

	const dark = theme.value === 'dark' || (theme.value === 'system' && systemDark.matches)
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0d0b' : '#f2eee4')
}

watch(theme, (value) => {
	try {
		localStorage.setItem(KEY, value)
	} catch {}
	apply()
})

systemDark.addEventListener('change', apply)
apply()

export function useTheme() {
	return { theme }
}
