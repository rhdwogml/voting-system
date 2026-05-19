// 컨트랙트 커스텀 에러 → 사람이 읽을 수 있는 메시지 매핑

export function parseContractError(err: unknown): string {
  const e = err as { code?: string | number; message?: string; reason?: string };
  const code = String(e.code ?? '');
  const msg = e.message ?? String(err);

  if (code === 'ACTION_REJECTED' || code === '4001' || msg.includes('user rejected'))
    return '취소되었습니다';
  if (msg.includes('AlreadyVoted'))       return '이미 투표하셨습니다';
  if (msg.includes('VotingClosed'))       return '투표 시간이 종료되었습니다';
  if (msg.includes('InvalidState'))       return '현재 상태에서 허용되지 않는 작업입니다';
  if (msg.includes('InvalidCandidate'))   return '유효하지 않은 후보자입니다';
  if (msg.includes('NotEnoughCandidates')) return '후보자가 최소 2명 이상 필요합니다';
  if (msg.includes('EndTimeInPast'))      return '종료 시각이 현재보다 이전입니다';
  if (msg.includes('NotOwner'))           return '관리자만 가능한 작업입니다';

  return `오류: ${msg.slice(0, 120)}`;
}
