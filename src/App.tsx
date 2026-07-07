import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, VoiceCaptureState } from './types';
import { DEFAULT_CATEGORIES } from './data';
import { getDateBucket } from './utils/dates';
import { supabase, rowToTask, dbFetchTasks, dbUpsertTask, dbDeleteTask } from './lib/supabase';
import { tagColor } from './utils/tagColor';
import { CategoryFilter } from './components/CategoryFilter';
import { TaskGroup } from './components/TaskGroup';
import { VoiceCapture } from './components/VoiceCapture';
import { TaskSheet } from './components/TaskSheet';
import { VersionBadge } from './components/VersionBadge';
import { CodeScreen } from './components/CodeScreen';
import './App.css';

// ── Storage keys ─────────────────────────────────────────────────────────────
const CODE_KEY = 'task-code';
const NAME_KEY = 'task-username';
const cacheKey = (c: string) => `task-cache-${c}`;
const tagsKey = (c: string) => `task-tags-${c}`;
const QUEUE_KEY = 'task-queue';

// ── Known tags ────────────────────────────────────────────────────────────────
function getKnownTags(code: string): string[] {
  try { return JSON.parse(localStorage.getItem(tagsKey(code)) || '[]'); } catch { return []; }
}
function saveKnownTags(code: string, tags: string[]) {
  try { localStorage.setItem(tagsKey(code), JSON.stringify(tags)); } catch {}
}
function mergeKnownTags(code: string, newTags: string[]): string[] {
  const merged = Array.from(new Set([...getKnownTags(code), ...newTags]));
  saveKnownTags(code, merged);
  return merged;
}

// ── Offline queue ─────────────────────────────────────────────────────────────
type QueueOp =
  | { type: 'upsert'; task: Task; code: string }
  | { type: 'delete'; id: string };

function getQueue(): QueueOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q: QueueOp[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
function enqueue(op: QueueOp) { saveQueue([...getQueue(), op]); }

async function flushQueue() {
  const q = getQueue();
  if (!q.length) return;
  const failed: QueueOp[] = [];
  for (const op of q) {
    try {
      if (op.type === 'upsert') await dbUpsertTask(op.task, op.code);
      else await dbDeleteTask(op.id);
    } catch { failed.push(op); }
  }
  saveQueue(failed);
}

// ── Local cache ───────────────────────────────────────────────────────────────
function getCached(code: string): Task[] {
  try { return JSON.parse(localStorage.getItem(cacheKey(code)) || '[]'); } catch { return []; }
}
function setCached(code: string, tasks: Task[]) {
  try { localStorage.setItem(cacheKey(code), JSON.stringify(tasks)); } catch {}
}

const BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'upcoming', 'none'] as const;

