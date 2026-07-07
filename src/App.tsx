import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, VoiceCaptureState } from './types';
import { DEFAULT_CATEGORIES, SEED_TASKS } from './data';
import { getDateBucket } from './utils/dates';
import { CategoryFilter } from './components/CategoryFilter';
import { TaskGroup } from './components/TaskGroup';
import { VoiceCapture } from './components/VoiceCapture';
import './App.css';

const BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'upcoming', 'none'] as const;

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [voiceCaptureState, setVoiceCaptureState] = useState<VoiceCaptureState>('idle');
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [transcriptText, setTranscriptText] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  }, []);

  function handleFabClick() {
    setVoiceCaptureState('listening');
  }

  function handleStop(_audioBlob: Blob) {
    setTranscriptText('');
    setVoiceCaptureState('transcribing');
    simulateTranscription();
  }

  function simulateTranscription() {
    const sample = 'Call back the plumber tomorrow about the kitchen tap.';
    let i = 0;
    const interval = setInterval(() => {
      i += 3;
      setTranscriptText(sample.slice(0, i));
      if (i >= sample.length) clearInterval(interval);
    }, 60);
  }

  function handleCancel() {
    setVoiceCaptureState('idle');
    setTranscriptText('');
  }

  function handleSave(text: string) {
    if (text.trim()) {
      const today = new Date().toISOString().slice(0, 10);
      const newTask: Task = {
        id: Date.now().toString(),
        title: text.trim(),
        categoryId: 'personal',
        dueDate: today,
        notes: '',
        completed: false,
      };
      setTasks(prev => [...prev, newTask]);
    }
    setVoiceCaptureState('idle');
    setTranscriptText('');
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
        <button className="header-icon-btn" aria-label="Filter / settings">
          <span className="msym" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>tune</span>
        </button>
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
          />
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">No tasks here.</div>
        )}
      </div>

      <button className="fab" onClick={handleFabClick} aria-label="Start voice capture">
        <span className="msym" style={{ fontSize: 28, color: '#fff' }}>mic</span>
      </button>

      <VoiceCapture
        state={voiceCaptureState}
        elapsedMs={recordingElapsedMs}
        transcriptText={transcriptText}
        onStop={handleStop}
        onCancel={handleCancel}
        onSave={handleSave}
      />
    </div>
  );
}
