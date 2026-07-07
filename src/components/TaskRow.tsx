import { useEffect, useRef, useState } from 'react';
import type { Task, Category, DateBucket } from '../types';
import { getDateBucket, formatDueDate } from '../utils/dates';
import { tagColor } from '../utils/tagColor';
import styles from './TaskRow.module.css';

const SNAP = 80;
const AUTO = 220;
const PENDING_MS = 2500;
const FILL_MS = 650;

type RowState = 'idle' | 'pending' | 'completing';

interface Props {
  task: Task;
  category: Category | undefined;
  isLast: boolean;
  onToggle: (id: string) => void;
  onOpen: (task: Task) => void;
  onDelete: (id: string) => void;
}

export function TaskRow({ task, category, isLast, onToggle, onOpen, onDelete }: Props) {
  const bucket: DateBucket = getDateBucket(task.dueDate);
  const dateLabel = formatDueDate(task.dueDate, bucket);

  const [tx, _setTx] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [rowState, setRowState] = useState<RowState>('idle');

  const txRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDeleteRef = useRef(onDelete);
  const onToggleRef = useRef(onToggle);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  useEffect(() => { onToggleRef.current = onToggle; }, [onToggle]);

  useEffect(() => () => {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
  }, []);

  function setTx(v: number) { txRef.current = v; _setTx(v); }

  // Swipe gesture
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    let startX = 0, startY = 0, dir: 'h' | 'v' | null = null, baseX = 0;

    function onStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dir = null; baseX = txRef.current; setAnimate(false);
    }
    function onMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!dir) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (dir !== 'h') return;
      e.preventDefault();
      setTx(Math.min(0, Math.max(-(AUTO + 20), baseX + dx)));
    }
    function onEnd() {
      if (dir !== 'h') return;
      setAnimate(true);
      const t = txRef.current;
      if (t < -AUTO) {
        setTx(-window.innerWidth);
        setTimeout(() => onDeleteRef.current(task.id), 260);
      } else if (t < -(SNAP / 2)) {
        setTx(-SNAP);
      } else {
        setTx(0);
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [task.id]);

  function handleRowClick() {
    // Close swipe if open
    if (txRef.current !== 0) { setAnimate(true); setTx(0); return; }
    // Ignore clicks while completing animation plays
    if (rowState === 'completing') return;

    // Un-checking completed task is instant
    if (task.completed) {
      onToggleRef.current(task.id);
      return;
    }

    if (rowState === 'idle') {
      // First tap — arm it
      setRowState('pending');
      pendingTimerRef.current = setTimeout(() => setRowState('idle'), PENDING_MS);
    } else {
      // Second tap — confirm: play fill animation then complete
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      setRowState('completing');
      setTimeout(() => {
        setRowState('idle');
        onToggleRef.current(task.id);
      }, FILL_MS);
    }
  }

  function handleDeleteClick() {
    setAnimate(true);
    setTx(-window.innerWidth);
    setTimeout(() => onDeleteRef.current(task.id), 260);
  }

  const showRing = rowState === 'pending' || rowState === 'completing';

  return (
    <div className={`${styles.swipeWrapper} ${isLast ? styles.last : ''}`}>
      <button className={styles.deleteBtn} onClick={handleDeleteClick} aria-label="Delete task">
        Delete
      </button>
      <div
        ref={rowRef}
        className={`${styles.row} ${animate ? styles.animate : ''} ${rowState === 'pending' ? styles.rowPending : ''}`}
        style={{ transform: `translateX(${tx}px)` }}
        onClick={handleRowClick}
      >
        {/* Checkbox */}
        <div className={styles.checkWrap}>
          <div
            className={`${styles.checkbox} ${task.completed ? styles.checked : ''}`}
            style={task.completed || showRing ? {} : { borderColor: category?.colour }}
          >
            {task.completed && <span className="msym" style={{ fontSize: 14, color: '#fff' }}>check</span>}
            {showRing && !task.completed && (
              <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden>
                <circle
                  cx="12" cy="12" r="10"
                  className={rowState === 'completing' ? styles.ringFill : styles.ringIdle}
                />
              </svg>
            )}
          </div>
          {rowState === 'pending' && (
            <span className={styles.tapAgain}>Tap to confirm</span>
          )}
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={`${styles.title} ${task.completed ? styles.completed : ''}`}>
            {task.title}
          </div>
          <div className={styles.meta}>
            {category && (
              <>
                <span className={styles.dot} style={{ background: category.colour }} />
                <span className={styles.categoryName}>{category.name}</span>
              </>
            )}
            {task.dueDate && (
              <span className={`${styles.dateChip} ${bucket === 'overdue' ? styles.overdue : ''}`}>
                {dateLabel}
              </span>
            )}
            {task.notes && <span className={`msym ${styles.notesIcon}`}>notes</span>}
            {task.tags?.map(t => {
              const { bg, text } = tagColor(t);
              return (
                <span key={t} className={styles.tagChip} style={{ background: bg, color: text }}>#{t}</span>
              );
            })}
          </div>
        </div>

        {/* Info button */}
        <button
          className={styles.infoBtn}
          onClick={e => { e.stopPropagation(); onOpen(task); }}
          aria-label="Edit task"
        >
          <span className="msym" style={{ fontSize: 19 }}>info</span>
        </button>
      </div>
    </div>
  );
}
