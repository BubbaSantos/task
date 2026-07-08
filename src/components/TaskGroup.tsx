import type { Task, Category, DateBucket } from '../types';
import { TaskRow } from './TaskRow';
import styles from './TaskGroup.module.css';

const BUCKET_LABELS: Record<DateBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'Upcoming',
  none: 'No date',
  completed: 'Completed',
  all: 'Tasks',
};

interface Props {
  bucket: DateBucket;
  tasks: Task[];
  categories: Category[];
  onToggle: (id: string) => void;
  onOpen: (task: Task) => void;
  onDelete: (id: string) => void;
  onClearCompleted?: () => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function TaskGroup({ bucket, tasks, categories, onToggle, onOpen, onDelete, onClearCompleted, collapsible, collapsed, onToggleCollapsed }: Props) {
  if (tasks.length === 0) return null;

  return (
    <div className={styles.group}>
      <div
        className={`${styles.labelRow} ${collapsible ? styles.labelRowClickable : ''}`}
        onClick={collapsible ? onToggleCollapsed : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
      >
        <span className={styles.label}>
          {collapsible && (
            <span className={`msym ${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}>expand_more</span>
          )}
          {BUCKET_LABELS[bucket]} {collapsible && `(${tasks.length})`}
        </span>
        {onClearCompleted && (
          <button className={styles.clearBtn} onClick={e => { e.stopPropagation(); onClearCompleted(); }}>Clear all</button>
        )}
      </div>
      {!collapsed && (
        <div className={styles.card}>
          {tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              category={categories.find(c => c.id === task.categoryId)}
              isLast={i === tasks.length - 1}
              onToggle={onToggle}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