export default function App() {
  const [view, setView] = useState<'booting' | 'setup' | 'ready'>('booting');
  const [tasks, setTasksRaw] = useState<Task[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [voiceCaptureState, setVoiceCaptureState] = useState<VoiceCaptureState>('idle');
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  interface ParsedTask { title: string; categoryId: string; dueDate: string | null; tags: string[]; notes: string; }
  const [taskSheet, setTaskSheet] = useState<{ task?: Task; prefillTitle?: string; parsed?: ParsedTask } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const codeRef = useRef('');
  const tasksRef = useRef<Task[]>([]);
  const nameRef = useRef('');

  // Keep tasksRef in sync
  function setTasks(next: Task[]) {
    tasksRef.current = next;
    setTasksRaw(next);
    if (codeRef.current) setCached(codeRef.current, next);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedCode = localStorage.getItem(CODE_KEY) || '';
    nameRef.current = localStorage.getItem(NAME_KEY) || '';
    if (savedCode) {
      codeRef.current = savedCode;
      loadAndSubscribe(savedCode);
    } else {
      setView('setup');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load + subscribe ──────────────────────────────────────────────────────
  async function loadAndSubscribe(code: string) {
    channelRef.current?.unsubscribe();

    // Show cached tasks immediately
    const cached = getCached(code);
    if (cached.length > 0) { tasksRef.current = cached; setTasksRaw(cached); }

    if (navigator.onLine) {
      await flushQueue();
      const pendingOps = getQueue();
      try {
        const remote = await dbFetchTasks(code);
        if (remote.length > 0) {
          // Merge any pending upserts that haven't hit DB yet
          if (pendingOps.length > 0) {
            const remoteIds = new Set(remote.map(t => t.id));
            const pendingTasks = pendingOps
              .filter((op): op is { type: 'upsert'; task: Task; code: string } => op.type === 'upsert')
              .map(op => op.task)
              .filter(t => !remoteIds.has(t.id));
            setTasks([...remote, ...pendingTasks]);
          } else {
            setTasks(remote);
          }
        } else if (pendingOps.length === 0) {
          // DB empty and no pending writes — list is genuinely empty
          setTasks([]);
        }
        // else: DB empty but queue has writes — keep local cache until flush succeeds
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
      }
    }

    setKnownTags(getKnownTags(code));
    setView('ready');

    channelRef.current = supabase
      .channel(`tasks:${code}`)
      // Broadcast: primary sync — receives full task data instantly, no DB round-trip needed
      .on('broadcast', { event: 'task-upsert' }, ({ payload }) => {
        const task = payload.task as Task;
        console.log('[sync] broadcast task-upsert', task.id);
        setTasksRaw(prev => {
          const exists = prev.some(t => t.id === task.id);
          const next = exists ? prev.map(t => t.id === task.id ? task : t) : [...prev, task];
          tasksRef.current = next; setCached(code, next); return next;
        });
      })
      .on('broadcast', { event: 'task-delete' }, ({ payload }) => {
        const id = payload.id as string;
        console.log('[sync] broadcast task-delete', id);
        setTasksRaw(prev => {
          const next = prev.filter(t => t.id !== id);
          tasksRef.current = next; setCached(code, next); return next;
        });
      })
      // postgres_changes: fallback sync for reconnects / missed broadcasts
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_tasks' }, (payload) => {
        const newRow = (payload.new ?? {}) as Record<string, unknown>;
        const oldRow = (payload.old ?? {}) as Record<string, unknown>;
        console.log('[sync] postgres_changes', payload.eventType);

        if (payload.eventType === 'INSERT' && newRow.task_code === code) {
          const task = rowToTask(newRow);
          setTasksRaw(prev => {
            if (prev.some(t => t.id === task.id)) return prev;
            const next = [...prev, task];
            tasksRef.current = next; setCached(code, next); return next;
          });
        } else if (payload.eventType === 'UPDATE' && newRow.task_code === code) {
          const task = rowToTask(newRow);
          setTasksRaw(prev => {
            const next = prev.map(t => t.id === task.id ? task : t);
            tasksRef.current = next; setCached(code, next); return next;
          });
        } else if (payload.eventType === 'DELETE') {
          const id = oldRow.id as string;
          setTasksRaw(prev => {
            const next = prev.filter(t => t.id !== id);
            tasksRef.current = next; setCached(code, next); return next;
          });
        }
      })
      .subscribe((status) => {
        console.log('[sync] channel status:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setTimeout(() => { if (codeRef.current) loadAndSubscribe(codeRef.current); }, 4000);
        }
      });
  }

  function broadcastUpsert(task: Task) {
    channelRef.current?.send({ type: 'broadcast', event: 'task-upsert', payload: { task } });
  }

  function broadcastDelete(id: string) {
    channelRef.current?.send({ type: 'broadcast', event: 'task-delete', payload: { id } });
  }

  // ── Auth (code-based) ─────────────────────────────────────────────────────
  function handleReady(code: string, name: string) {
    localStorage.setItem(CODE_KEY, code);
    if (name) localStorage.setItem(NAME_KEY, name);
    nameRef.current = name;
    codeRef.current = code;
    loadAndSubscribe(code);
  }

  function handleLeave() {
    channelRef.current?.unsubscribe();
    const code = codeRef.current;
    localStorage.removeItem(CODE_KEY);
    localStorage.removeItem(NAME_KEY);
    if (code) localStorage.removeItem(cacheKey(code));
    codeRef.current = '';
    setTasks([]);
    setKnownTags([]);
    setShowSettings(false);
    setView('setup');
  }

  async function copyCode() {
    await navigator.clipboard.writeText(codeRef.current);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  // ── Task CRUD (optimistic + sync) ─────────────────────────────────────────
  const handleToggle = useCallback((id: string) => {
    const task = tasksRef.current.find(t => t.id === id);
    if (!task) return;
    const updated = { ...task, completed: !task.completed };
    setTasks(tasksRef.current.map(t => t.id === id ? updated : t));
    broadcastUpsert(updated);
    if (navigator.onLine) {
      dbUpsertTask(updated, codeRef.current)
        .catch(() => enqueue({ type: 'upsert', task: updated, code: codeRef.current }));
    } else {
      enqueue({ type: 'upsert', task: updated, code: codeRef.current });
    }
  }, []);

  function handleTaskSheetSave(draft: { id?: string; title: string; categoryId: string; dueDate: string | null; notes: string; completed: boolean; tags: string[] }) {
    const task: Task = draft.id
      ? { ...draft, id: draft.id }
      : { ...draft, id: crypto.randomUUID() };
    if (task.tags.length) setKnownTags(mergeKnownTags(codeRef.current, task.tags));
    const next = draft.id
      ? tasksRef.current.map(t => t.id === task.id ? task : t)
      : [...tasksRef.current, task];
    setTasks(next);
    broadcastUpsert(task);
    if (navigator.onLine) {
      dbUpsertTask(task, codeRef.current)
        .catch(() => enqueue({ type: 'upsert', task, code: codeRef.current }));
    } else {
      enqueue({ type: 'upsert', task, code: codeRef.current });
    }
    setTaskSheet(null);
  }

  const handleDeleteById = useCallback((id: string) => {
    setTasks(tasksRef.current.filter(t => t.id !== id));
    broadcastDelete(id);
    if (navigator.onLine) {
      dbDeleteTask(id).catch(() => enqueue({ type: 'delete', id }));
    } else {
      enqueue({ type: 'delete', id });
    }
  }, []);

  function handleTaskDelete() {
    const id = taskSheet?.task?.id;
    if (!id) return;
    handleDeleteById(id);
    setTaskSheet(null);
  }

  const handleOpenTask = useCallback((task: Task) => setTaskSheet({ task }), []);

  // ── Voice timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (voiceCaptureState === 'listening') {
      setRecordingElapsedMs(0);
      timerRef.current = setInterval(() => setRecordingElapsedMs(ms => ms + 1000), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [voiceCaptureState]);

  async function handleVoiceStop(text: string) {
    if (!text.trim()) { setVoiceCaptureState('idle'); return; }
    setVoiceCaptureState('parsing');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-task`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ transcript: text, today }),
      });
      if (res.ok) {
        const parsed = await res.json();
        setVoiceCaptureState('idle');
        setTaskSheet({ parsed });
      } else {
        throw new Error('parse failed');
      }
    } catch {
      setVoiceCaptureState('idle');
      setTaskSheet({ prefillTitle: text }); // fallback: just pre-fill title
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (view === 'booting') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--accent-tint)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (view === 'setup') return <CodeScreen onReady={handleReady} />;

  const filtered = activeCategoryFilter
    ? tasks.filter(t => t.categoryId === activeCategoryFilter)
    : tasks;

  const grouped = Object.fromEntries(
    BUCKET_ORDER.map(b => [b, filtered.filter(t => getDateBucket(t.dueDate) === b)])
  ) as Record<string, Task[]>;

  const code = codeRef.current;
  const userName = nameRef.current;

  return (
    <div className="app-shell">
      {/* Settings overlay — tap outside to close */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)} />
      )}

      <div className="app-header">
        <h1 className="app-title" onClick={() => window.location.reload()} style={{ cursor: 'pointer' }}>Tasks</h1>
        <div className="header-actions">
          <button className="header-icon-btn" aria-label="Settings" onClick={() => setShowSettings(s => !s)}>
            <span className="msym" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>settings</span>
          </button>
        </div>
      </div>

      {/* Settings popover */}
      {showSettings && (
        <div className="settings-popover">
          <div className="settings-row">
            <span className="settings-label">List code</span>
            <button className="settings-code-btn" onClick={copyCode}>
              {codeCopied ? '✓ Copied' : code}
            </button>
          </div>
          {userName && (
            <div className="settings-row">
              <span className="settings-label">Name</span>
              <span className="settings-value">{userName}</span>
            </div>
          )}
          <button className="settings-action-btn" onClick={() => { setShowSettings(false); setShowManageTags(true); }}>Manage tags</button>
          <button className="settings-leave-btn" onClick={handleLeave}>Leave this list</button>
        </div>
      )}

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
            onDelete={handleDeleteById}
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

      <div className="fab-group">
        <button className="fab fab-add" onClick={() => setTaskSheet({})} aria-label="Add task">
          <span className="msym" style={{ fontSize: 28, color: '#fff' }}>add</span>
        </button>
        <button className="fab" onClick={() => setVoiceCaptureState('listening')} aria-label="Start voice capture">
          <span className="msym" style={{ fontSize: 28, color: '#fff' }}>mic</span>
        </button>
      </div>

      <VoiceCapture
        state={voiceCaptureState}
        elapsedMs={recordingElapsedMs}
        onStop={handleVoiceStop}
        onCancel={() => setVoiceCaptureState('idle')}
      />

      {showManageTags && (
        <div className="manage-overlay" onClick={e => e.target === e.currentTarget && setShowManageTags(false)}>
          <div className="manage-sheet">
            <div className="manage-header">
              <span className="manage-title">Manage tags</span>
              <button className="header-icon-btn" onClick={() => setShowManageTags(false)} aria-label="Close">
                <span className="msym" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            {knownTags.length === 0 ? (
              <p className="manage-empty">No tags yet. Add them when creating or editing a task.</p>
            ) : (
              <div className="manage-tag-list">
                {knownTags.map(tag => (
                  <div key={tag} className="manage-tag-row">
                    <span className="manage-tag-name" style={{ color: tagColor(tag).text }}>#{tag}</span>
                    <button className="manage-tag-delete" onClick={() => {
                      const next = knownTags.filter(t => t !== tag);
                      setKnownTags(next);
                      saveKnownTags(codeRef.current, next);
                    }} aria-label={`Delete ${tag}`}>
                      <span className="msym" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {taskSheet && (
        <TaskSheet
          task={taskSheet.task}
          prefillTitle={taskSheet.prefillTitle}
          parsed={taskSheet.parsed}
          categories={DEFAULT_CATEGORIES}
          knownTags={knownTags}
          onSave={handleTaskSheetSave}
          onDelete={taskSheet.task ? handleTaskDelete : undefined}
          onCancel={() => setTaskSheet(null)}
        />
      )}
    </div>
  );
}
