import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, Category, VoiceCaptureState } from './types';
import { DEFAULT_CATEGORIES, CATEGORY_COLOURS } from './data';
import { getDateBucket } from './utils/dates';
import { supabase, rowToTask, dbFetchTasks, dbUpsertTask, dbDeleteTask, dbFetchCategories, dbUpsertCategories, dbDeleteCategory, dbFetchAllTags, dbUpsertTag, dbDeleteTag } from './lib/supabase';
import { tagColor } from './utils/tagColor';
import { CategoryFilter } from './components/CategoryFilter';
import { TaskGroup } from './components/TaskGroup';
import { VoiceCapture } from './components/VoiceCapture';
import { TaskSheet } from './components/TaskSheet';
import { VersionBadge } from './components/VersionBadge';
import { CodeScreen } from './components/CodeScreen';
import './App.css';

// ── Theme ─────────────────────────────────────────────────────────────────────
type ThemePref = 'system' | 'light' | 'dark';
const THEME_KEY = 'task-theme';

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'dark') root.setAttribute('data-theme', 'dark');
  else if (pref === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
}

// ── Storage keys ─────────────────────────────────────────────────────────────
const CODE_KEY = 'task-code';
const NAME_KEY = 'task-username';
const cacheKey = (c: string) => `task-cache-${c}`;
const categoriesKey = (c: string) => `task-categories-${c}`;
const tagsKey = (c: string, catId: string) => `task-tags-${c}-${catId}`;
const instructionsKey = (c: string) => `task-parse-instructions-${c}`;
const QUEUE_KEY = 'task-queue';

// ── Category storage ──────────────────────────────────────────────────────────
function getCategories(code: string): Category[] {
  try {
    const s = localStorage.getItem(categoriesKey(code));
    return s ? JSON.parse(s) : DEFAULT_CATEGORIES;
  } catch { return DEFAULT_CATEGORIES; }
}
function saveCategories(code: string, cats: Category[]) {
  try { localStorage.setItem(categoriesKey(code), JSON.stringify(cats)); } catch {}
}

