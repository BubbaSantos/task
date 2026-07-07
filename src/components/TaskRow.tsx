import { useEffect, useRef, useState } from 'react';
import type { Task, Category, DateBucket } from '../types';
import { getDateBucket, formatDueDate } from '../utils/dates';
import styles from './TaskRow.module.css';

const SNAP = 80;
const AUTO = 220;

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
  const txRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const onDeleteRef = useRef(onDelete);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

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

  function handleContentClick() {
    if (txRef.current !== 0) { setAnimate(true); setTx(0); return; }
    onOpen(task);
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
      >
        <button
          className={`${styles.checkbox} ${task.completed ? styles.checked : ''}`}
          style={task.completed ? {} : { borderColor: category?.colour }}
          onClick={e => { e.stopPropagation(); onToggle(task.id); }}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed && <span className="msym" style={{ fontSize: 14, color: '#fff' }}>check</span>}
        </button>

        <div className={styles.content} onClick={handleContentClick}>
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
            {task.tags?.map(t => (
              <span key={t} className={styles.tagChip}>#{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
