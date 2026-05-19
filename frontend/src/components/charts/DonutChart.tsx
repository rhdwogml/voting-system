import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './DonutChart.module.css';

export const CANDIDATE_COLORS = [
  '#e53935', '#1e88e5', '#43a047', '#fb8c00',
  '#8e24aa', '#00897b', '#e91e63', '#fdd835',
];

export interface DonutEntry {
  name: string;
  votes: number;
}

interface Props {
  data: DonutEntry[];
  size?: number;
}

export default function DonutChart({ data, size = 200 }: Props) {
  const nonZero = data.filter((d) => d.votes > 0);
  if (nonZero.length === 0) {
    return (
      <div className={styles.wrapper} style={{ width: size }}>
        <span className={styles.title}>득표 분포</span>
        <div style={{ height: size, display: 'flex', alignItems: 'center', color: '#666' }}>
          아직 투표 없음
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <span className={styles.title}>득표 분포</span>
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={nonZero}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.28}
            outerRadius={size * 0.42}
            dataKey="votes"
            animationBegin={0}
            animationDuration={600}
          >
            {nonZero.map((_, i) => (
              <Cell
                key={i}
                fill={CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]}
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${value}표`, '득표수']}
            contentStyle={{ background: '#0d2257', border: '1px solid #1a3a7a', color: '#fff' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className={styles.legend}>
        {nonZero.map((d, i) => (
          <span key={i} className={styles.legendItem}>
            <span
              className={styles.dot}
              style={{ background: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length] }}
            />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}
