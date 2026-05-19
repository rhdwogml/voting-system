import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ethers } from 'ethers';

const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111

interface WalletContextValue {
  address: string | null;
  chainId: string | null;
  isConnected: boolean;
  isMetaMask: boolean;
  isSepolia: boolean;
  provider: ethers.BrowserProvider | null;
  connect: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  const isMetaMask = typeof window !== 'undefined' && !!window.ethereum?.isMetaMask;
  const isSepolia = chainId?.toLowerCase() === SEPOLIA_CHAIN_ID;

  const buildProvider = useCallback(() => {
    if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
    return null;
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error('MetaMask이 설치되어 있지 않습니다.');
    const accounts = (await window.ethereum.request({
      method: 'eth_requestAccounts',
    })) as string[];
    const id = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
    setAddress(accounts[0] ?? null);
    setChainId(id);
    setProvider(buildProvider());
  }, [buildProvider]);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (err) {
      if ((err as { code?: number }).code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID,
              chainName: 'Sepolia Testnet',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            },
          ],
        });
      }
    }
  }, []);

  // 초기 자동 감지
  useEffect(() => {
    if (!window.ethereum) return;

    void (window.ethereum.request({ method: 'eth_accounts' }) as Promise<string[]>).then(
      (accs) => {
        if (accs.length > 0) {
          setAddress(accs[0]);
          setProvider(buildProvider());
          void (
            window.ethereum!.request({ method: 'eth_chainId' }) as Promise<string>
          ).then(setChainId);
        }
      },
    );

    const onAccountsChanged = (data: unknown) => {
      const accs = data as string[];
      setAddress(accs[0] ?? null);
      if (accs.length === 0) setProvider(null);
    };
    const onChainChanged = (data: unknown) => {
      setChainId(data as string);
    };

    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', onChainChanged);
    return () => {
      window.ethereum?.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum?.removeListener('chainChanged', onChainChanged);
    };
  }, [buildProvider]);

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        isConnected: !!address,
        isMetaMask,
        isSepolia: !!isSepolia,
        provider,
        connect,
        switchToSepolia,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be inside WalletProvider');
  return ctx;
}
