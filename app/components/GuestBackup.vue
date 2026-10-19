<script setup lang="ts">
import { MAX_BACKUP_BYTES } from '~/utils/backup'
const { exportGuestBackup, importGuestBackup, loading, saving, writable } = useTasks()
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const message = ref('')
const error = ref('')

function exportBackup() {
  message.value = ''
  error.value = ''
  try {
    const url = URL.createObjectURL(new Blob([exportGuestBackup()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `corn-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    message.value = '备份已导出。'
  } catch (e) { error.value = e instanceof Error ? e.message : '备份导出失败。' }
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  message.value = ''
  error.value = ''
  importing.value = true
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 10 MB。')
    const result = await importGuestBackup(await file.text())
    message.value = `已导入 ${result.addedProjects} 个项目、${result.addedTasks} 条任务${result.skippedTasks ? `，跳过 ${result.skippedTasks} 条已有任务` : ''}。`
  } catch (e) { error.value = e instanceof Error ? e.message : '备份导入失败，请重试。' }
  finally { importing.value = false; input.value = '' }
}
</script>

<template>
  <div class="mt-12px" aria-label="本地数据备份">
    <div class="flex items-center gap-8px">
      <button type="button" class="project-add disabled:opacity-40 disabled:cursor-default" :disabled="loading || importing" @click="exportBackup">导出备份</button>
      <button type="button" class="project-add disabled:opacity-40 disabled:cursor-default" :disabled="!writable || saving || importing" @click="fileInput?.click()">{{ importing ? '正在导入…' : '导入备份' }}</button>
      <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" aria-label="选择 corn 备份文件" @change="importFile">
    </div>
    <p class="text-11px text-subtle mt-4px mb-0 leading-relaxed">导入会合并数据，保留已有内容。</p>
    <p v-if="message" role="status" class="text-12px text-muted mt-6px mb-0">{{ message }}</p>
    <p v-if="error" role="alert" class="text-12px text-danger mt-6px mb-0">{{ error }}</p>
  </div>
</template>
