import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ethers } from 'ethers';
import VotingArtifact from '../contracts/Voting.json' assert { type: 'json' };
import { useWallet } from './WalletContext';
import { usePolling } from '../hooks/usePolling';

const API_BASE = import.meta.env.VITE_API_BASE as string ?? 'http://localhost:4000/api';
const RPC_URL = import.meta.env.VITE_RPC_URL as string | undefined;
const POLL_INTERVAL = 5_000;

export type ContractState = 'NONE' | 'IDLE' | 'ACTIVE' | 'ENDED' | 'UNKNOWN';

interface CurrentContractResponse {
  address: string | null;
  state: ContractState;
  title?: string;
  ownerAddress?: string | null;
}

interface VotingContextValue {
  contractAddress: string | null;
  contractTitle: string | null;
  state: ContractState;
  endTime: number | null;
  candidateCount: number;
  ownerAddress: string | null;
  isOwner: boolean;
  refresh: () => Promise<void>;
}

const VotingContext = createContext<VotingContextValue | null>(null);

import type { InterfaceAbi } from 'ethers';
const VOTING_ABI = (VotingArtifact as { abi: InterfaceAbi }).abi;
const READ_ABI = [
  'function endTime() view returns (uint256)',
  'function candidateCount() view returns (uint256)',
  'event Voted(address indexed voter, uint256 indexed candidateId, uint256 timestamp)',
  'event VotingStarted(uint256 endTime)',
  'event VotingEnded(string reason)',
];

export function VotingProvider({ children }: { children: React.ReactNode }) {
  const { address: walletAddress, provider } = useWallet();

  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [contractTitle, setContractTitle] = useState<string | null>(null);
  const [state, setState] = useState<ContractState>('NONE');
  const [endTime, setEndTime] = useState<number | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);

  const contractRef = useRef<ethers.Contract | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const isOwner =
    !!walletAddress &&
    !!ownerAddress &&
    walletAddress.toLowerCase() === ownerAddress.toLowerCase();

  // /contracts/current 폴링
  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/contracts/current`);
      const data = (await res.json()) as CurrentContractResponse;
      setContractAddress(data.address);
      setState(data.state);
      setContractTitle(data.title ?? null);
      setOwnerAddress(data.ownerAddress ?? null);
    } catch {
      // 백엔드 미응답 시 현재 상태 유지
    }
  }, []);

  // 컨트랙트 뷰 데이터 읽기 (endTime, candidateCount)
  const fetchContractViews = useCallback(
    async (addr: string) => {
      try {
        const p =
          provider ??
          (RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null);
        if (!p) return;

        const c = new ethers.Contract(addr, READ_ABI, p);
        const [et, cc] = await Promise.all([c.endTime(), c.candidateCount()]);
        setEndTime(Number(et));
        setCandidateCount(Number(cc));
      } catch {
        // view 호출 실패 시 무시
      }
    },
    [provider],
  );

  const refresh = useCallback(async () => {
    await fetchCurrent();
  }, [fetchCurrent]);

  // 5초 폴링
  usePolling(fetchCurrent, POLL_INTERVAL);

  // 초기 로드
  useEffect(() => {
    void fetchCurrent();
  }, [fetchCurrent]);

  // 컨트랙트 주소가 바뀌면 뷰 데이터 + 이벤트 구독 갱신
  useEffect(() => {
    if (!contractAddress) {
      contractRef.current = null;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setEndTime(null);
      setCandidateCount(0);
      return;
    }

    void fetchContractViews(contractAddress);

    // 이벤트 구독 (provider or RPC_URL 필요)
    const p =
      provider ??
      (RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null);
    if (!p) return;

    unsubscribeRef.current?.();

    const contract = new ethers.Contract(contractAddress, VOTING_ABI, p);
    contractRef.current = contract;

    const onVoted = () => {
      setCandidateCount((n) => n); // 득표수는 Home이 관리
      void fetchCurrent();
    };
    const onVotingStarted = () => void fetchCurrent();
    const onVotingEnded = () => void fetchCurrent();

    contract.on('Voted', onVoted);
    contract.on('VotingStarted', onVotingStarted);
    contract.on('VotingEnded', onVotingEnded);

    unsubscribeRef.current = () => {
      contract.removeAllListeners();
    };

    return () => {
      contract.removeAllListeners();
      unsubscribeRef.current = null;
    };
  }, [contractAddress, provider, fetchCurrent, fetchContractViews]);

  return (
    <VotingContext.Provider
      value={{
        contractAddress,
        contractTitle,
        state,
        endTime,
        candidateCount,
        ownerAddress,
        isOwner,
        refresh,
      }}
    >
      {children}
    </VotingContext.Provider>
  );
}

export function useVoting(): VotingContextValue {
  const ctx = useContext(VotingContext);
  if (!ctx) throw new Error('useVoting must be inside VotingProvider');
  return ctx;
}
