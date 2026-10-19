<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import type { ProjectIconName } from '~/utils/projectIcons'
const { projects, projectId, counts, setProject, addProject, renameProject, writable, saving, localOnly, loading } = useTasks()
const { user, displayName, busy, authError, signOut, configured, showLogin } = useAuth()
const { toggleTheme } = useTheme()

const editorVisible = ref(false)
const openIcons = ref(false)
const editingProjectId = ref<string | null>(null)
const projectAddButton = ref<HTMLButtonElement | null>(null)
const sidebarEl = ref<HTMLElement | null>(null)

function openProjectEditor(id: string | null = null, chooseIcon = false) {
  if (!writable.value) return
  openIcons.value = chooseIcon
  editingProjectId.value = id
  editorVisible.value = true
}

async function closeProjectEditor(saved = false) {
  const id = editingProjectId.value
  editorVisible.value = false
  await nextTick()
  if (saved) sidebarEl.value?.querySelector<HTMLButtonElement>(`[data-project-id="${id || projectId.value}"] .nav-item`)?.focus()
  else if (id) sidebarEl.value?.querySelector<HTMLButtonElement>(`[data-project-id="${id}"] .project-rename`)?.focus()
  else projectAddButton.value?.focus()
}

function saveProject(name: string, icon: ProjectIconName) {
  const saved = editingProjectId.value
    ? renameProject(editingProjectId.value, name, icon)
    : addProject(name, icon)
  if (saved) closeProjectEditor(true)
}

function selectProject(id: string) {
  editorVisible.value = false
  setProject(id)
}
</script>

<template>
  <aside ref="sidebarEl" class="sidebar">
    <motion.div class="brand" :initial="{ opacity: 0, x: -4 }" :animate="{ opacity: 1, x: 0 }">
      <span class="logo" aria-hidden="true">
        <BrandIcon />
      </span>
      <span class="brand-name">corn</span>
      <button class="icon-btn" title="切换深浅色主题" aria-label="切换深浅色主题" @click="toggleTheme">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        </svg>
      </button>
    </motion.div>

    <div class="projects-heading">
      <span>项目</span>
      <button type="button" ref="projectAddButton" class="project-add" aria-label="新建项目" @click="openProjectEditor()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        新建
      </button>
    </div>
    <nav class="nav" aria-label="项目切换">
      <AnimatePresence :initial="false">
        <ProjectNameEditor
          v-if="editorVisible && !editingProjectId"
          key="new-project"
          mode="create"
          @save="saveProject"
          @cancel="closeProjectEditor()"
        />
        <motion.div layout="position" :initial="{ opacity: 0, x: -4 }" :animate="{ opacity: 1, x: 0 }" v-for="project in projects" :key="project.id" :data-project-id="project.id" class="project-row group/project" :class="{ 'text-ink': projectId === project.id, 'hover:bg-hover': projectId !== project.id, 'pr-0 mobile:w-full': editorVisible && editingProjectId === project.id }">
          <motion.span v-if="projectId === project.id" class="project-selection" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.12, ease: 'easeOut' }" aria-hidden="true" />
          <ProjectNameEditor
            v-if="editorVisible && editingProjectId === project.id"
            :key="project.id"
            mode="rename"
            :name="project.name"
            :icon="project.icon"
            :open-icons="openIcons"
            @save="saveProject"
            @cancel="closeProjectEditor()"
          />
          <template v-else>
            <button type="button" class="project-icon-button" :class="{ 'text-accent': projectId === project.id }" :aria-label="`更换${project.name}的图标`" title="更换项目图标" @click="openProjectEditor(project.id, true)">
              <ProjectIcon :name="project.icon" />
            </button>
            <button
              class="nav-item"
              :disabled="loading"
              :class="{ 'text-ink': projectId === project.id }"
              :aria-current="projectId === project.id ? 'page' : undefined"
              @click="selectProject(project.id)"
            >
              <span class="project-name" :title="`${project.name} · 双击重命名`" @dblclick.stop="openProjectEditor(project.id)">{{ project.name }}</span>
              <span class="badge" title="未完成任务">{{ counts[project.id] }}</span>
            </button>
            <button type="button" class="project-rename" :aria-label="`重命名${project.name}`" title="重命名项目" @click="openProjectEditor(project.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15l-1 5Z" />
              </svg>
            </button>
          </template>
        </motion.div>
      </AnimatePresence>
    </nav>
    <div class="mt-auto pt-16px px-8px border-t border-t-solid border-edge">
      <div class="flex items-center gap-10px">
        <DefaultAvatar :seed="user?.email || displayName" />
        <div class="min-w-0 flex-1">
          <div class="text-13px font-medium truncate" :title="displayName">{{ displayName }}</div>
          <div class="text-12px text-muted truncate" :title="user?.email" :aria-busy="!user && saving">{{ user ? user.email : '仅保存在此浏览器' }}</div>
        </div>
        <button
          v-if="user"
          type="button"
          class="ui-icon ui-focus-ring w-32px h-32px shrink-0 text-muted hover:bg-hover hover:text-ink disabled:opacity-50 disabled:cursor-wait mobile:w-36px mobile:h-36px"
          :disabled="busy"
          :aria-label="busy ? '正在退出…' : '退出登录'"
          :title="busy ? '正在退出…' : '退出登录'"
          @click="signOut"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 5H5v14h5M10 12h10m-4-4 4 4-4 4" />
          </svg>
        </button>
        <button v-else-if="configured" type="button" class="project-add shrink-0" aria-label="登录账号" title="登录账号" @click="showLogin">登录</button>
      </div>
      <GuestBackup v-if="localOnly" />
      <p v-if="authError" class="text-danger text-12px" role="alert">{{ authError }}</p>
    </div>
  </aside>
</template>
