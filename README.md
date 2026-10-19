# corn

以 [Claude Code 桌面端](https://claude.com/claude-code)设计风格打造的待办清单应用。

**技术栈：Nuxt 4（SPA 静态生成）+ UnoCSS + Supabase（PostgreSQL）+ pnpm**，零自定义后端，可通过 GitHub Pages 免费托管。

## 功能模块

参考市面优秀待办应用（**Todoist** / **Things 3** / **Microsoft To Do**）提炼：

| 模块 | 参考对象 | 说明 |
|---|---|---|
| 🧠 智能输入解析 | Todoist | `明天 交房租 !! #生活` → 自动识别日期（今天/明天/后天/M月D日）、优先级（`!`~`!!!`）、标签，输入时实时预览 |
| 🚩 优先级 | Todoist P1–P3 | 红/橙/蓝三色旗帜 |
| 📅 到期时间 | — | 输入的日期作为到期时间；点击任务日期打开 Popover 日历，支持快捷项与任意日期设置、修改、清除；记录创建与完成时间；不按日期筛选或标记逾期 |
| ⭐ 星标 | Microsoft To Do | 项目内任务星标 |
| 🗂 项目 | — | 收件箱、新建与重命名项目、移动任务；徽标显示未完成数量 |
| 🔍 搜索 / ⌨️ 快捷键 | 各家标配 | `Ctrl+F` 呼出当前项目搜索、`N` 新任务、`Esc` 关闭搜索 |
| ↩️ 撤销 / ✏️ 双击编辑 / ↕️ 拖拽排序 | 各家标配 | 删除 Toast 5 秒可撤销；项目内未搜索时可拖拽 |
| 🌗 深浅色主题 | Claude Code 桌面端 | 跟随系统 + 手动切换记忆 |

动画组件库使用 [Motion for Vue](https://motion.dev/docs/vue)，覆盖项目切换、列表增删与排序、行内编辑、搜索和按钮反馈，并尊重系统减少动态效果偏好。

## 本地数据备份

访客模式下，侧边栏底部提供“导出备份”和“导入备份”。JSON 文件包含所有项目、图标、任务状态、日期、标签和排序；文件不包含登录凭据，也不会上传到云端。

导入会合并本地数据，保留已有项目和任务；重复导入同一份备份不会重复添加。已有记录以当前浏览器中的内容为准，新任务追加到所属项目。文件会先完整校验并保存成功，再更新界面；格式错误或保存失败不改变已有数据。支持当前版本 corn 导出的 JSON 文件，最大 10 MB。

浏览器数据按站点隔离。上线到新域名或端口前，先从原地址导出，再在新地址导入；GitHub Pages 同一域名下的路径改名不改变存储来源。

## 数据库（Supabase）

- GitHub OAuth 登录，Supabase 自动创建账号、维护会话。
- 数据表 `tasks` 和 `projects` 使用 `user_id` 关联 Supabase Auth 用户；RLS 根据 JWT 中的 `auth.uid()` 校验所有读写，匿名用户无权访问。
- 本地缓存按用户 UUID 分区；退出或换号时清空内存、搜索、撤销状态，过期请求不再更新界面。
- 可选择“暂不登录，本地使用”：访客任务和项目写入 IndexedDB（`aster-todo` → `workspaces` → `guest`），仅保存在此浏览器；旧访客 localStorage 数据会一次性迁移。
- 登录账号后使用独立的云端空间与按用户 UUID 分区的缓存，不自动导入访客数据；云端异常时仅显示当前账号缓存并暂停编辑。未配置 Supabase 时直接使用访客模式。
- 访客和登录用户均显示默认头像，访客可随时返回登录入口。
- 旧访客数据保留为 `user_id = NULL`，不会自动导入任意新账号。原 `owner` 列仅兼容旧主键，不再充当认证依据。
- 初始化或升级已有数据库：Supabase 控制台 → SQL Editor → 执行 [`supabase/schema.sql`](./supabase/schema.sql)。脚本在事务内移除旧请求头策略，可重复执行。
- OAuth 应用、回调与部署配置见 [登录配置指南](./docs/auth-setup.md)。

### 配置

本地开发：复制 `.env.example` 为 `.env`，填入项目 URL 与 publishable key：

```
NUXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx
```

部署：在 GitHub 仓库 **Settings → Secrets and variables → Actions** 配置同名 Secrets，构建时注入。

## 开发

本地项目目录为 `corn`。为保留已有任务与设置，浏览器存储继续使用原有的 `aster.*` 键与 `aster-todo` 数据库名称。

```bash
pnpm install
pnpm dev        # 开发服务器：http://localhost:3000/corn/
pnpm test       # 项目功能、账号切换隔离、真实 PostgreSQL RLS（Node.js 22.6+）
pnpm generate   # 静态生成到 .output/public
```

## 部署（GitHub Pages）

`.github/workflows/deploy.yml` 会在 push 到 main 时自动构建部署。首次使用需：

1. 仓库 **Settings → Pages** → Source 切换为 **GitHub Actions**
2. 配置上面的两个 Secrets

## 设计语言

样式统一由 UnoCSS 管理：`uno.config.ts` 定义主题令牌与组件 shortcuts，Vue 模板用工具类表达选中、完成、悬停和响应式状态；不保留独立 CSS 文件。

项目导航与新建流程遵循 [Claude Code Desktop 风格设计指南](./docs/claude-code-desktop-design-guide.md)。

暖奶油色背景 + 赤陶橙（`#D97757`）强调、Noto Sans SC 可变字体（本地加载，SIL OFL 1.1 免费商用授权）、发丝边框、对话式输入框，响应式适配移动端。

## Roadmap

- 子任务清单（Things 3 checklist）
- 多端数据冲突合并策略（当前为云端覆盖本地）

字体通过 `@fontsource-variable/noto-sans-sc` 随项目构建，按字符范围加载 WOFF2 文件；标题字重统一为 600。授权文件见 [`public/fonts/NotoSansSC-OFL.txt`](./public/fonts/NotoSansSC-OFL.txt)。
