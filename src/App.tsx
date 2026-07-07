import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, VoiceCaptureState } from './types';
import { DEFAULT_CATEGORIES, SEED_TASKS } from './data';
import { getDateBucket } from './utils/dates';
import { CategoryFilter } from './components/CategoryFilter';
import { TaskGroup } from './components/TaskGroup';
import { VoiceCapture } from './components/VoiceCapture';
import { TaskSheet } from './components/TaskSheet';
import { VersionBadge } from './components/VersionBadge';
import './App.css';

const STORAGE_KEY = 'task-app-tasks';
const BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'upcoming', 'none'] as const;

function loadTasks(): Task[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Task[]) : SEED_TASKS;
  } catch {
    return SEED_TASKS;
  }
}

interface TaskSheetConfig {
  task?: Task;
  prefillTitle?: string;
}

export default function App() {
  const [tasks, setTasksRaw] = useState<Task[]>(loadTasks);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [voiceCaptureState, setVoiceCaptureState] = useState<VoiceCaptureState>('idle');
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [taskSheet, setTaskSheet] = useState<TaskSheetConfig | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function setTasks(updater: Task[] | ((prev: Task[]) => Task[])) {
    setTasksRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }

  useEffect(() => {
    if (voiceCaptureState === 'listening') {
      setRecordingElapsedMs(0);
      timerRef.current = setInterval(() => {
        setRecordingElapsedMs(ms => ms + 1000);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [voiceCaptureState]);

  const handleToggle = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenTask = useCallback((task: Task) => {
    setTaskSheet({ task });
  }, []);

  function handleTaskSheetSave(draft: {
    id?: string; title: string; categoryId: string;
    dueDate: string | null; notes: string; completed: boolean;
  }) {
    if (draft.id) {
      setTasks(prev => prev.map(t => t.id === draft.id ? { ...draft, id: draft.id! } : t));
    } else {
      setTasks(prev => [...prev, { ...draft, id: Date.now().toString() }]);
    }
    setTaskSheet(null);
  }

  function handleTaskDelete() {
    const id = taskSheet?.task?.id;
    if (id) setTasks(prev => prev.filter(t => t.id !== id));
    setTaskSheet(null);
  }

  // Voice: stop listening → open TaskSheet pre-filled with transcript
  function handleVoiceStop(finalText: string) {
    setVoiceCaptureState('idle');
    setTaskSheet({ prefillTitle: finalText });
  }

  function handleVoiceCancel() {
    setVoiceCaptureState('idle');
  }

  const filtered = activeCategoryFilter
    ? tasks.filter(t => t.categoryId === activeCategoryFilter)
    : tasks;

  const grouped = Object.fromEntries(
    BUCKET_ORDER.map(b => [b, filtered.filter(t => getDateBucket(t.dueDate) === b)])
  ) as Record<string, Task[]>;

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1 className="app-title">Tasks</h1>
        <div className="header-actions">
          <button
            className="header-icon-btn"
            aria-label="Add task"
            onClick={() => setTaskSheet({})}
          >
            <span className="msym" style={{ fontSize: 22, color: 'var(--accent)' }}>add</span>
          </button>
          <button className="header-icon-btn" aria-label="Filter / settings">
            <span className="msym" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>tune</span>
          </button>
        </div>
      </div>

      <div className="filter-row">
        <CategoryFilter
          categories={DEFAULT_CATEGORIES}
          active={activeCategoryFilter}
          onChange={setActiveCategoryFilter}
        />
      </div>

      <div className="task-scroll">
        {BUCKET_ORDER.map(bucket => (
          <TaskGroup
            key={bucket}
            bucket={bucket}
            tasks={grouped[bucket] ?? []}
            categories={DEFAULT_CATEGORIES}
            onToggle={handleToggle}
            onOpen={handleOpenTask}
          />
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            No tasks here.{' '}
            <button className="empty-add" onClick={() => setTaskSheet({})}>Add one?</button>
          </div>
        )}
      </div>

      <VersionBadge />

      <button
        className="fab"
        onClick={() => setVoiceCaptureState('listening')}
        aria-label="Start voice capture"
      >
        <span className="msym" style={{ fontSize: 28, color: '#fff' }}>mic</span>
      </button>

      <VoiceCapture
        state={voiceCaptureState}
        elapsedMs={recordingElapsedMs}
        onStop={handleVoiceStop}
        onCancel={handleVoiceCancel}
      />

      {taskSheet && (
        <TaskSheet
          task={taskSheet.task}
          prefillTitle={taskSheet.prefillTitle}
          categories={DEFAULT_CATEGORIES}
          onSave={handleTaskSheetSave}
          onDelete={taskSheet.task ? handleTaskDelete : undefined}
          onCancel={() => setTaskSheet(null)}
        />
      )}
    </div>
  );
}
