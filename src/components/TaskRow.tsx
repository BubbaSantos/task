import { useEffect, useRef, useState } from 'react';
import type { Task, Category, DateBucket } from '../types';
import { getDateBucket, formatDueDate } from '../utils/dates';
import { tagColor } from '../utils/tagColor';
import styles from './TaskRow.module.css';

const SNAP = 80;
const AUTO = 220;
const PENDING_MS = 2500;

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
  const [pendingCheck, setPendingCheck] = useState(false);
  const txRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDeleteRef = useRef(onDelete);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  // Clear pending state on unmount
  useEffect(() => () => { if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current); }, []);

  function setTx(v: number) { txRef.current = v; _setTx(v); }

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

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation();

    // Un-checking needs no confirmation
    if (task.completed) {
      onToggle(task.id);
      return;
    }

    if (pendingCheck) {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      setPendingCheck(false);
      onToggle(task.id);
    } else {
      setPendingCheck(true);
      pendingTimerRef.current = setTimeout(() => setPendingCheck(false), PENDING_MS);
    }
  }

  function handleRowClick() {
    if (txRef.current !== 0) { setAnimate(true); setTx(0); }
  }

  function handleDeleteClick() {
    setAnimate(true);
    setTx(-window.innerWidth);
    setTimeout(() => onDeleteRef.current(task.id), 260);
  }

  return (
    <div className={`${styles.swipeWrapper} ${isLast ? styles.last : ''}`}>
      <button className={styles.deleteBtn} onClick={handleDeleteClick} aria-label="Delete task">
        Delete
      </button>
      <div
        ref={rowRef}
        className={`${styles.row} ${animate ? styles.animate : ''}`}
        style={{ transform: `translateX(${tx}px)` }}
        onClick={handleRowClick}
      >
        <div className={styles.checkWrap}>
          <button
            className={`${styles.checkbox} ${task.completed ? styles.checked : ''} ${pendingCheck ? styles.pending : ''}`}
            style={task.completed || pendingCheck ? {} : { borderColor: category?.colour }}
            onClick={handleCheckboxClick}
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {task.completed && <span className="msym" style={{ fontSize: 14, color: '#fff' }}>check</span>}
            {pendingCheck && !task.completed && (
              <svg className={styles.countdownRing} viewBox="0 0 22 22">
                <circle cx="11" cy="11" r="9" />
              </svg>
            )}
          </button>
          {pendingCheck && (
            <span className={styles.tapAgain}>Tap again</span>
          )}
        </div>

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
            {task.notes && (
              <span className={`msym ${styles.notesIcon}`}>notes</span>
            )}
            {task.tags?.map(t => {
              const { bg, text } = tagColor(t);
              return (
                <span key={t} className={styles.tagChip} style={{ background: bg, color: text }}>#{t}</span>
              );
            })}
          </div>
        </div>

        <button
          className={styles.viewBtn}
          onClick={e => { e.stopPropagation(); onOpen(task); }}
          aria-label="View task"
        >
          <span className="msym" style={{ fontSize: 19 }}>visibility</span>
        </button>
      </div>
    </div>
  );
}
