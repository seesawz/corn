// ============================================================
// 日期工具与智能输入解析（Todoist 风格自然语言）
// ============================================================

export type Priority = 0 | 1 | 2 | 3

export interface Task {
  id: string
  projectId: string
  text: string
  done: boolean
  priority: Priority
  due: string | null          // 到期时间，YYYY-MM-DD
  starred: boolean
  tags: string[]
  position: number            // 项目内手动排序，越小越靠前（云端持久化）
  createdAt: number
  completedAt: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDaysStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function fmtStamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

/** 到期时间显示：今天 / 明天 / 后天 / M月D日 周X（跨年附年份） */
export function fmtDue(due: string): string {
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  const md = `${m}月${d}日 周${WEEKDAY_NAMES[date.getDay()]}`
  return y === now.getFullYear() ? md : `${y}年${md}`
}

/** 下一个周一（周一当天取 7 天后） */
export function nextMondayStr(): string {
  const d = new Date()
  const offset = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + offset)
  return toDateStr(d)
}

export interface ParsedInput {
  text: string
  priority: Priority
  due: string | null
  tags: string[]
}

/**
 * 从输入中提取：#标签、!优先级（!!! = P1）、日期（今天/明天/后天/M月D日、M/D、M-D）
 */
export function parseInput(raw: string): ParsedInput {
  let text = ` ${raw} `
  const res = { priority: 0 as Priority, due: null as string | null, tags: [] as string[] }

  // 标签
  text = text.replace(/\s#([^\s#]+)/g, (_, tag: string) => {
    res.tags.push(tag)
    return ' '
  })

  // 优先级：独立出现的 1~3 个 !
  const bangs = text.match(/\s(!{1,3})(?=\s)/)
  if (bangs) {
    res.priority = (4 - bangs[1].length) as Priority
    text = text.replace(bangs[0], ' ')
  }

  // 相对日期
  for (const [word, offset] of [['今天', 0], ['明天', 1], ['后天', 2]] as const) {
    const re = new RegExp(`\\s${word}(?=\\s)`)
    if (re.test(text)) {
      res.due = addDaysStr(offset)
      text = text.replace(re, ' ')
      break
    }
  }

  // 到期时间：10月12日 / 10/12 / 10-12（当年）
  if (!res.due) {
    const abs = text.match(/\s(\d{1,2})[月\/\-](\d{1,2})日?(?=\s)/)
    if (abs) {
      const m = +abs[1], d = +abs[2]
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const y = new Date().getFullYear()
        const s = `${y}-${pad(m)}-${pad(d)}`
        res.due = s
        text = text.replace(abs[0], ' ')
      }
    }
  }

  res.text = text.replace(/\s+/g, ' ').trim()
  return res
}
