
import { useVoting } from '../context/VotingContext';

export default function Home() {
  const { state, contractTitle, contractAddress } = useVoting();
  return (
    <div style={{ padding: '2rem', color: '#fff' }}>
      <h2>메인 대시보드</h2>
      <p>상태: <strong>{state}</strong></p>
      {contractTitle && <p>투표명: {contractTitle}</p>}
      {contractAddress && <p>컨트랙트: {contractAddress}</p>}
      <p style={{ color: '#90caf9' }}>Phase 7에서 구현 예정</p>
    </div>
  );
}
