# GitHub 登录配置

本项目使用 Supabase Auth + PKCE，回到应用首页完成授权码交换，适用于 GitHub Pages 的静态子路径。账号由 Supabase 用户 UUID 标识，Todo 和项目均按该 UUID 隔离，不以邮箱、用户名或前端传入的 owner 作为可信认证依据。

访客可选择“暂不登录，本地使用”，任务和项目以同一快照存储在 IndexedDB 的 `aster-todo/workspaces/guest`。选择会在刷新后保留；从侧边栏点击“登录账号”可返回登录页。登录账号与访客空间相互独立，不自动合并或上传访客数据。两种模式均显示默认头像。

访客旧的 `aster.tasks` / `aster.projects`（或 `claude-todo.*`）会在首次打开访客空间时迁移到 IndexedDB；迁移成功后以 IndexedDB 为准，账号分区缓存不会参与迁移。IndexedDB 读写失败时提示错误并暂停编辑。

## 1. 数据库升级

在 Supabase 项目 `lhlhwzijxacgiosussjt` 的 SQL Editor 执行整个 `supabase/schema.sql`。可用于新建和升级已有数据库，可重复执行。

脚本增加 `user_id` 外键、创建缺失的 projects 表、删除旧的 `x-owner-id` 策略，只允许 authenticated 角色通过 `auth.uid()` 读写自己的记录。旧任务保持原样，`user_id` 为空的访客数据不向新账号开放。不要将浏览器中的旧 owner 直接当作新用户身份，也不要恢复旧 RLS 策略。

部署新前端之前先执行数据库脚本。升级后旧版匿名客户端不能继续访问云端，这是预期行为。若需迁移旧数据，应由管理员核实归属后操作；不会自动认领或删除旧数据。

## 2. GitHub 登录

在 GitHub → Settings → Developer settings → OAuth Apps 创建应用：

- Homepage URL：`https://seesawz.github.io/corn/`（若使用其他域名，以实际部署地址为准）。
- Authorization callback URL：`https://lhlhwzijxacgiosussjt.supabase.co/auth/v1/callback`。

在 Supabase → Authentication → Sign In / Providers → GitHub 启用提供商，填写该 OAuth App 的 Client ID 和 Client Secret 并保存。Secret 仅放 Supabase 后台，不放前端环境变量或 Git 仓库。

## 3. Supabase 的应用回跳地址

在 Authentication → URL Configuration 设置：

- Site URL：`https://seesawz.github.io/corn/`。
- Redirect URLs：添加 `https://seesawz.github.io/corn/`、`http://localhost:3000/corn/`。
- 若使用 `127.0.0.1`、其他端口或自定义域名，添加完全匹配的地址，包含 `/corn/` 与结尾斜线。

GitHub 的 callback 是 Supabase 地址；Supabase 的 Redirect URLs 才是本应用地址，两者用途不同。

## 4. 本地与部署

本地 `.env`（已加入 Git 忽略）需要 `NUXT_PUBLIC_SUPABASE_URL` 和 `NUXT_PUBLIC_SUPABASE_KEY`，公钥使用 publishable key。运行 `pnpm install`、`pnpm dev` 后打开 `http://localhost:3000/corn/`。

GitHub Actions 构建不会读取本地 `.env`。请在仓库 Settings → Secrets and variables → Actions 配置同名的两个 Secrets。随后 `pnpm generate` 的产物可通过已有工作流部署到 GitHub Pages。

## 5. 验证

- `pnpm test`：项目功能、匿名禁止写入、用户缓存隔离、换号后查询/写入响应失效、退出清空撤销状态，以及在 PGlite PostgreSQL 中实际执行的 RLS 越权测试。
- `pnpm generate`：验证静态构建。
- `pnpm exec playwright install chromium` 后运行 `pnpm test:e2e`：浏览器验证 PKCE 跳转与回调、刷新恢复、跨标签退出、移动端及异常重连。测试使用模拟的认证与数据接口，不替代真实提供商授权验收。
- 启用提供商后，用 GitHub 完成真实授权，刷新页面确认会话恢复，退出后确认返回登录页。
- 使用两个不同的 Supabase 用户 UUID 分别创建任务和同名项目，验证看不到对方的数据。
- 可用两个浏览器标签页检查同一浏览器退出同步，并测试取消授权后可重试。

云端同步失败时保留当前账号缓存并暂停编辑。点击重新连接会从云端重新读取，失败写入的本地改动可能被覆盖；此版本没有离线写入队列或冲突合并。缓存提供账号间逻辑隔离，不是设备上的加密存储。

参考：[Supabase GitHub 登录](https://supabase.com/docs/guides/auth/social-login/auth-github)、[行级安全](https://supabase.com/docs/guides/database/postgres/row-level-security)。
