export interface Task {
  id: string;
  title: string;
  categoryId: string;
  dueDate: string | null; // ISO date string YYYY-MM-DD
  notes: string;
  completed: boolean;
  tags: string[];
}

export interface Category {
  id: string;
  name: string;
  colour: string;
}

export type VoiceCaptureState = 'idle' | 'listening' | 'transcribing' | 'parsing';

export type DateBucket = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none';
