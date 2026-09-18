import { ref, watch, onScopeDispose } from 'vue'

// 自動存到 localStorage 的物件狀態；讀寫失敗（無痕模式等）時退回只存在記憶體
export function useStoredRef(key, defaults) {
	// 最後一次讀到或寫入的字串，用來判斷其他分頁是否改過資料
	let last = null

	const read = () => {
		try {
			last = localStorage.getItem(key)
			return JSON.parse(last)
		} catch {
			return null
		}
	}

	const state = ref({ ...defaults, ...read() })

	watch(
		state,
		(value) => {
			try {
				last = JSON.stringify(value)
				localStorage.setItem(key, last)
			} catch {}
		},
		{ deep: true },
	)

	// 同時開著兩個分頁時，回到這個分頁就載入另一頁存的新資料，
	// 避免拿舊的畫面繼續編輯，把另一頁的修改蓋掉。
	// 不用 storage 事件即時同步：頁面上「更新時間」之類的連動寫入會讓兩個分頁來回互相觸發
	function reload() {
		if (document.visibilityState !== 'visible') return
		let raw = null
		try {
			raw = localStorage.getItem(key)
		} catch {
			return
		}
		if (raw == null || raw === last) return
		try {
			const saved = JSON.parse(raw)
			last = raw
			state.value = { ...defaults, ...saved }
		} catch {}
	}

	document.addEventListener('visibilitychange', reload)
	window.addEventListener('focus', reload)
	onScopeDispose(() => {
		document.removeEventListener('visibilitychange', reload)
		window.removeEventListener('focus', reload)
	})

	const reset = () => {
		state.value = { ...defaults }
	}

	return [state, reset]
}
