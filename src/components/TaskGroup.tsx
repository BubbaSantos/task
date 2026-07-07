import type { Task, Category, DateBucket } from '../types';
import { TaskRow } from './TaskRow';
import styles from './TaskGroup.module.css';

const BUCKET_LABELS: Record<DateBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'Upcoming',
  none: 'No date',
};

interface Props {
  bucket: DateBucket;
  tasks: Task[];
  categories: Category[];
  onToggle: (id: string) => void;
  onOpen: (task: Task) => void;
}

export function TaskGroup({ bucket, tasks, categories, onToggle, onOpen }: Props) {
  if (tasks.length === 0) return null;

  return (
    <div className={styles.group}>
      <div className={styles.label}>{BUCKET_LABELS[bucket]}</div>
      <div className={styles.card}>
        {tasks.map((task, i) => (
          <TaskRow
            key={task.id}
            task={task}
            category={categories.find(c => c.id === task.categoryId)}
            isLast={i === tasks.length - 1}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
