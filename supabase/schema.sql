-- ============================================================
-- corn · Supabase 数据表
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行本文件
-- ============================================================

begin;

create table if not exists public.tasks (
  id           uuid primary key,                -- 客户端生成的 uuid
  owner        text not null,                   -- 兼容旧主键；新数据与 user_id 相同
  project_id   text not null default 'inbox',
  text         text not null default '',
  done         boolean not null default false,
  priority     int not null default 0,          -- 0 无 / 1 高 / 2 中 / 3 低
  due          date,
  starred      boolean not null default false,
  tags         text[] not null default '{}',
  position     int not null default 0,          -- 项目内手动排序，越小越靠前；客户端整体重排
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- 升级已有任务：未分配项目的任务归入收件箱
alter table public.tasks add column if not exists project_id text not null default 'inbox';

-- 手动拖拽排序持久化：已有任务默认 0，前端按 (position asc, created_at desc) 排序，升级后行为不变
alter table public.tasks add column if not exists position int not null default 0;

create table if not exists public.projects (
  id         text not null,
  owner      text not null,
  name       text not null,
  icon       text not null default 'folder',
  created_at timestamptz not null default now(),
  primary key (owner, id)
);

alter table public.projects add column if not exists icon text not null default 'folder';

alter table public.projects enable row level security;
alter table public.tasks enable row level security;

-- Account isolation upgrade (also safe to run against an existing guest database).
-- Legacy rows keep user_id = NULL; never claim guest data based on a browser header.
-- owner is retained for the legacy projects primary key and backward compatibility.

alter table public.tasks add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.projects add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Remove insecure guest policies before granting authenticated access.
drop policy if exists "tasks scoped to owner header" on public.tasks;
drop policy if exists "projects scoped to owner header" on public.projects;
drop policy if exists "tasks scoped to authenticated user" on public.tasks;
drop policy if exists "projects scoped to authenticated user" on public.projects;

create policy "tasks scoped to authenticated user" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and owner = (select auth.uid())::text);
create policy "projects scoped to authenticated user" on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and owner = (select auth.uid())::text);

revoke all on public.tasks, public.projects from anon;
grant select, insert, update, delete on public.tasks, public.projects to authenticated;
create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists projects_user_id_idx on public.projects(user_id);

commit;
