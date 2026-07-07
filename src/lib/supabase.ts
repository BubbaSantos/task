import { createClient } from '@supabase/supabase-js';
import type { Task } from '../types';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

// ── DB row shape ────────────────────────────────────────────────────────────
interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  category_id: string;
  due_date: string | null;
  notes: string;
  completed: boolean;
  created_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    dueDate: row.due_date,
    notes: row.notes,
    completed: row.completed,
  };
}

function toRow(task: Task, userId: string): Omit<TaskRow, 'created_at'> {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    category_id: task.categoryId,
    due_date: task.dueDate,
    notes: task.notes,
    completed: task.completed,
  };
}

// ── CRUD ────────────────────────────────────────────────────────────────────
export async function dbFetchTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export async function dbUpsertTask(task: Task, userId: string): Promise<void> {
  const { error } = await supabase.from('tasks').upsert(toRow(task, userId));
  if (error) throw error;
}

export async function dbUpsertTasks(tasks: Task[], userId: string): Promise<void> {
  if (!tasks.length) return;
  const { error } = await supabase.from('tasks').upsert(tasks.map(t => toRow(t, userId)));
  if (error) throw error;
}

export async function dbDeleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}
