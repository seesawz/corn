<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { fmtDue, fmtStamp } from '~/utils/parse'
import type { Task } from '~/utils/parse'

const props = defineProps<{
  task: Task
  draggable: boolean
  dragging: boolean
  /** null = 无标记，true = 上方插入线，false = 下方插入线 */
  dropMark: boolean | null
}>()

const { projects, moveTask, toggleDone, toggleStar, saveEdit, removeTask, setDue } = useTasks()

// ---- 双击行内编辑 ----
const editing = ref(false)
const detailsVisible = ref(false)
const editText = ref('')
const editEl = ref<HTMLInputElement | null>(null)

function startEdit() {
  editText.value = props.task.text
  editing.value = true
  nextTick(() => {
    editEl.value?.focus()
    editEl.value?.setSelectionRange(editText.value.length, editText.value.length)
  })
}

function finishEdit(save: boolean) {
  if (!editing.value) return
  editing.value = false
  const val = editText.value.trim()
  if (save && val) saveEdit(props.task.id, val)
}

function onProjectChange(e: Event) {
  moveTask(props.task.id, (e.target as HTMLSelectElement).value)
}

// 日期选择锚定在到期按钮，浮层由 Reka UI 管理定位和关闭。
const duePopoverOpen = ref(false)

function closeDuePopover() {
  duePopoverOpen.value = false
}

function pickDue(due: string | null) {
  setDue(props.task.id, due)
  closeDuePopover()
}

const recordStamp = computed(() => fmtStamp(props.task.done ? props.task.completedAt || props.task.createdAt : props.task.createdAt))
</script>

