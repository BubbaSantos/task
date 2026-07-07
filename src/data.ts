import type { Category, Task } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'work',     name: 'Work',     colour: 'var(--cat-work)' },
  { id: 'personal', name: 'Personal', colour: 'var(--cat-personal)' },
  { id: 'health',   name: 'Health',   colour: 'var(--cat-health)' },
  { id: 'errands',  name: 'Errands',  colour: 'var(--cat-errands)' },
];

const today = new Date();
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const offset = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };

export const SEED_TASKS: Task[] = [
  { id: '1', title: 'Refill prescription',    categoryId: 'health',   dueDate: offset(-4), notes: '',                                     completed: false, tags: [] },
  { id: '2', title: 'Send invoice to client', categoryId: 'work',     dueDate: offset(-2), notes: 'Attach timesheet and project summary.', completed: false, tags: [] },
  { id: '3', title: 'Call the plumber',       categoryId: 'personal', dueDate: fmt(today), notes: 'Re: leaking kitchen tap.',              completed: false, tags: [] },
  { id: '4', title: 'Stand-up notes',         categoryId: 'work',     dueDate: fmt(today), notes: '',                                     completed: true,  tags: [] },
  { id: '5', title: 'Buy groceries',          categoryId: 'errands',  dueDate: offset(1),  notes: '',                                     completed: false, tags: [] },
  { id: '6', title: 'Review PR #42',          categoryId: 'work',     dueDate: offset(1),  notes: '',                                     completed: false, tags: [] },
];
