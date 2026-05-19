import styles from './BarChart.module.css';
import { CANDIDATE_COLORS } from './DonutChart';

export interface BarEntry {
  id: number;
  name: string;
  photoUrl: string;
  votes: number;
}

interface Props {
  data: BarEntry[];
  totalVotes: number;
}

const RANKS = ['1위', '2위', '3위', '4위', '5위', '6위', '7위', '8위'];

export default function BarChart({ data, totalVotes }: Props) {
  const sorted = [...data].sort((a, b) => b.votes - a.votes || a.id - b.id);
  const max = sorted[0]?.votes ?? 1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>실시간 개표 현황</div>
      {sorted.map((c, i) => {
        const pct = totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) : '0.0';
        const barWidth = max > 0 ? (c.votes / max) * 100 : 0;
        const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length];
        return (
          <div key={c.id} className={`${styles.row} ${i === 0 ? styles.winner : ''}`}>
            <span className={styles.rank}>{RANKS[i] ?? `${i + 1}위`}</span>
            <img
              className={styles.photo}
              src={c.photoUrl}
              alt={c.name}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'><rect width='44' height='44' fill='%231a3a7a'/><text x='22' y='28' font-size='20' text-anchor='middle' fill='%2390caf9'>👤</text></svg>`;
              }}
            />
            <div className={styles.barArea}>
              <span className={styles.name}>{c.name}</span>
              <div className={styles.track}>
                <div
                  className={styles.bar}
                  style={{ width: `${barWidth}%`, background: color }}
                  data-pct={`${pct}%`}
                />
              </div>
            </div>
            <div className={styles.count}>
              {c.votes}
              <span className={styles.countUnit}> 표</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
