import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { loadGuestWorkspace, saveGuestWorkspace } from '../app/utils/guestStorage.ts'
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { ref, computed } from 'vue'
import { parseInput, fmtDue, addDaysStr, nextMondayStr, toDateStr } from '../app/utils/parse.ts'

const storage = new Map()
Object.assign(globalThis, {
  ref, computed, parseInput,
  useRuntimeConfig: () => ({ public: { supabaseUrl: '', supabaseKey: '' } }),
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
})
const { useTasks } = await import('../app/composables/useTasks.ts')
const state = useTasks()

beforeEach(async () => {
  await loadGuestWorkspace()
  globalThis.indexedDB = new IDBFactory()
  storage.clear()
  state.localOnly.value = false // 重置访客标记，让持久化走 localStorage 路径
  state.tasks.value = []
  state.projects.value = [{ id: 'inbox', name: '收件箱', icon: 'folder' }]
  state.setProject('inbox')
})

test('旧任务归入收件箱，保留完成状态和记录日期', async () => {
  storage.set('aster.tasks', JSON.stringify([
    { id: 'old', text: '旧任务', due: '2020-01-01', done: true },
  ]))
  await state.initTasks()
  assert.equal(state.tasks.value[0].projectId, 'inbox')
  assert.equal(state.filtered.value[0].due, '2020-01-01')
  assert.equal(state.filtered.value[0].done, true)
})

test('星标（收藏）任务优先展示在列表前面，组内保持原有顺序', () => {
  state.setProject('inbox')
  state.addTask('普通任务一')
  state.addTask('普通任务二')
  state.addTask('重要任务') // 新任务插在最前，此时数组顺序为：重要任务、普通任务二、普通任务一
  state.toggleStar(state.tasks.value[2].id) // 给数组末尾的「普通任务一」加星标
  assert.deepEqual(state.filtered.value.map(t => t.text), ['普通任务一', '重要任务', '普通任务二'])
  state.toggleStar(state.tasks.value[2].id) // 取消星标后恢复原有顺序
  assert.deepEqual(state.filtered.value.map(t => t.text), ['重要任务', '普通任务二', '普通任务一'])
})

test('拖拽排序重排项目内 position，移入其他项目时置顶', () => {
  state.setProject('inbox')
  state.addTask('任务甲')
  state.addTask('任务乙')
  state.addTask('任务丙') // 新任务插在最前：数组顺序为丙、乙、甲
  const [bing, yi, jia] = state.tasks.value
  state.reorder(jia.id, bing.id, true) // 甲拖到最前
  assert.deepEqual(state.tasks.value.map(t => t.text), ['任务甲', '任务丙', '任务乙'])
  assert.deepEqual(state.tasks.value.map(t => t.position), [0, 1, 2])
  state.addProject('工作')
  state.moveTask(jia.id, state.projectId.value)
  assert.equal(jia.position, -1) // 移入空项目后置顶
})

test('任务按项目显示，过去和未来日期不影响可见性', () => {
  state.addTask('收件箱任务')
  state.addProject('工作')
  const workId = state.projectId.value
  state.addTask('工作任务')
  state.tasks.value[0].due = '2099-01-01'
  state.addTask('过去日期任务')
  state.tasks.value[0].due = '2000-01-01'
  assert.deepEqual(state.filtered.value.map(t => t.text), ['过去日期任务', '工作任务'])
  state.toggleDone(state.tasks.value[0].id)
  assert.equal(state.filtered.value.length, 2)
  assert.equal(state.counts.value[workId], 1)
  state.setProject('inbox')
  assert.deepEqual(state.filtered.value.map(t => t.text), ['收件箱任务'])
})

test('重命名、移动任务与项目归属在刷新后保留', async () => {
  state.addTask('需要移动')
  const taskId = state.tasks.value[0].id
  state.addProject('项目一')
  const projectId = state.projectId.value
  state.renameProject(projectId, '项目二')
  state.moveTask(taskId, projectId)
  state.tasks.value = []
  state.projects.value = []
  await state.initTasks()
  assert.equal(state.currentProject.value.name, '项目二')
  assert.equal(state.filtered.value[0].id, taskId)
  assert.equal(state.counts.value.inbox, 0)
})

