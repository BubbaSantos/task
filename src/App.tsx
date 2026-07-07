import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Task, VoiceCaptureState } from './types';
import { DEFAULT_CATEGORIES, SEED_TASKS } from './data';
import { getDateBucket } from './utils/dates';
import { supabase, dbFetchTasks, dbUpsertTask, dbUpsertTasks, dbDeleteTask } from './lib/supabase';
import { CategoryFilter } from './components/CategoryFilter';
import { TaskGroup } from './components/TaskGroup';
import { VoiceCapture } from './components/VoiceCapture';
import { TaskSheet } from './components/TaskSheet';
import { VersionBadge } from './components/VersionBadge';
import { AuthScreen } from './components/AuthScreen';
import './App.css';

const LOCAL_KEY = 'task-app-tasks';
const SEED_IDS = new Set(SEED_TASKS.map(t => t.id));
const BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'upcoming', 'none'] as const;

function readLocalTasks(): Task[] {
  try {
    const s = localStorage.getItem(LOCAL_KEY);
    return s ? (JSON.parse(s) as Task[]) : [];
  } catch { return []; }
}

function writeLocalCache(tasks: Task[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks)); } catch { /* quota */ }
}

interface TaskSheetConfig { task?: Task; prefillTitle?: string; }

type AppView = 'booting' | 'auth' | 'ready';

export default function App() {
  const [view, setView] = useState<AppView>('booting');
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasksState] = useState<Task[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [voiceCaptureState, setVoiceCaptureState] = useState<VoiceCaptureState>('idle');
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [taskSheet, setTaskSheet] = useState<TaskSheetConfig | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadUserTasks(session.user);
      } else {
        setView('auth');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadUserTasks(session.user);
      } else {
        setUser(null);
        setTasksState([]);
        setView('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load tasks + first-login localStorage migration ─────────────────────
  async function loadUserTasks(u: User) {
    const remote = await dbFetchTasks(u.id);
    if (remote.length > 0) {
      setTasksState(remote);
      writeLocalCache(remote);
    } else {
      // First login — migrate any non-seed local tasks automatically
      const local = readLocalTasks().filter(t => !SEED_IDS.has(t.id));
      if (local.length > 0) {
        await dbUpsertTasks(local, u.id);
        setTasksState(local);
        writeLocalCache(local);
      } else {
        setTasksState([]);
        writeLocalCache([]);
      }
    }
    setView('ready');
  }

  // ── Real-time cross-device sync ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        dbFetchTasks(user.id).then(remote => {
          setTasksState(remote);
          writeLocalCache(remote);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Optimistic state helper ─────────────────────────────────────────────
  function applyAndSync(next: Task[], syncFn: () => Promise<void>) {
    setTasksState(next);
    writeLocalCache(next);
    syncFn().catch(console.error);
  }

  // ── Task operations ──────────────────────────────────────────────────────
  const handleToggle = useCallback((id: string) => {
    if (!user) return;
    setTasksState(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
      const changed = updated.find(t => t.id === id)!;
      writeLocalCache(updated);
      dbUpsertTask(changed, user.id).catch(console.error);
      return updated;
    });
  }, [user]);

  function handleTaskSheetSave(draft: {
    id?: string; title: string; categoryId: string;
    dueDate: string | null; notes: string; completed: boolean;
  }) {
    if (!user) return;
    if (draft.id) {
      const updated = tasks.map(t => t.id === draft.id ? { ...draft, id: draft.id! } : t);
      applyAndSync(updated, () => dbUpsertTask({ ...draft, id: draft.id! }, user.id));
    } else {
      const newTask: Task = { ...draft, id: Date.now().toString() };
      const updated = [...tasks, newTask];
      applyAndSync(updated, () => dbUpsertTask(newTask, user.id));
    }
    setTaskSheet(null);
  }

  function handleTaskDelete() {
    if (!user) return;
    const id = taskSheet?.task?.id;
    if (!id) return;
    const updated = tasks.filter(t => t.id !== id);
    applyAndSync(updated, () => dbDeleteTask(id));
    setTaskSheet(null);
  }

  const handleOpenTask = useCallback((task: Task) => setTaskSheet({ task }), []);

  // ── Voice ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (voiceCaptureState === 'listening') {
      setRecordingElapsedMs(0);
      timerRef.current = setInterval(() => setRecordingElapsedMs(ms => ms + 1000), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [voiceCaptureState]);

  function handleVoiceStop(text: string) {
    setVoiceCaptureState('idle');
    setTaskSheet({ prefillTitle: text });
  }

  // ── Sign out ─────────────────────────────────────────────────────────────
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (view === 'booting') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (view === 'auth') return <AuthScreen />;

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
          <button className="header-icon-btn" aria-label="Add task" onClick={() => setTaskSheet({})}>
            <span className="msym" style={{ fontSize: 22, color: 'var(--accent)' }}>add</span>
          </button>
          <button className="header-icon-btn" aria-label="Sign out" onClick={handleSignOut} title={user?.email}>
            <span className="msym" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>logout</span>
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

      <button className="fab" onClick={() => setVoiceCaptureState('listening')} aria-label="Start voice capture">
        <span className="msym" style={{ fontSize: 28, color: '#fff' }}>mic</span>
      </button>

      <VoiceCapture
        state={voiceCaptureState}
        elapsedMs={recordingElapsedMs}
        onStop={handleVoiceStop}
        onCancel={() => setVoiceCaptureState('idle')}
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
