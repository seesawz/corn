import type { Task } from './parse.ts'
import type { Project } from '../composables/useTasks.ts'
import { isProjectIcon } from './projectIcons.ts'

export interface BackupWorkspace { tasks: Task[], projects: Project[], lastProjectId: string }
export interface Backup { app: 'corn', version: 1, exportedAt: string, workspace: BackupWorkspace }
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function number(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function invalid(): never { throw new Error('备份内容不完整或格式不正确，请选择 corn 导出的 JSON 文件。') }

export function createBackup(workspace: BackupWorkspace): string {
  const backup: Backup = { app: 'corn', version: 1, exportedAt: new Date().toISOString(), workspace }
  return JSON.stringify(backup, null, 2)
}

export function parseBackup(source: string): BackupWorkspace {
  let data: unknown
  try { data = JSON.parse(source) } catch { return invalid() }
  if (!object(data) || data.app !== 'corn') invalid()
  if (data.version !== 1) throw new Error('暂不支持这个备份版本，请使用当前版本 corn 导出的文件。')
  if (!text(data.exportedAt) || !Number.isFinite(Date.parse(data.exportedAt)) || !object(data.workspace)) invalid()
  const workspace = data.workspace
  if (!Array.isArray(workspace.projects) || !Array.isArray(workspace.tasks)) invalid()
  const projectIds = new Set<string>()
  const projects = workspace.projects.map((project: unknown): Project => {
    if (!object(project) || !text(project.id) || !text(project.name) || !isProjectIcon(project.icon) || projectIds.has(project.id)) invalid()
    projectIds.add(project.id)
    return { id: project.id, name: project.name, icon: project.icon }
  })
  if (!projectIds.has('inbox') || !text(workspace.lastProjectId) || !projectIds.has(workspace.lastProjectId)) invalid()
  const taskIds = new Set<string>()
  const tasks = workspace.tasks.map((task: unknown): Task => {
    if (!object(task) || !text(task.id) || taskIds.has(task.id)
      || !text(task.projectId) || !projectIds.has(task.projectId) || !text(task.text)
      || typeof task.done !== 'boolean' || typeof task.starred !== 'boolean'
      || ![0, 1, 2, 3].includes(task.priority as number)
      || !(task.due === null || (typeof task.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.due)))
      || !Array.isArray(task.tags) || !task.tags.every(tag => typeof tag === 'string')
      || !number(task.position) || !number(task.createdAt) || task.createdAt < 0
      || !(task.completedAt === null || (number(task.completedAt) && task.completedAt >= 0))) invalid()
    taskIds.add(task.id)
    return { id: task.id, projectId: task.projectId, text: task.text, done: task.done, starred: task.starred,
      priority: task.priority as Task['priority'], due: task.due as Task['due'], tags: task.tags as string[],
      position: task.position, createdAt: task.createdAt, completedAt: task.completedAt as number | null }
  })
  return { projects, tasks, lastProjectId: workspace.lastProjectId }
}

export function mergeBackup(current: BackupWorkspace, incoming: BackupWorkspace) {
  const projectIds = new Set(current.projects.map(project => project.id))
  const taskIds = new Set(current.tasks.map(task => task.id))
  const addedProjects = incoming.projects.filter(project => !projectIds.has(project.id))
  const addedTasks = incoming.tasks.filter(task => !taskIds.has(task.id))
  const positions = new Map<string, number>()
  const tasks = [...current.tasks, ...addedTasks].map(task => {
    const position = positions.get(task.projectId) ?? 0
    positions.set(task.projectId, position + 1)
    return { ...task, tags: [...task.tags], position }
  })
  return { workspace: { projects: [...current.projects, ...addedProjects], tasks, lastProjectId: current.lastProjectId },
    addedProjects: addedProjects.length, addedTasks: addedTasks.length, skippedTasks: incoming.tasks.length - addedTasks.length }
}
