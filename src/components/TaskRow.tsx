import type { Task, Category, DateBucket } from '../types';
import { getDateBucket, formatDueDate } from '../utils/dates';
import styles from './TaskRow.module.css';

interface Props {
  task: Task;
  category: Category | undefined;
  isLast: boolean;
  onToggle: (id: string) => void;
  onOpen: (task: Task) => void;
}

export function TaskRow({ task, category, isLast, onToggle, onOpen }: Props) {
  const bucket: DateBucket = getDateBucket(task.dueDate);
  const dateLabel = formatDueDate(task.dueDate, bucket);

  return (
    <div className={`${styles.row} ${isLast ? styles.last : ''}`}>
      <button
        className={`${styles.checkbox} ${task.completed ? styles.checked : ''}`}
        style={task.completed ? {} : { borderColor: category?.colour }}
        onClick={e => { e.stopPropagation(); onToggle(task.id); }}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.completed && <span className="msym" style={{ fontSize: 14, color: '#fff' }}>check</span>}
      </button>

      <div className={styles.content} onClick={() => onOpen(task)}>
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
        </div>
      </div>
    </div>
  );
}
