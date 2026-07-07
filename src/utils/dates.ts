import type { DateBucket } from '../types';

export function getDateBucket(dueDateStr: string | null): DateBucket {
  if (!dueDateStr) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return 'upcoming';
}

export function formatDueDate(dueDateStr: string | null, bucket: DateBucket): string {
  if (!dueDateStr) return '';
  if (bucket === 'today') return 'Today';
  if (bucket === 'tomorrow') return 'Tomorrow';
  const d = new Date(dueDateStr + 'T00:00:00');
  const mo = d.toLocaleString('en-GB', { month: 'short' });
  const day = d.getDate();
  if (bucket === 'overdue') return `${mo} ${day} · overdue`;
  return `${mo} ${day}`;
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
