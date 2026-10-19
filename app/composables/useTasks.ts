// ============================================================
// 数据层：任务状态、视图过滤、增删改查
// 同步策略：配置了 Supabase → 云端为主 + localStorage 缓存；
//          访客 → IndexedDB；云端失败 → 当前账号缓存只读
// ============================================================
import { type SupabaseClient } from '@supabase/supabase-js'
import type { Priority, Task } from '~/utils/parse'
import { isProjectIcon, type ProjectIconName } from '../utils/projectIcons.ts'
import { loadGuestWorkspace, saveGuestWorkspace } from '../utils/guestStorage.ts'

export interface Project { id: string, name: string, icon: ProjectIconName }
export type ConnMode = 'local' | 'cloud' | 'error'

const STORAGE_KEY = 'aster.tasks'
const PROJECTS_KEY = 'aster.projects'
const LAST_PROJECT_KEY = 'aster.lastProject' // 记住上次所在项目，刷新后恢复
const LEGACY_PREFIX = 'claude-todo.' // 旧版存储 key，读取时兼容迁移
const INBOX: Project = { id: 'inbox', name: '收件箱', icon: 'folder' }

// ---------- 模块级单例状态（所有组件共享） ----------
const tasks = ref<Task[]>([])
const projects = ref<Project[]>([{ ...INBOX }])
const projectId = ref(INBOX.id)
const search = ref('')
const mode = ref<ConnMode>('local')   // 当前数据模式
const syncError = ref<string | null>(null)
const toastVisible = ref(false)
const toastText = ref('')
let undoState: { task: Task, index: number } | null = null
let undoTimer: ReturnType<typeof setTimeout> | null = null

let client: SupabaseClient | null = null
let ownerId = ''
let generation = 0
const loading = ref(false)
const localOnly = ref(false)
const saving = ref(false)
let pendingGuestWrites = 0
const writable = computed(() => !loading.value && (mode.value === 'local' || mode.value === 'cloud'))

function cloudConfigured(): boolean {
  const cfg = useRuntimeConfig()
  return !!(cfg.public.supabaseUrl && cfg.public.supabaseKey)
}

// ---------- 数据库行 ↔ Task 映射 ----------
interface DbTask {
  id: string
  owner: string
  user_id: string
  project_id: string
  text: string
  done: boolean
  priority: number
  due: string | null
  starred: boolean
  tags: string[] | null
  position: number
  created_at: string
  completed_at: string | null
}

function fromDb(row: DbTask): Task {
  return {
    id: row.id,
    projectId: row.project_id || INBOX.id,
    text: row.text ?? '',
    done: !!row.done,
    priority: ([1, 2, 3].includes(row.priority) ? row.priority : 0) as Priority,
    due: row.due ?? null,
    starred: !!row.starred,
    tags: row.tags ?? [],
    position: Number.isFinite(row.position) ? row.position : 0,
    createdAt: new Date(row.created_at).getTime() || Date.now(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
  }
}

function toDb(t: Task): DbTask {
  return {
    id: t.id,
    owner: ownerId,
    user_id: ownerId,
    project_id: t.projectId,
    text: t.text,
    done: t.done,
    priority: t.priority,
    due: t.due,
    starred: t.starred,
    tags: t.tags,
    position: t.position,
    created_at: new Date(t.createdAt).toISOString(),
    completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null,
  }
}

// ---------- 本地持久化 ----------
function storageKey(key: string) {
  return ownerId ? `${key}.user.${ownerId}` : key
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(storageKey(STORAGE_KEY)) ?? (!ownerId ? localStorage.getItem(LEGACY_PREFIX + 'tasks') : null)
    const data = raw ? JSON.parse(raw) : []
    if (Array.isArray(data)) tasks.value = data.map(normalize)
    const savedProjects = localStorage.getItem(storageKey(PROJECTS_KEY)) ?? (!ownerId ? localStorage.getItem(LEGACY_PREFIX + 'projects') : null)
    if (savedProjects) projects.value = JSON.parse(savedProjects).map(normalizeProject)
    ensureInbox()
    const savedProjectId = localStorage.getItem(storageKey(LAST_PROJECT_KEY))
    if (savedProjectId && projects.value.some(p => p.id === savedProjectId)) projectId.value = savedProjectId
  } catch { /* ignore */ }
}

