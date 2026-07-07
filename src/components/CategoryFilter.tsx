import type { Category } from '../types';
import styles from './CategoryFilter.module.css';

interface Props {
  categories: Category[];
  active: string | null;
  onChange: (id: string | null) => void;
}

export function CategoryFilter({ categories, active, onChange }: Props) {
  return (
    <div className={styles.row}>
      <button
        className={`${styles.pill} ${active === null ? styles.active : ''}`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          className={`${styles.pill} ${active === cat.id ? styles.active : ''}`}
          onClick={() => onChange(cat.id)}
        >
          <span className={styles.dot} style={{ background: cat.colour }} />
          {cat.name}
        </button>
      ))}
    </div>
  );
}
