-- Run this in the Supabase SQL editor (Dashboard → SQL editor → New query)
-- Drop old auth-based table if it exists
drop table if exists public.todo_tasks;

-- Code-based table: anyone who knows the task_code can read/write
create table public.todo_tasks (
  id           text        primary key,
  task_code    text        not null,
  title        text        not null,
  category_id  text        not null default 'personal',
  due_date     date,
  notes        text        not null default '',
  completed    boolean     not null default false,
  tags         text[]      not null default '{}',
  created_at   timestamptz not null default now()
);

create index todo_tasks_code_idx on public.todo_tasks (task_code);

alter table public.todo_tasks enable row level security;

-- Anon key can read/write any row; code acts as the shared secret
create policy "code-based access"
  on public.todo_tasks
  for all
  to anon
  using (true)
  with check (true);
