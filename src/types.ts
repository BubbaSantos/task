export interface Task {
  id: string;
  title: string;
  categoryId: string;
  dueDate: string | null; // ISO date string YYYY-MM-DD
  notes: string;
  completed: boolean;
}

export interface Category {
  id: string;
  name: string;
  colour: string;
}

export type VoiceCaptureState = 'idle' | 'listening';

export type DateBucket = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none';