function saveLocal() {
  if (localOnly.value) {
    const requestGeneration = generation
    pendingGuestWrites++
    saving.value = true
    void saveGuestWorkspace({ tasks: tasks.value, projects: projects.value, lastProjectId: projectId.value }).catch(() => {
      if (requestGeneration !== generation) return
      mode.value = 'error'
      syncError.value = '本地数据保存失败，请检查浏览器存储权限后重试。'
    }).finally(() => {
      if (requestGeneration !== generation) return
      pendingGuestWrites--
      saving.value = pendingGuestWrites > 0
    })
    return
  }
  try {
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(tasks.value))
    localStorage.setItem(storageKey(PROJECTS_KEY), JSON.stringify(projects.value))
    localStorage.setItem(storageKey(LAST_PROJECT_KEY), projectId.value)
  } catch { /* ignore */ }
}

function normalize(t: Partial<Task>): Task {
  return {
    id: t.id || crypto.randomUUID(),
    projectId: t.projectId || INBOX.id,
    text: String(t.text || ''),
    done: !!t.done,
    priority: ([1, 2, 3].includes(t.priority as number) ? t.priority : 0) as Priority,
    due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
    starred: !!t.starred,
    tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
    position: Number.isFinite(t.position) ? t.position : 0,
    createdAt: t.createdAt || Date.now(),
    completedAt: t.completedAt ?? null,
  }
}

// ---------- 初始化（在 onMounted 中调用） ----------
function resetTasks() {
  generation++
  client = null
  ownerId = ''
  tasks.value = []
  projects.value = [{ ...INBOX }]
  projectId.value = INBOX.id
  search.value = ''
  loading.value = false
  localOnly.value = false
  saving.value = false
  pendingGuestWrites = 0
  mode.value = 'error'
  syncError.value = null
  if (undoTimer) clearTimeout(undoTimer)
  undoTimer = null
  hideToast()
}

async function initTasks(authClient: SupabaseClient | null = null, userId = '', guest = false) {
  // Reset synchronously so account changes never show the previous user's data.
  const previousProject = ownerId === userId ? projectId.value : INBOX.id
  resetTasks()
  if (!authClient || !userId) {
    if (guest || !cloudConfigured()) {
      localOnly.value = true
      loading.value = true
      const requestGeneration = generation
      try {
        const snapshot = await loadGuestWorkspace()
        if (requestGeneration !== generation) return
        if (snapshot) {
          tasks.value = Array.isArray(snapshot.tasks) ? snapshot.tasks.map(t => normalize(t as Task)) : []
          projects.value = Array.isArray(snapshot.projects) ? snapshot.projects.map(p => normalizeProject(p as Project)) : []
          ensureInbox()
        } else {
          // Only unscoped legacy visitor data is migrated. Never read account caches.
          loadLocal()
          await saveGuestWorkspace({ tasks: tasks.value, projects: projects.value, lastProjectId: projectId.value })
          if (requestGeneration !== generation) return
        }
        mode.value = 'local'
        const restoredProjectId = typeof snapshot.lastProjectId === 'string' ? snapshot.lastProjectId : previousProject
        if (projects.value.some(p => p.id === restoredProjectId)) projectId.value = restoredProjectId
      } catch {
        if (requestGeneration !== generation) return
        syncError.value = '无法打开本地数据，请检查浏览器存储权限后重试。'
      } finally {
        if (requestGeneration === generation) loading.value = false
      }
    }
    return
  }
  client = authClient
  ownerId = userId
  const requestGeneration = generation
  projectId.value = previousProject // 缓存读取前先回到原位置，缓存里的记录会在 loadLocal 中覆盖
  loadLocal()
  loading.value = true
  try {
    // Auth listeners can fire under the SDK lock; start queries on the next turn.
    await new Promise(resolve => setTimeout(resolve, 0))
    if (requestGeneration !== generation) return
    const [taskResult, projectResult] = await Promise.all([
      // 手动排序持久化：按 position 排；旧数据 position 全为 0 时退回 created_at，行为与升级前一致
      authClient.from('tasks').select('*').eq('user_id', userId)
        .order('position', { ascending: true }).order('created_at', { ascending: false }),
      authClient.from('projects').select('id, name, icon').eq('user_id', userId).order('created_at'),
    ])
    if (requestGeneration !== generation) return
    if (taskResult.error) throw taskResult.error
    if (projectResult.error) throw projectResult.error
    tasks.value = (taskResult.data as DbTask[]).map(fromDb)
    projects.value = (projectResult.data as Project[]).map(normalizeProject)
    ensureInbox()
    // 云端数据可能来自其他设备：当前项目已被删除时才退回收件箱
    if (!projects.value.some(p => p.id === projectId.value)) projectId.value = INBOX.id
    mode.value = 'cloud'
    saveLocal()
  } catch (e) {
    if (requestGeneration !== generation) return
    mode.value = 'error'
    syncError.value = e instanceof Error ? e.message : (e as { message?: string }).message || String(e)
  } finally {
    if (requestGeneration === generation) loading.value = false
  }
}

