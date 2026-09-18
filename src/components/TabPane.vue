<!-- 分頁的外框：把一整段頁面內容包成元件，才能放進 <KeepAlive> 保留狀態（用不同的 key 區分分頁） -->
<template>
	<div class="tab-pane">
		<slot />
	</div>
</template>

<style scoped>
.tab-pane {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 1.25rem;
	min-width: 0;
}
</style>
