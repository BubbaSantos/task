import { createClient } from '@supabase/supabase-js';
import type { Task } from '../types';

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
