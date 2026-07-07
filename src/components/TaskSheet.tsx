import { useEffect, useRef, useState } from 'react';
import type { Task, Category } from '../types';
import { tagColor } from '../utils/tagColor';
import styles from './TaskSheet.module.css';

interface TaskDraft {
  id?: string;
  title: string;
  categoryId: string;
  dueDate: string | null;
  notes: string;
  completed: boolean;
  tags: string[];
}

interface Props {
  task?: Task;           // undefined = new task
  prefillTitle?: string; // populated from voice
  categories: Category[];
  knownTags: string[];
  onSave: (draft: TaskDraft) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function TaskSheet({ task, prefillTitle, categories, knownTags, onSave, onDelete, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(task?.title ?? prefillTitle ?? '');
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? categories[0]?.id ?? '');
  const [dueDate, setDueDate] = useState<string | null>(task?.dueDate ?? today);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!prefillTitle) return;
    const el = titleRef.current;
    if (!el) return;
    el.selectionStart = el.selectionEnd = el.value.length;
  }, [prefillTitle]);

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  }

  function removeTag(t: string) {
    setTags(prev => prev.filter(x => x !== t));
  }

  const suggestions = tagInput
    ? knownTags.filter(t => t.includes(tagInput.toLowerCase()) && !tags.includes(t))
    : knownTags.filter(t => !tags.includes(t));

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
      tags,
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

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Tags</span>
          <div className={styles.tagArea}>
            {tags.map(t => {
              const { bg, text } = tagColor(t);
              return (
                <span key={t} className={styles.tagChip} style={{ background: bg, color: text }}>
                  #{t}
                  <button className={styles.tagRemove} onClick={() => removeTag(t)} aria-label={`Remove ${t}`} style={{ color: text }}>
                    <span className="msym" style={{ fontSize: 14 }}>close</span>
                  </button>
                </span>
              );
            })}
            <input
              className={styles.tagInput}
              type="text"
              placeholder={tags.length ? 'Add another…' : 'Add a tag…'}
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                if (e.key === 'Backspace' && !tagInput && tags.length) removeTag(tags[tags.length - 1]);
              }}
            />
          </div>
          {suggestions.length > 0 && (
            <div className={styles.tagSuggestions}>
              {suggestions.map(t => {
                const { bg, text } = tagColor(t);
                return (
                  <button key={t} className={styles.tagSuggestion} onClick={() => addTag(t)}
                    style={{ background: bg, color: text, borderColor: 'transparent' }}>
                    #{t}
                  </button>
                );
              })}
            </div>
          )}
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
