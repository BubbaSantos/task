import { useEffect, useRef, useState } from 'react';
import type { Task, Category } from '../types';
import styles from './TaskSheet.module.css';

interface TaskDraft {
  id?: string;
  title: string;
  categoryId: string;
  dueDate: string | null;
  notes: string;
  completed: boolean;
}

interface Props {
  task?: Task;           // undefined = new task
  prefillTitle?: string; // populated from voice
  categories: Category[];
  onSave: (draft: TaskDraft) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function TaskSheet({ task, prefillTitle, categories, onSave, onDelete, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(task?.title ?? prefillTitle ?? '');
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? categories[0]?.id ?? '');
  const [dueDate, setDueDate] = useState<string | null>(task?.dueDate ?? today);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
  }, []);

  // Auto-grow textarea
  function handleTitleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTitle(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }

  function handleSave() {
    if (!title.trim()) return;
    onSave({
      id: task?.id,
      title: title.trim(),
      categoryId,
      dueDate,
      notes,
      completed: task?.completed ?? false,
    });
  }

  const isEditing = !!task;

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.sheet} role="dialog" aria-label={isEditing ? 'Edit task' : 'New task'}>
        <div className={styles.handle} />

        <div className={styles.sheetHeader}>
          <span className={styles.sheetTitle}>{isEditing ? 'Edit task' : 'New task'}</span>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="Close">
            <span className="msym" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <textarea
          ref={titleRef}
          className={styles.titleInput}
          placeholder="Task title…"
          value={title}
          onChange={handleTitleChange}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } }}
          rows={1}
        />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Category</span>
          <div className={styles.categoryRow}>
            {categories.map(cat => {
              const active = categoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  className={`${styles.catPill} ${active ? styles.catActive : ''}`}
                  style={active
                    ? { background: cat.colour, borderColor: cat.colour }
                    : { borderColor: cat.colour }}
                  onClick={() => setCategoryId(cat.id)}
                >
                  {!active && <span className={styles.catDot} style={{ background: cat.colour }} />}
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Due date</span>
          <div className={styles.dateRow}>
            <input
              type="date"
              className={styles.dateInput}
              value={dueDate ?? ''}
              onChange={e => setDueDate(e.target.value || null)}
            />
            {dueDate && (
              <button className={styles.clearDate} onClick={() => setDueDate(null)} aria-label="Clear date">
                <span className="msym" style={{ fontSize: 18 }}>close</span>
              </button>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Notes</span>
          <textarea
            className={styles.notesInput}
            placeholder="Add notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div className={styles.bottomRow}>
          {isEditing && onDelete && (
            <button className={styles.deleteBtn} onClick={onDelete} aria-label="Delete task">
              <span className="msym" style={{ fontSize: 20, color: 'var(--overdue-text)' }}>delete</span>
              <span className={styles.deleteBtnLabel}>Delete</span>
            </button>
          )}
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!title.trim()}
          >
            {isEditing ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}
