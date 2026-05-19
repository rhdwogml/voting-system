export const API_BASE =
  (import.meta.env['VITE_API_BASE'] as string | undefined) ??
  'http://localhost:4000/api';

export interface Candidate {
  id: number;
  name: string;
  photoUrl: string;
  isActive: boolean;
}

export interface VotingHistory {
  contractAddress: string;
  title: string;
  deployedBy: string;
  deployedAt: string;
  endedAt: string | null;
  endReason: 'manual' | 'timeup' | null;
  winnerId: number | null;
  winnerName: string | null;
  totalVotes: number;
}

export async function fetchCandidates(): Promise<Candidate[]> {
  const res = await fetch(`${API_BASE}/candidates`);
  if (!res.ok) throw new Error('후보자 목록 조회 실패');
  return res.json() as Promise<Candidate[]>;
}

export async function fetchVotingHistory(): Promise<VotingHistory[]> {
  const res = await fetch(`${API_BASE}/votings`);
  if (!res.ok) throw new Error('투표 이력 조회 실패');
  return res.json() as Promise<VotingHistory[]>;
}

export async function fetchPrecheck(): Promise<{ canDeploy: boolean; reason: string }> {
  const res = await fetch(`${API_BASE}/votings/precheck`, { method: 'POST' });
  if (!res.ok) throw new Error('precheck 실패');
  return res.json() as Promise<{ canDeploy: boolean; reason: string }>;
}
