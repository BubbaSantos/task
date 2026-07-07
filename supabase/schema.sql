-- Run this in the Supabase SQL editor (Dashboard → SQL editor → New query)

create table public.todo_tasks (
  id           text        primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  category_id  text        not null default 'personal',
  due_date     date,
  notes        text        not null default '',
  completed    boolean     not null default false,
  created_at   timestamptz not null default now()
);

-- Each user can only read/write their own rows
alter table public.todo_tasks enable row level security;

create policy "users manage their own todo_tasks"
  on public.todo_tasks
  for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
