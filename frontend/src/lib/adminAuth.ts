import { ethers } from 'ethers';
import { API_BASE } from './api';

export async function buildAdminHeaders(
  walletAddress: string,
  signer: ethers.Signer,
): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/nonce?address=${walletAddress}`);
  if (!res.ok) throw new Error('nonce 발급 실패');
  const { nonce } = (await res.json()) as { nonce: string };
  const message = `admin-action:${nonce}:${Date.now()}`;
  const signature = await signer.signMessage(message);
  return {
    'X-Wallet-Address': walletAddress,
    'X-Signature': signature,
    'X-Message': message,
  };
}
