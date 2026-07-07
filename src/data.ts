import type { Category, Task } from './types';

// Real OKLCH values so categories can be serialised to JSON / localStorage
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'work',     name: 'Work',     colour: 'oklch(0.60 0.12 260)' },
  { id: 'personal', name: 'Personal', colour: 'oklch(0.60 0.12 150)' },
  { id: 'health',   name: 'Health',   colour: 'oklch(0.62 0.14 35)'  },
  { id: 'errands',  name: 'Errands',  colour: 'oklch(0.58 0.12 300)' },
];

// Palette for new / edited categories
export const CATEGORY_COLOURS: string[] = [
  'oklch(0.60 0.12 260)', // blue
  'oklch(0.60 0.12 150)', // green
  'oklch(0.62 0.14 35)',  // orange
  'oklch(0.58 0.12 300)', // purple
  'oklch(0.60 0.14 20)',  // red
  'oklch(0.60 0.12 200)', // teal
  'oklch(0.62 0.14 90)',  // yellow
  'oklch(0.60 0.12 340)', // pink
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
