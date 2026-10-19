<script setup lang="ts">
import '@fontsource-variable/noto-sans-sc/index.css'
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion-v'

const reducedMotion = useReducedMotion()
const {
  filtered, projectId, viewTitle, search, completedCount,
  toastVisible, toastText, undoRemove, clearDone, initTasks, resetTasks, loading, mode, writable, localOnly,
} = useTasks()
const { initTheme } = useTheme()
const { user, ready, configured, isGuestMode, getClient, initAuth } = useAuth()

function loadAccount() {
  if (user.value) { void initTasks(getClient(), user.value.id); return }
  if (isGuestMode.value) { void initTasks(null, '', true); return }
  resetTasks()
}
const workspace = computed(() => !ready.value ? 'initial' : user.value ? `user:${user.value.id}` : isGuestMode.value ? 'guest' : 'signed-out')
watch(workspace, () => {
  closeSearch()
  if (ready.value) loadAccount()
}, { flush: 'sync' })

// 初始化：主题 + 数据加载（本地缓存先行，Supabase 异步接管）
onMounted(() => {
  initTheme()
  void initAuth()
})

// 快捷键：N 聚焦新任务输入框，Ctrl+F 呼出搜索，Esc 关闭搜索
const taskInput = ref<{ focus: () => void } | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const searchVisible = ref(false)

function closeSearch() {
  searchVisible.value = false
  search.value = ''
}

async function onKeydown(e: KeyboardEvent) {
  if (!ready.value || (configured && !user.value && !isGuestMode.value)) return
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    searchVisible.value = true
    await nextTick()
    searchInput.value?.focus()
    searchInput.value?.select()
    return
  }
  if (e.key === 'Escape' && searchVisible.value) {
    e.preventDefault()
    closeSearch()
    return
  }
  const target = e.target as HTMLElement
  const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault()
    taskInput.value?.focus()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

const emptyCopy = computed(() => search.value
  ? { title: '没有找到相关任务', sub: `换个关键词试试，当前搜索：“${search.value}”` }
  : { title: '这个项目还没有任务', sub: '在下方输入框添加你的第一个任务吧' },
)
</script>

<template>
  <!-- 动效基调：进场 swift-out（快出缓停）更"贵"；布局位移用近临界弹簧（快速归位、几乎无回弹） -->
  <MotionConfig reduced-motion="user" :skip-animations="reducedMotion" :transition="{ duration: 0.2, ease: [0.22, 1, 0.36, 1], layout: { type: 'spring', stiffness: 400, damping: 35 } }">
    <div v-if="!ready" class="startup-screen" role="status" aria-label="正在恢复登录状态"><span class="startup-logo" aria-hidden="true"><BrandIcon /></span></div>
    <AuthPanel v-else-if="configured && !user && !isGuestMode" />
    <div v-else :key="user?.id || 'guest'" class="app">
      <TheSidebar />

      <main class="main">
        <motion.div class="main-inner" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.16, ease: 'easeOut' }">
          <header class="header">
            <div class="header-text">
              <motion.h1 class="page-title" :key="projectId" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.16, ease: 'easeOut' }">{{ viewTitle }}</motion.h1>
            </div>
            <AnimatePresence>
              <motion.div v-if="searchVisible" key="search" class="search-box" :initial="{ opacity: 0, y: -3 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0, y: -3, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }">
                <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.4-4.4" />
                </svg>
                <input
                  class="search-input"
                ref="searchInput"
                  v-model="search"
                  type="text"
                  placeholder="搜索任务"
                  aria-label="搜索任务"
                  autocomplete="off"
                >
                <button type="button" class="search-close" aria-label="关闭搜索" title="关闭搜索（Esc）" @click="closeSearch">×</button>
              </motion.div>
            </AnimatePresence>
          </header>

          <!-- 状态横幅与计数条随高度展开/收起，出现或消失时不挤压下方内容；间距留在内层以参与高度动画 -->
          <AnimatePresence :initial="false">
            <motion.div v-if="loading" key="loading" role="status" :style="{ overflow: 'hidden' }" :initial="{ opacity: 0, height: 0 }" :animate="{ opacity: 1, height: 'auto' }" :exit="{ opacity: 0, height: 0, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }">
              <p class="text-muted m-0 mb-20px">正在加载你的待办…</p>
            </motion.div>
            <motion.div v-else-if="mode === 'error'" key="error" role="alert" :style="{ overflow: 'hidden' }" :initial="{ opacity: 0, height: 0 }" :animate="{ opacity: 1, height: 'auto' }" :exit="{ opacity: 0, height: 0, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }">
              <div class="mb-20px p-12px rounded-8px bg-accent-soft text-13px">
                <p v-if="localOnly" class="m-0">本地数据读写失败，编辑已暂停。请确认浏览器允许保存网站数据后重试。</p>
                <p v-else class="m-0">云端同步失败，当前显示此账号的本地缓存，编辑已暂停。重试会重新读取云端，未同步的修改可能被覆盖。</p>
                <p v-if="!localOnly" class="text-muted">请稍后重试，或退出后重新登录。</p>
                <button type="button" class="composer-submit" @click="loadAccount">{{ localOnly ? '重试本地存储' : '重新连接' }}</button>
              </div>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence :initial="false">
            <motion.div v-if="filtered.length > 0" key="list-head" :style="{ overflow: 'hidden' }" :initial="{ opacity: 0, height: 0 }" :animate="{ opacity: 1, height: 'auto' }" :exit="{ opacity: 0, height: 0, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }">
              <div class="list-head">
                <span>{{ search ? '搜索结果' : '任务' }} · {{ filtered.length }}</span>
                <button v-if="writable && completedCount > 0 && !search" class="task-clear" @click="clearDone">清除已完成</button>
              </div>
            </motion.div>
          </AnimatePresence>
          <div :inert="!writable || undefined" :aria-busy="loading">
          <TaskList ref="taskInput" :tasks="filtered">
            <template #empty>
              <div class="task-empty">
                <motion.span class="task-empty-logo" :initial="{ scale: 0.92 }" :animate="{ scale: 1 }" aria-hidden="true">
                  <BrandIcon />
                </motion.span>
                <p class="task-empty-title">{{ emptyCopy.title }}</p>
                <p class="task-empty-sub">{{ emptyCopy.sub }}</p>
              </div>
            </template>
          </TaskList>
          </div>
        </motion.div>
      </main>

      <!-- 撤销 Toast -->
      <AnimatePresence>
        <motion.div v-if="toastVisible" key="toast" class="toast" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 32 } }" :exit="{ opacity: 0, y: 6, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }">
          <span class="truncate">{{ toastText }}</span>
          <button class="toast-undo" type="button" @click="undoRemove">撤销</button>
        </motion.div>
      </AnimatePresence>
    </div>
  </MotionConfig>
</template>