test('刷新后恢复上次所在的项目，项目已删除时退回收件箱', async () => {
  state.addProject('工作')
  const workId = state.projectId.value
  state.addTask('工作任务')
  // 模拟刷新：内存状态归零后重新初始化
  state.tasks.value = []
  state.projects.value = [{ id: 'inbox', name: '收件箱', icon: 'folder' }]
  state.projectId.value = 'inbox'
  await state.initTasks()
  assert.equal(state.projectId.value, workId)
  assert.equal(state.currentProject.value.name, '工作')
  // 上次项目已不存在（如在其他设备被删除）时不再恢复
  await saveGuestWorkspace({ tasks: [], projects: [{ id: 'inbox', name: '收件箱', icon: 'folder' }], lastProjectId: workId })
  state.tasks.value = []
  state.projects.value = [{ id: 'inbox', name: '收件箱', icon: 'folder' }]
  state.projectId.value = 'inbox'
  await state.initTasks()
  assert.equal(state.projectId.value, 'inbox')
})

test('搜索限定当前项目，清除已完成不会删除其他项目任务', () => {
  state.addTask('相同任务')
  const inboxTaskId = state.tasks.value[0].id
  state.toggleDone(inboxTaskId)
  state.addProject('工作')
  state.addTask('相同任务')
  const workTaskId = state.tasks.value[0].id
  state.search.value = '相同'
  assert.deepEqual(state.filtered.value.map(t => t.id), [workTaskId])
  state.toggleDone(workTaskId)
  state.clearDone()
  assert.deepEqual(state.tasks.value.map(t => t.id), [inboxTaskId])
})

test('记录过去日期时保留当年，不按截止日期顺延到明年', () => {
  const parsed = parseInput('记录 1/1')
  assert.equal(parsed.due, `${new Date().getFullYear()}-01-01`)
  assert.equal(parsed.text, '记录')
})

test('到期时间显示：今天/明天/后天，周几与跨年', () => {
  assert.equal(fmtDue(toDateStr(new Date())), '今天')
  assert.equal(fmtDue(addDaysStr(1)), '明天')
  assert.equal(fmtDue(addDaysStr(2)), '后天')
  assert.equal(fmtDue('2000-01-01'), '2000年1月1日 周六')
})

test('下周一快捷项返回未来的周一', () => {
  const nm = nextMondayStr()
  const [y, m, d] = nm.split('-').map(Number)
  assert.equal(new Date(y, m - 1, d).getDay(), 1)
  assert.ok(nm > toDateStr(new Date()))
})

test('到期时间可设置、修改、清除并在刷新后保留', async () => {
  state.addTask('带日期任务')
  const id = state.tasks.value[0].id
  state.setDue(id, '2030-06-01')
  assert.equal(state.tasks.value[0].due, '2030-06-01')
  state.setDue(id, '2030-07-15')
  assert.equal(state.tasks.value[0].due, '2030-07-15')
  state.setDue(id, null)
  assert.equal(state.tasks.value[0].due, null)
  state.setDue(id, '2030-07-15')
  state.tasks.value = []
  await state.initTasks()
  assert.equal(state.filtered.value[0].due, '2030-07-15')
})

test('项目图标可选择、修改并在刷新后保留', async () => {
  state.addProject('工作', 'briefcase')
  const projectId = state.projectId.value
  assert.equal(state.currentProject.value.icon, 'briefcase')
  state.renameProject(projectId, '开发', 'code')
  state.renameProject(projectId, '开发计划')
  state.projects.value = []
  await state.initTasks()
  assert.equal(state.currentProject.value.icon, 'code')
  assert.equal(state.currentProject.value.name, '开发计划')
})

test('旧项目没有图标时使用文件夹，不改变任务归属', async () => {
  storage.set('aster.projects', JSON.stringify([{ id: 'inbox', name: '收件箱' }]))
  await state.initTasks()
  assert.equal(state.currentProject.value.icon, 'folder')
  state.addTask('已有项目的任务')
  assert.equal(state.filtered.value.length, 1)
})
