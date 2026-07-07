import { useEffect, useState } from 'react';
import styles from './VersionBadge.module.css';

export function VersionBadge() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`${styles.badge} ${visible ? styles.show : styles.hide}`}>
      v{__APP_VERSION__}
    </div>
  );
}
