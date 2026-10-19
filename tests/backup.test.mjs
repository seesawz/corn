import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { ref, computed } from 'vue'
import { parseInput } from '../app/utils/parse.ts'
import { createBackup, parseBackup, mergeBackup } from '../app/utils/backup.ts'
import { loadGuestWorkspace } from '../app/utils/guestStorage.ts'

Object.assign(globalThis, {
  ref, computed, parseInput,
  useRuntimeConfig: () => ({ public: { supabaseUrl: '', supabaseKey: '' } }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
})
const { useTasks } = await import('../app/composables/useTasks.ts')
const state = useTasks()
const workspace = () => ({
  projects: [{ id: 'inbox', name: '收件箱', icon: 'folder' }, { id: 'work', name: '工作', icon: 'code' }],
  tasks: [{ id: 'one', projectId: 'work', text: '保留全部属性', done: true, priority: 2, due: '2026-10-20',
    starred: true, tags: ['测试'], position: 0, createdAt: 1760000000000, completedAt: 1760000000010 }],
  lastProjectId: 'work',
})

beforeEach(async () => {
  await loadGuestWorkspace().catch(() => {})
  globalThis.indexedDB = new IDBFactory()
  state.resetTasks()
})

test('备份完整往返保留项目、任务属性、图标和所在项目', () => {
  assert.deepEqual(parseBackup(createBackup(workspace())), workspace())
})

test('不支持的版本、重复标识、孤立任务和无效类型拒绝导入', () => {
  for (const change of [
    backup => { backup.version = 2 },
    backup => { backup.app = 'other' },
    backup => { backup.workspace.projects.push(backup.workspace.projects[0]) },
    backup => { backup.workspace.tasks.push(backup.workspace.tasks[0]) },
    backup => { backup.workspace.tasks[0].projectId = 'missing' },
    backup => { backup.workspace.tasks[0].done = 'true' },
    backup => { backup.workspace.projects[0].icon = 'unknown' },
    backup => { backup.workspace.lastProjectId = 'missing' },
  ]) {
    const backup = JSON.parse(createBackup(workspace()))
    change(backup)
    assert.throws(() => parseBackup(JSON.stringify(backup)))
  }
  assert.throws(() => parseBackup('{broken'))
})

test('合并保留已有数据，重复导入不重复添加，重编号不修改原对象', () => {
  const incoming = workspace()
  const current = { projects: [{ id: 'inbox', name: '已有收件箱', icon: 'home' }], tasks: [], lastProjectId: 'inbox' }
  const first = mergeBackup(current, incoming)
  assert.equal(first.addedTasks, 1)
  assert.equal(first.addedProjects, 1)
  assert.equal(first.workspace.projects[0].name, '已有收件箱')
  first.workspace.tasks[0].text = '本地修改'
  const second = mergeBackup(first.workspace, incoming)
  assert.equal(second.addedTasks, 0)
  assert.equal(second.skippedTasks, 1)
  assert.equal(second.workspace.tasks[0].text, '本地修改')
  assert.equal(incoming.tasks[0].text, '保留全部属性')
})

test('首次空库可编辑，导入原子保存，重新初始化后仍能导出完整备份', async () => {
  await state.initTasks()
  assert.equal(state.writable.value, true)
  assert.equal(state.mode.value, 'local')
  await state.importGuestBackup(createBackup(workspace()))
  assert.equal((await loadGuestWorkspace()).tasks[0].text, '保留全部属性')
  await state.initTasks()
  const exported = parseBackup(state.exportGuestBackup())
  assert.deepEqual(exported.tasks, workspace().tasks)
  assert.equal(exported.projects[1].icon, 'code')
  const repeated = await state.importGuestBackup(createBackup(workspace()))
  assert.equal(repeated.addedTasks, 0)
  assert.equal(state.tasks.value.length, 1)
})

test('文件验证或 IndexedDB 保存失败不修改当前任务', async () => {
  await state.initTasks()
  state.addTask('已有任务')
  await loadGuestWorkspace()
  const original = state.exportGuestBackup()
  await assert.rejects(state.importGuestBackup('bad json'))
  assert.deepEqual(parseBackup(state.exportGuestBackup()), parseBackup(original))
  globalThis.indexedDB = { open() { throw new Error('模拟存储失败') } }
  await assert.rejects(state.importGuestBackup(createBackup(workspace())), /模拟存储失败/)
  assert.deepEqual(parseBackup(state.exportGuestBackup()), parseBackup(original))
  assert.equal(state.loading.value, false)
})

test('导入过程中切换账号不把访客任务写入新空间，非访客不能导入导出', async () => {
  await state.initTasks()
  const importing = state.importGuestBackup(createBackup(workspace()))
  state.resetTasks()
  await assert.rejects(importing, /访客空间/)
  assert.equal(state.tasks.value.length, 0)
  assert.equal((await loadGuestWorkspace()).tasks.length, 1)
  assert.throws(() => state.exportGuestBackup(), /访客模式/)
  await assert.rejects(state.importGuestBackup(createBackup(workspace())), /访客模式/)
})

test('导入保存期间切换项目不会把旧快照覆盖回本地', async () => {
  await state.initTasks()
  const importing = state.importGuestBackup(createBackup(workspace()))
  state.setProject('work')
  await importing
  const saved = await loadGuestWorkspace()
  assert.equal(saved.tasks.length, 1)
  assert.equal(saved.tasks[0].text, '保留全部属性')
  assert.equal(state.projectId.value, 'inbox')
})