// Failed cloud writes retain this account's cache; subsequent edits are blocked.
async function cloudWrite(fn: (c: SupabaseClient) => PromiseLike<unknown>) {
  if (!client || mode.value !== 'cloud' || !ownerId) return
  const requestGeneration = generation
  try {
    const { error } = await fn(client) as { error: { message: string } | null }
    if (requestGeneration !== generation) return
    if (error) throw new Error(error.message)
  } catch (e) {
    if (requestGeneration !== generation) return
    mode.value = 'error'
    syncError.value = e instanceof Error ? e.message : String(e)
  }
}

// ---------- 项目与任务列表 ----------
function normalizeProject(project: Project): Project {
  return { ...project, icon: isProjectIcon(project.icon) ? project.icon : 'folder' }
}

function ensureInbox() {
  if (!projects.value.some(p => p.id === INBOX.id)) projects.value.unshift({ ...INBOX })
}

const currentProject = computed(() => projects.value.find(p => p.id === projectId.value)!)
const projectTasks = computed(() => tasks.value.filter(t => t.projectId === projectId.value))
const filtered = computed<Task[]>(() => {
  const q = search.value.trim().toLowerCase()
  return projectTasks.value.filter(t => !q || t.text.toLowerCase().includes(q)
    || t.tags.some(tag => tag.toLowerCase().includes(q)))
    // 收藏（星标）任务优先展示，排序稳定，组内保持原有（手动拖拽）顺序
    .sort((a, b) => Number(b.starred) - Number(a.starred))
})
const counts = computed(() => Object.fromEntries(projects.value.map(p => [
  p.id, tasks.value.filter(t => t.projectId === p.id && !t.done).length,
])))
const completedCount = computed(() => projectTasks.value.filter(t => t.done).length)
const viewTitle = computed(() => currentProject.value.name)

function setProject(id: string) {
  projectId.value = id
  search.value = ''
  saveLocal() // 立即记住项目位置，切换后马上刷新也能恢复
}

function addProject(name: string, icon: ProjectIconName = 'folder'): boolean {
  if (!writable.value) return false
  const trimmed = name.trim()
  if (!trimmed) return false
  const project = { id: crypto.randomUUID(), name: trimmed, icon }
  projects.value.push(project)
  setProject(project.id)
  saveLocal()
  cloudWrite(c => c.from('projects').insert({ ...project, owner: ownerId, user_id: ownerId }))
  return true
}

function renameProject(id: string, name: string, icon?: ProjectIconName): boolean {
  if (!writable.value) return false
  const project = projects.value.find(p => p.id === id)
  const trimmed = name.trim()
  if (!project || !trimmed) return false
  project.name = trimmed
  if (icon) project.icon = icon
  saveLocal()
  cloudWrite(c => c.from('projects').upsert({ ...project, owner: ownerId, user_id: ownerId }))
  return true
}

// 项目内「置顶」位置：取该项目最小 position - 1（空项目或旧数据全为 0 时即 -1）
function topPosition(targetProjectId: string, excludeId = ''): number {
  return Math.min(0, ...tasks.value.filter(t => t.projectId === targetProjectId && t.id !== excludeId).map(t => t.position)) - 1
}

// ---------- 操作 ----------
function addTask(raw: string): boolean {
  if (!writable.value) return false
  const p = parseInput(raw)
  if (!p.text && p.tags.length === 0) return false
  const t = normalize({ ...p, projectId: projectId.value, createdAt: Date.now() })
  t.position = topPosition(t.projectId)
  tasks.value.unshift(t)
  saveLocal()
  cloudWrite(c => c.from('tasks').insert(toDb(t)))
  return true
}