<template>
  <motion.li
    layout="position"
    :initial="{ opacity: 0 }"
    :animate="{ opacity: dragging ? 0.35 : 1 }"
    :exit="{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, borderBottomWidth: 0, pointerEvents: 'none', transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }"
    :style="{ overflow: 'hidden' }"
    class="task group/task"
    :data-id="task.id"
    :draggable="draggable"
  >
    <span v-if="dropMark !== null" class="drop-indicator" :class="dropMark ? 'top-[-1px]' : 'bottom-[-1px]'" />
    <span class="task-check">
      <motion.input
        :while-press="{ scale: 0.94 }"
        type="checkbox"
        class="check"
        :checked="task.done"
        :aria-label="task.done ? '标记为未完成' : '标记为已完成'"
        @change="toggleDone(task.id)"
      />
      <!-- Things 风格打勾：整体轻弹入 + 勾线描绘，完成感更强又不喧宾夺主 -->
      <motion.svg v-if="task.done" class="check-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :initial="{ scale: 0.8, opacity: 0 }" :animate="{ scale: 1, opacity: 1 }" :transition="{ type: 'spring', stiffness: 500, damping: 30 }">
        <motion.path d="m4.5 12.5 5 5 10-11" :initial="{ pathLength: 0 }" :animate="{ pathLength: 1 }" :transition="{ duration: 0.18, ease: 'easeOut', delay: 0.05 }" />
      </motion.svg>
    </span>

    <div class="task-content">
      <div class="task-main">
        <svg
          v-if="task.priority"
          class="flag" :class="{ 'text-p1': task.priority === 1, 'text-p2': task.priority === 2, 'text-p3': task.priority === 3 }"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          :aria-label="`P${task.priority} 优先级`"
        >
          <path d="M6 21V4" />
          <path d="M6 4.5c1.8-1.2 3.7-1.2 5.5 0s3.7 1.2 5.5 0V13c-1.8 1.2-3.7 1.2-5.5 0s-3.7-1.2-5.5 0" />
        </svg>

        <input
          v-if="editing"
          ref="editEl"
          v-model="editText"
          class="edit-input"
          maxlength="300"
          @keydown.enter="finishEdit(true)"
          @keydown.escape="finishEdit(false)"
          @blur="finishEdit(true)"
        >
        <span v-else class="task-text" :class="{ 'text-subtle line-through decoration-subtle decoration-1': task.done }" title="双击编辑" role="button" tabindex="0" @dblclick="startEdit" @keydown.enter.prevent="startEdit">{{ task.text }}</span>
        <time class="task-stamp" :title="`${task.done ? '完成于' : '创建于'} ${recordStamp}`">{{ recordStamp.slice(5, 10) }}</time>

      </div>
      <!-- meta 行随高度展开/收起，避免设置到期时间等内容增减时下方任务跳动；间距放内层以参与高度动画 -->
      <AnimatePresence :initial="false">
        <motion.div
          v-if="task.tags.length || task.due"
          key="meta"
          :style="{ overflow: 'hidden' }"
          :initial="{ opacity: 0, height: 0 }"
          :animate="{ opacity: 1, height: 'auto' }"
          :exit="{ opacity: 0, height: 0, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }"
        >
          <div class="task-meta">
            <span v-for="tag in task.tags" :key="tag" class="tag-chip">#{{ tag }}</span>
            <span v-if="task.due" class="due-chip" title="到期时间">{{ fmtDue(task.due) }}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>

    <div class="task-side">
      <motion.button
        :while-press="{ scale: 0.9 }"
        class="task-action hover:text-gold" :class="{ 'opacity-100 text-gold [&_svg]:fill-current': task.starred }"
        :aria-label="task.starred ? '取消星标' : '加星标'"
        :title="task.starred ? '取消星标' : '星标'"
        @click="toggleStar(task.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
          <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
        </svg>
      </motion.button>

      <motion.button
        :while-press="{ scale: 0.9 }"
        class="task-action" :class="{ 'opacity-100 bg-hover': detailsVisible }"
        aria-label="任务详情与操作"
        :aria-expanded="detailsVisible"
        :aria-controls="`task-details-${task.id}`"
        title="任务详情与操作"
        @click="detailsVisible = !detailsVisible"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
      </motion.button>
    </div>
    <AnimatePresence>
      <motion.div
        v-if="detailsVisible"
        :id="`task-details-${task.id}`"
        key="details"
        class="task-details"
        :initial="{ opacity: 0, height: 0 }"
        :animate="{ opacity: 1, height: 'auto' }"
        :exit="{ opacity: 0, height: 0 }"
      >
        <div class="task-details-content">
          <div class="task-record"><span>创建时间</span><time>{{ fmtStamp(task.createdAt) }}</time></div>
          <div v-if="task.done" class="task-record mt-6px"><span>完成时间</span><time>{{ recordStamp }}</time></div>
          <div class="task-record mt-6px">
            <span>到期时间</span>
            <PopoverRoot v-model:open="duePopoverOpen">
              <PopoverTrigger as-child>
                <button type="button" class="due-toggle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5.5" width="16" height="15" rx="2.5" /><path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4" /></svg>
                  <span :class="{ 'text-subtle': !task.due }">{{ task.due ? fmtDue(task.due) : '设置到期…' }}</span>
                </button>
              </PopoverTrigger>
              <PopoverPortal>
                <PopoverContent
                  class="date-popover"
                  side="bottom"
                  align="end"
                  :side-offset="8"
                  :collision-padding="12"
                  aria-label="选择到期日期"
                  @open-auto-focus.prevent
                  @keydown.stop
                >
                  <motion.div :initial="{ opacity: 0, scale: 0.98 }" :animate="{ opacity: 1, scale: 1 }">
                    <TaskDatePicker :value="task.due" @select="pickDue" @cancel="closeDuePopover" />
                  </motion.div>
                </PopoverContent>
              </PopoverPortal>
            </PopoverRoot>
          </div>
          <div class="task-detail-actions">
            <label v-if="projects.length > 1" class="task-project-label">
              移至
              <select class="task-project" aria-label="移动任务到项目" :value="task.projectId" @change="onProjectChange">
                <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
              </select>
            </label>
            <button type="button" class="task-delete" aria-label="删除任务" title="删除任务" @click="removeTask(task.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  </motion.li>
</template>