// ── Per-category tag storage ──────────────────────────────────────────────────
function getTags(code: string, catId: string): string[] {
  try { return JSON.parse(localStorage.getItem(tagsKey(code, catId)) || '[]'); } catch { return []; }
}
function saveTags(code: string, catId: string, tags: string[]) {
  try { localStorage.setItem(tagsKey(code, catId), JSON.stringify(tags)); } catch {}
}
function mergeTags(code: string, catId: string, newTags: string[]): string[] {
  const merged = Array.from(new Set([...getTags(code, catId), ...newTags]));
  saveTags(code, catId, merged);
  return merged;
}
function getAllTagsByCategory(code: string, cats: Category[]): Record<string, string[]> {
  return Object.fromEntries(cats.map(c => [c.id, getTags(code, c.id)]));
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
const ALL_BUCKETS = [...BUCKET_ORDER, 'completed'] as const;

interface ParsedTask { title: string; categoryId: string; dueDate: string | null; tags: string[]; notes: string; }

export default function App() {
  const [view, setView] = useState<'booting' | 'setup' | 'ready'>('booting');
  const [tasks, setTasksRaw] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [voiceCaptureState, setVoiceCaptureState] = useState<VoiceCaptureState>('idle');
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [taskSheet, setTaskSheet] = useState<{ task?: Task; prefillTitle?: string; parsed?: ParsedTask } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [parseInstructions, setParseInstructions] = useState('');
  const [knownTagsByCategory, setKnownTagsByCategory] = useState<Record<string, string[]>>({});
  const [codeCopied, setCodeCopied] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>(() => {
    const saved = localStorage.getItem(THEME_KEY) as ThemePref | null;
    return saved ?? 'system';
  });

  // Manage categories UI state
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColour, setNewCatColour] = useState(CATEGORY_COLOURS[0]);
  const [addingCat, setAddingCat] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const codeRef = useRef('');
  const tasksRef = useRef<Task[]>([]);
  const nameRef = useRef('');
  const categoriesRef = useRef<Category[]>(DEFAULT_CATEGORIES);

  function setTasks(next: Task[]) {
    tasksRef.current = next;
    setTasksRaw(next);
    if (codeRef.current) setCached(codeRef.current, next);
  }

  function updateCategories(cats: Category[]) {
    categoriesRef.current = cats;
    setCategories(cats);
    if (codeRef.current) {
      saveCategories(codeRef.current, cats);
      dbUpsertCategories(cats, codeRef.current).catch(() => {});
      channelRef.current?.send({ type: 'broadcast', event: 'categories-change', payload: { categories: cats } });
    }
  }

  function refreshTags(code: string, cats: Category[]) {
    setKnownTagsByCategory(getAllTagsByCategory(code, cats));
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

    const cached = getCached(code);
    if (cached.length > 0) { tasksRef.current = cached; setTasksRaw(cached); }

    let cats = getCategories(code);
    categoriesRef.current = cats;
    setCategories(cats);

    if (navigator.onLine) {
      await flushQueue();
      const pendingOps = getQueue();
      try {
        // Sync categories from DB (DB wins; if empty, push local defaults)
        const dbCats = await dbFetchCategories(code);
        if (dbCats.length > 0) {
          cats = dbCats;
          categoriesRef.current = cats;
          setCategories(cats);
          saveCategories(code, cats);
        } else {
          dbUpsertCategories(cats, code).catch(() => {});
        }
        // Sync tags from DB, merged with local
        const dbTags = await dbFetchAllTags(code);
        const localTags = getAllTagsByCategory(code, cats);
        const mergedTags: Record<string, string[]> = {};
        for (const cat of cats) {
          mergedTags[cat.id] = Array.from(new Set([...(dbTags[cat.id] ?? []), ...(localTags[cat.id] ?? [])]));
        }
        // Push any local-only tags to DB
        for (const [catId, tags] of Object.entries(localTags)) {
          for (const tag of tags) {
            if (!(dbTags[catId] ?? []).includes(tag)) dbUpsertTag(code, catId, tag).catch(() => {});
          }
        }
        setKnownTagsByCategory(mergedTags);
      } catch { /* fall through */ }

      try {
        const remote = await dbFetchTasks(code);
        const remoteIds = new Set(remote.map(t => t.id));

        // Backfill: push any locally-cached tasks that Supabase doesn't have yet
        // (covers tasks created before QuickShell integration, or failed writes)
        const localOnly = cached.filter(t => !remoteIds.has(t.id));
        for (const task of localOnly) dbUpsertTask(task, code).catch(() => {});

        if (remote.length > 0 || localOnly.length > 0) {
          const merged = [...remote, ...localOnly];
          if (pendingOps.length > 0) {
            const pendingTasks = pendingOps
              .filter((op): op is { type: 'upsert'; task: Task; code: string } => op.type === 'upsert')
              .map(op => op.task)
              .filter(t => !remoteIds.has(t.id) && !localOnly.some(l => l.id === t.id));
            setTasks([...merged, ...pendingTasks]);
          } else {
            setTasks(merged);
          }
        } else if (pendingOps.length === 0) {
          setTasks([]);
        }
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
      }
    }

    if (!navigator.onLine) refreshTags(code, cats);
    setParseInstructions(localStorage.getItem(instructionsKey(code)) ?? '');
    setView('ready');

    channelRef.current = supabase
      .channel(`tasks:${code}`)
      .on('broadcast', { event: 'task-upsert' }, ({ payload }) => {
        const task = payload.task as Task;
        setTasksRaw(prev => {
          const exists = prev.some(t => t.id === task.id);
          const next = exists ? prev.map(t => t.id === task.id ? task : t) : [...prev, task];
          tasksRef.current = next; setCached(code, next); return next;
        });
        // Relay to Supabase so QuickShell bar and other REST clients stay in sync
        if (navigator.onLine) dbUpsertTask(task, code).catch(() => {});
      })
      .on('broadcast', { event: 'task-delete' }, ({ payload }) => {
        const id = payload.id as string;
        setTasksRaw(prev => {
          const next = prev.filter(t => t.id !== id);
          tasksRef.current = next; setCached(code, next); return next;
        });
        if (navigator.onLine) dbDeleteTask(id).catch(() => {});
      })
      .on('broadcast', { event: 'sync-request' }, () => {
        // A new member joined — send them our full task list
        if (tasksRef.current.length > 0) {
          channelRef.current?.send({ type: 'broadcast', event: 'sync-response', payload: { tasks: tasksRef.current } });
        }
      })
      .on('broadcast', { event: 'sync-response' }, ({ payload }) => {
        const incoming = payload.tasks as Task[];
        if (!Array.isArray(incoming) || !incoming.length) return;
        setTasksRaw(prev => {
          const map = new Map(prev.map(t => [t.id, t]));
          for (const t of incoming) if (!map.has(t.id)) map.set(t.id, t);
          const next = Array.from(map.values());
          tasksRef.current = next; setCached(code, next); return next;
        });
        // Persist any tasks we didn't already have to Supabase
        if (navigator.onLine) {
          for (const t of incoming) dbUpsertTask(t, code).catch(() => {});
        }
      })
      .on('broadcast', { event: 'categories-change' }, ({ payload }) => {
        const cats = payload.categories as Category[];
        if (Array.isArray(cats) && cats.length > 0) {
          categoriesRef.current = cats;
          setCategories(cats);
          saveCategories(code, cats);
        }
      })
      .on('broadcast', { event: 'task-change' }, () => {
        // Bar mutated a task — fetch immediately so phone updates without waiting for poll
        if (navigator.onLine) {
          dbFetchTasks(code).then(remote => {
            if (!remote.length) return;
            setTasksRaw(prev => {
              const remoteIds = new Set(remote.map(t => t.id));
              const localOnly = prev.filter(t => !remoteIds.has(t.id));
              const next = [...remote, ...localOnly];
              if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
              tasksRef.current = next; setCached(code, next); return next;
            });
          }).catch(() => {});
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_tasks' }, (payload) => {
        const newRow = (payload.new ?? {}) as Record<string, unknown>;
        const oldRow = (payload.old ?? {}) as Record<string, unknown>;
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
        if (status === 'SUBSCRIBED') {
          // Ask peers for their tasks in case we're missing history
          channelRef.current?.send({ type: 'broadcast', event: 'sync-request', payload: {} });
        }
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

  // ── Groq Whisper transcription ────────────────────────────────────────────
  async function handleVoiceBlob(blob: Blob) {
    setVoiceCaptureState('transcribing');
    try {
      const form = new FormData();
      form.append('audio', blob, 'audio.webm');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: form,
      });
      const { text, error } = await res.json();
      if (error) throw new Error(error);
      await parseTranscript(text ?? '');
    } catch (err) {
      console.error('[transcribe] error:', err);
      setVoiceCaptureState('idle');
    }
  }

  async function parseTranscript(text: string) {
    if (!text.trim()) { setVoiceCaptureState('idle'); return; }
    setVoiceCaptureState('parsing');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-task`;
      const allTags = Object.values(knownTagsByCategory).flat();
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ transcript: text, today, instructions: parseInstructions, knownTags: allTags }),
      });
      const payload = await res.json();
      if (res.ok && payload.title) {
        setVoiceCaptureState('idle');
        setTaskSheet({ parsed: payload });
      } else {
        throw new Error(payload.error ?? 'parse failed');
      }
    } catch (err) {
      console.error('[parse-task] catch:', err);
      setVoiceCaptureState('idle');
      setTaskSheet({ prefillTitle: text });
    }
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
    setKnownTagsByCategory({});
    setCategories(DEFAULT_CATEGORIES);
    setShowSettings(false);
    setView('setup');
  }

  async function copyCode() {
    await navigator.clipboard.writeText(codeRef.current);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────
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
    if (task.tags.length) {
      const merged = mergeTags(codeRef.current, task.categoryId, task.tags);
      setKnownTagsByCategory(prev => ({ ...prev, [task.categoryId]: merged }));
      for (const tag of task.tags) dbUpsertTag(codeRef.current, task.categoryId, tag).catch(() => {});
    }
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

  // ── Visibility / foreground refetch + background poll ────────────────────
  useEffect(() => {
    const refetch = () => {
      const code = codeRef.current;
      if (!code || !navigator.onLine || document.visibilityState !== 'visible') return;
      dbFetchTasks(code).then(remote => {
        if (!remote.length) return;
        setTasksRaw(prev => {
          const remoteIds = new Set(remote.map(t => t.id));
          const localOnly = prev.filter(t => !remoteIds.has(t.id));
          const next = [...remote, ...localOnly];
          if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
          tasksRef.current = next;
          setCached(code, next);
          return next;
        });
      }).catch(() => {});
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      refetch();
      channelRef.current?.send({ type: 'broadcast', event: 'sync-request', payload: {} });
    };

    document.addEventListener('visibilitychange', onVisible);
    // Poll every 5s so bar-created tasks appear on phone without WebSocket dependency
    const interval = setInterval(refetch, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Category CRUD ─────────────────────────────────────────────────────────
  function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const cat: Category = { id: crypto.randomUUID(), name, colour: newCatColour };
    const next = [...categoriesRef.current, cat];
    updateCategories(next);
    setNewCatName('');
    setNewCatColour(CATEGORY_COLOURS[0]);
    setAddingCat(false);
  }

  function handleDeleteCategory(id: string) {
    const next = categoriesRef.current.filter(c => c.id !== id);
    updateCategories(next);
    dbDeleteCategory(id, codeRef.current).catch(() => {});
    // Reassign tasks in deleted category to first remaining category
    const fallbackId = next[0]?.id;
    if (fallbackId) {
      const updated = tasksRef.current.map(t =>
        t.categoryId === id ? { ...t, categoryId: fallbackId } : t
      );
      setTasks(updated);
      updated.filter(t => t.categoryId === fallbackId).forEach(task => {
        broadcastUpsert(task);
        if (navigator.onLine) dbUpsertTask(task, codeRef.current).catch(() => enqueue({ type: 'upsert', task, code: codeRef.current }));
      });
    }
    if (activeCategoryFilter === id) setActiveCategoryFilter(null);
  }

  function handleSaveEditCat() {
    if (!editingCat) return;
    const next = categoriesRef.current.map(c =>
      c.id === editingCat.id ? editingCat : c
    );
    updateCategories(next);
    setEditingCat(null);
  }

  // ── Tag CRUD ──────────────────────────────────────────────────────────────
  function handleDeleteTag(catId: string, tag: string) {
    const current = getTags(codeRef.current, catId).filter(t => t !== tag);
    saveTags(codeRef.current, catId, current);
    setKnownTagsByCategory(prev => ({ ...prev, [catId]: current }));
    dbDeleteTag(codeRef.current, catId, tag).catch(() => {});
  }

  function handleClearCompleted() {
    const completed = tasksRef.current.filter(t => t.completed);
    if (!completed.length) return;
    if (!window.confirm(`Delete ${completed.length} completed task${completed.length === 1 ? '' : 's'}?`)) return;
    const next = tasksRef.current.filter(t => !t.completed);
    setTasks(next);
    for (const t of completed) {
      broadcastDelete(t.id);
      if (navigator.onLine) {
        dbDeleteTask(t.id).catch(() => enqueue({ type: 'delete', id: t.id }));
      } else {
        enqueue({ type: 'delete', id: t.id });
      }
    }
  }

  function handleDeleteAllTasks() {
    const all = tasksRef.current;
    if (!all.length) return;
    if (!window.confirm(`Delete all ${all.length} task${all.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setTasks([]);
    setShowSettings(false);
    for (const t of all) {
      broadcastDelete(t.id);
      if (navigator.onLine) {
        dbDeleteTask(t.id).catch(() => enqueue({ type: 'delete', id: t.id }));
      } else {
        enqueue({ type: 'delete', id: t.id });
      }
    }
  }

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    applyTheme(themePref);
    localStorage.setItem(THEME_KEY, themePref);
  }, [themePref]);

  // Apply saved theme on mount (before first render)
  useEffect(() => { applyTheme(themePref); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  function handleMicTap() {
    setVoiceCaptureState('listening');
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

  const incomplete = filtered.filter(t => !t.completed);
  const grouped = {
    ...Object.fromEntries(BUCKET_ORDER.map(b => [b, incomplete.filter(t => getDateBucket(t.dueDate) === b)])),
    completed: filtered.filter(t => t.completed),
  } as Record<string, Task[]>;

  const code = codeRef.current;
  const userName = nameRef.current;

  return (
    <div className="app-shell">
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
          <div className="settings-row">
            <span className="settings-label">Dark mode</span>
            <label className="theme-toggle">
              <input
                type="checkbox"
                checked={themePref === 'dark' || (themePref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)}
                onChange={e => setThemePref(e.target.checked ? 'dark' : 'light')}
              />
              <span className="theme-toggle-track" />
            </label>
          </div>
          <button className="settings-action-btn" onClick={() => { setShowSettings(false); setShowInstructions(true); }}>Voice parsing instructions</button>
          <button className="settings-action-btn" onClick={() => { setShowSettings(false); setShowManageCategories(true); }}>Manage categories</button>
          <button className="settings-action-btn" onClick={() => { setShowSettings(false); setShowManageTags(true); }}>Manage tags</button>
          <button className="settings-leave-btn" onClick={handleDeleteAllTasks}>Delete all tasks</button>
          <button className="settings-leave-btn" onClick={handleLeave}>Leave this list</button>
        </div>
      )}

      <div className="filter-row">
        <CategoryFilter
          categories={categories}
          active={activeCategoryFilter}
          onChange={setActiveCategoryFilter}
        />
      </div>

      <div className="task-scroll">
        {ALL_BUCKETS.map(bucket => (
          <TaskGroup
            key={bucket}
            bucket={bucket}
            tasks={grouped[bucket] ?? []}
            categories={categories}
            onToggle={handleToggle}
            onOpen={handleOpenTask}
            onDelete={handleDeleteById}
            onClearCompleted={bucket === 'completed' ? handleClearCompleted : undefined}
          />
        ))}
        {incomplete.length === 0 && grouped.completed?.length === 0 && (
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
        <button className="fab" onClick={handleMicTap} aria-label="Start voice capture">
          <span className="msym" style={{ fontSize: 28, color: '#fff' }}>mic</span>
        </button>
      </div>

      <VoiceCapture
        state={voiceCaptureState}
        elapsedMs={recordingElapsedMs}
        onStop={handleVoiceBlob}
        onCancel={() => setVoiceCaptureState('idle')}
      />

      {/* ── Voice parsing instructions ── */}
      {showInstructions && (
        <div className="manage-overlay" onClick={e => e.target === e.currentTarget && setShowInstructions(false)}>
          <div className="manage-sheet">
            <div className="manage-header">
              <span className="manage-title">Voice parsing instructions</span>
              <button className="header-icon-btn" onClick={() => setShowInstructions(false)} aria-label="Close">
                <span className="msym" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <p className="manage-empty" style={{ textAlign: 'left', padding: 0 }}>
              Tell the AI how to interpret your voice notes — categories, tags, shortcuts, anything. Written in plain English.
            </p>
            <textarea
              className="instructions-input"
              placeholder={'Examples:\n• Tag anything admin-related with #admin\n• "ping" means send a message — category work\n• Groceries always go in errands with tag #shopping'}
              value={parseInstructions}
              onChange={e => setParseInstructions(e.target.value)}
              rows={8}
            />
            <button className="instructions-save-btn" onClick={() => {
              localStorage.setItem(instructionsKey(codeRef.current), parseInstructions);
              setShowInstructions(false);
            }}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Manage categories ── */}
      {showManageCategories && (
        <div className="manage-overlay" onClick={e => e.target === e.currentTarget && setShowManageCategories(false)}>
          <div className="manage-sheet">
            <div className="manage-header">
              <span className="manage-title">Manage categories</span>
              <button className="header-icon-btn" onClick={() => setShowManageCategories(false)} aria-label="Close">
                <span className="msym" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <div className="manage-cat-list">
              {categories.map(cat => (
                <div key={cat.id} className="manage-cat-row">
                  {editingCat?.id === cat.id ? (
                    <>
                      <input
                        className="manage-cat-name-input"
                        value={editingCat.name}
                        onChange={e => setEditingCat({ ...editingCat, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEditCat(); }}
                      />
                      <div className="manage-colour-row">
                        {CATEGORY_COLOURS.map(col => (
                          <button
                            key={col}
                            className={`manage-colour-swatch ${editingCat.colour === col ? 'active' : ''}`}
                            style={{ background: col }}
                            onClick={() => setEditingCat({ ...editingCat, colour: col })}
                            aria-label={col}
                          />
                        ))}
                      </div>
                      <div className="manage-cat-actions">
                        <button className="manage-cat-save-btn" onClick={handleSaveEditCat}>Save</button>
                        <button className="manage-cat-cancel-btn" onClick={() => setEditingCat(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="manage-cat-dot" style={{ background: cat.colour }} />
                      <span className="manage-cat-name">{cat.name}</span>
                      <div className="manage-cat-btns">
                        <button className="manage-tag-delete" onClick={() => setEditingCat({ ...cat })} aria-label={`Edit ${cat.name}`}>
                          <span className="msym" style={{ fontSize: 18 }}>edit</span>
                        </button>
                        {categories.length > 1 && (
                          <button className="manage-tag-delete" onClick={() => handleDeleteCategory(cat.id)} aria-label={`Delete ${cat.name}`}>
                            <span className="msym" style={{ fontSize: 18 }}>delete</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {addingCat ? (
              <div className="manage-add-cat">
                <input
                  className="manage-cat-name-input"
                  placeholder="Category name…"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
                  autoFocus
                />
                <div className="manage-colour-row">
                  {CATEGORY_COLOURS.map(col => (
                    <button
                      key={col}
                      className={`manage-colour-swatch ${newCatColour === col ? 'active' : ''}`}
                      style={{ background: col }}
                      onClick={() => setNewCatColour(col)}
                      aria-label={col}
                    />
                  ))}
                </div>
                <div className="manage-cat-actions">
                  <button className="manage-cat-save-btn" onClick={handleAddCategory}>Add</button>
                  <button className="manage-cat-cancel-btn" onClick={() => { setAddingCat(false); setNewCatName(''); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="manage-add-btn" onClick={() => setAddingCat(true)}>
                <span className="msym" style={{ fontSize: 18 }}>add</span>
                Add category
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Manage tags (per category) ── */}
      {showManageTags && (
        <div className="manage-overlay" onClick={e => e.target === e.currentTarget && setShowManageTags(false)}>
          <div className="manage-sheet">
            <div className="manage-header">
              <span className="manage-title">Manage tags</span>
              <button className="header-icon-btn" onClick={() => setShowManageTags(false)} aria-label="Close">
                <span className="msym" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            {categories.every(cat => (knownTagsByCategory[cat.id] ?? []).length === 0) ? (
              <p className="manage-empty">No tags yet. Add them when creating or editing a task.</p>
            ) : (
              categories.map(cat => {
                const catTags = knownTagsByCategory[cat.id] ?? [];
                if (!catTags.length) return null;
                return (
                  <div key={cat.id} className="manage-tags-section">
                    <div className="manage-tags-cat-header">
                      <span className="manage-cat-dot" style={{ background: cat.colour }} />
                      <span className="manage-tags-cat-name">{cat.name}</span>
                    </div>
                    <div className="manage-tag-list">
                      {catTags.map(tag => (
                        <div key={tag} className="manage-tag-row">
                          <span className="manage-tag-name" style={{ color: tagColor(tag).text }}>#{tag}</span>
                          <button className="manage-tag-delete" onClick={() => handleDeleteTag(cat.id, tag)} aria-label={`Delete ${tag}`}>
                            <span className="msym" style={{ fontSize: 18 }}>delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {taskSheet && (
        <TaskSheet
          task={taskSheet.task}
          prefillTitle={taskSheet.prefillTitle}
          parsed={taskSheet.parsed}
          categories={categories}
          knownTagsByCategory={knownTagsByCategory}
          onSave={handleTaskSheetSave}
          onDelete={taskSheet.task ? handleTaskDelete : undefined}
          onCancel={() => setTaskSheet(null)}
        />
      )}
    </div>
  );
}