function moveTask(id: string, targetProjectId: string) {
  if (!writable.value) return
  const task = tasks.value.find(t => t.id === id)
  if (!task || !projects.value.some(p => p.id === targetProjectId)) return
  task.projectId = targetProjectId
  task.position = topPosition(targetProjectId, id) // 移入后置顶
  saveLocal()
  cloudWrite(c => c.from('tasks').update({ project_id: targetProjectId, position: task.position }).eq('user_id', ownerId).eq('id', id))
}

function toggleDone(id: string) {
  if (!writable.value) return
  const t = tasks.value.find(t => t.id === id)
  if (!t) return
  t.done = !t.done
  t.completedAt = t.done ? Date.now() : null
  saveLocal()
  cloudWrite(c => c.from('tasks').update({ done: t.done, completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null }).eq('user_id', ownerId).eq('id', id))
}

function toggleStar(id: string) {
  if (!writable.value) return
  const t = tasks.value.find(t => t.id === id)
  if (!t) return
  t.starred = !t.starred
  saveLocal()
  cloudWrite(c => c.from('tasks').update({ starred: t.starred }).eq('user_id', ownerId).eq('id', id))
}

function setDue(id: string, due: string | null) {
  if (!writable.value) return
  const t = tasks.value.find(t => t.id === id)
  if (!t || t.due === due) return
  t.due = due
  saveLocal()
  cloudWrite(c => c.from('tasks').update({ due }).eq('user_id', ownerId).eq('id', id))
}

function saveEdit(id: string, text: string) {
  if (!writable.value) return
  const t = tasks.value.find(t => t.id === id)
  if (!t) return
  t.text = text
  saveLocal()
  cloudWrite(c => c.from('tasks').update({ text }).eq('user_id', ownerId).eq('id', id))
}

function removeTask(id: string) {
  if (!writable.value) return
  const index = tasks.value.findIndex(t => t.id === id)
  if (index < 0) return
  const [task] = tasks.value.splice(index, 1)
  saveLocal()
  cloudWrite(c => c.from('tasks').delete().eq('user_id', ownerId).eq('id', id))

  // 撤销 Toast
  undoState = { task, index }
  toastText.value = `已删除「${task.text || '（无文本）'}」`
  toastVisible.value = true
  if (undoTimer) clearTimeout(undoTimer)
  undoTimer = setTimeout(hideToast, 5000)
}

function undoRemove() {
  if (!writable.value) return
  if (!undoState) return
  const { task, index } = undoState
  tasks.value.splice(Math.min(index, tasks.value.length), 0, task)
  saveLocal()
  renumber(task) // upsert 同时完成恢复写入，并保证项目内 position 与新顺序一致
  hideToast()
}

function hideToast() {
  toastVisible.value = false
  undoState = null
}

function clearDone() {
  if (!writable.value) return
  const removedIds = projectTasks.value.filter(t => t.done).map(t => t.id)
  if (!removedIds.length) return
  tasks.value = tasks.value.filter(t => !removedIds.includes(t.id))
  saveLocal()
  cloudWrite(c => c.from('tasks').delete().eq('user_id', ownerId).in('id', removedIds))
}

// 项目内按当前数组顺序重排 position；云端整体 upsert，刷新后顺序保留
function renumber(task: Task) {
  const siblings = tasks.value.filter(t => t.projectId === task.projectId)
  siblings.forEach((t, i) => { t.position = i })
  cloudWrite(c => c.from('tasks').upsert(siblings.map(toDb)))
}

function reorder(dragId: string, targetId: string, before: boolean) {
  if (!writable.value) return
  const from = tasks.value.findIndex(t => t.id === dragId)
  if (from < 0) return
  const [item] = tasks.value.splice(from, 1)
  let to = tasks.value.findIndex(t => t.id === targetId)
  if (to < 0) tasks.value.push(item)
  else {
    if (!before) to += 1
    tasks.value.splice(to, 0, item)
  }
  saveLocal()
  renumber(item)
}

export function useTasks() {
  return {
    // 状态
    tasks, projects, projectId, currentProject, search, filtered, counts, completedCount, viewTitle,
    toastVisible, toastText, mode, syncError, loading, writable, localOnly, saving,
    // 动作
    initTasks, resetTasks, setProject, addProject, renameProject, moveTask, addTask, toggleDone, toggleStar, saveEdit,
    removeTask, undoRemove, hideToast, clearDone, reorder, setDue,
  }
}
