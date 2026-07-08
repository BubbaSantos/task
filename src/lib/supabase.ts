import { createClient } from '@supabase/supabase-js';
import type { Task, Category } from '../types';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

interface TaskRow {
  id: string;
  task_code: string;
  title: string;
  category_id: string;
  due_date: string | null;
  notes: string;
  completed: boolean;
  tags: string[];
  created_at: string;
}

export function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    categoryId: row.category_id as string,
    dueDate: (row.due_date ?? null) as string | null,
    notes: (row.notes ?? '') as string,
    completed: row.completed as boolean,
    tags: (row.tags as string[]) ?? [],
    createdAt: (row.created_at ?? new Date().toISOString()) as string,
  };
}

function toRow(task: Task, code: string): Omit<TaskRow, 'created_at'> {
  return {
    id: task.id,
    task_code: code,
    title: task.title,
    category_id: task.categoryId,
    due_date: task.dueDate,
    notes: task.notes,
    completed: task.completed,
    tags: task.tags,
  };
}

export async function dbFetchTasks(code: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('todo_tasks')
    .select('*')
    .eq('task_code', code)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TaskRow[]).map(r => rowToTask(r as unknown as Record<string, unknown>));
}

export async function dbUpsertTask(task: Task, code: string): Promise<void> {
  const { error } = await supabase
    .from('todo_tasks')
    .upsert(toRow(task, code), { onConflict: 'id' });
  if (error) throw error;
}

export async function dbDeleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('todo_tasks').delete().eq('id', id);
  if (error) throw error;
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function dbFetchCategories(code: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('todo_categories')
    .select('id,name,colour')
    .eq('task_code', code)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function dbUpsertCategories(cats: Category[], code: string): Promise<void> {
  const rows = cats.map((c, i) => ({ id: c.id, task_code: code, name: c.name, colour: c.colour, sort_order: i }));
  const { error } = await supabase.from('todo_categories').upsert(rows, { onConflict: 'id,task_code' });
  if (error) throw error;
}

export async function dbDeleteCategory(id: string, code: string): Promise<void> {
  const { error } = await supabase.from('todo_categories').delete().eq('id', id).eq('task_code', code);
  if (error) throw error;
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function dbFetchAllTags(code: string): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('todo_tags').select('category_id,name').eq('task_code', code);
  if (error) throw error;
  const result: Record<string, string[]> = {};
  for (const row of (data ?? []) as { category_id: string; name: string }[]) {
    if (!result[row.category_id]) result[row.category_id] = [];
    result[row.category_id].push(row.name);
  }
  return result;
}

export async function dbUpsertTag(code: string, catId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('todo_tags')
    .upsert({ task_code: code, category_id: catId, name: tag }, { onConflict: 'task_code,category_id,name' });
  if (error) throw error;
}

export async function dbDeleteTag(code: string, catId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('todo_tags').delete()
    .eq('task_code', code).eq('category_id', catId).eq('name', tag);
  if (error) throw error;
}
