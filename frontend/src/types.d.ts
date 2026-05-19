/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (data: unknown) => void) => void;
      removeListener: (event: string, handler: (data: unknown) => void) => void;
    };
  }
}
