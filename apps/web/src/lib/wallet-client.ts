'use client';

import { createPublicClient, createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains';

export type InjectedProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (...args: never[]) => void) => void;
  removeListener?: (event: string, listener: (...args: never[]) => void) => void;
};

export function injectedProvider(): InjectedProvider {
  const provider = (globalThis as { ethereum?: InjectedProvider }).ethereum;
  if (!provider) {
    throw new Error(
      'No browser wallet detected. Install MetaMask or another Ethereum wallet, then reload.',
    );
  }
  return provider;
}

export function hasInjectedWallet(): boolean {
  return Boolean((globalThis as { ethereum?: InjectedProvider }).ethereum);
}

/// @dev Surfaces wallet rejections as plain language instead of raw RPC detail.
export function walletErrorMessage(error: unknown): string {
  const code = (error as { code?: number }).code;
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (code === 4001 || /user rejected|denied transaction|rejected the request/i.test(raw)) {
    return 'You rejected the request in your wallet.';
  }
  if (code === -32002) {
    return 'Your wallet already has a pending request. Open it and finish that first.';
  }
  if (/insufficient funds/i.test(raw)) {
    return 'This wallet has no Sepolia ETH for gas. Use a Sepolia faucet, then try again.';
  }
  return raw.split('\n')[0].slice(0, 200) || 'The wallet could not complete that request.';
}

export function watchWallet(options: {
  onAccounts: (accounts: string[]) => void;
  onChain: (chainId: number) => void;
}): () => void {
  const provider = (globalThis as { ethereum?: InjectedProvider }).ethereum;
  if (!provider?.on || !provider.removeListener) return () => {};
  const accounts = (...args: never[]) => options.onAccounts(args[0] as unknown as string[]);
  const chain = (...args: never[]) => options.onChain(Number(args[0]));
  provider.on('accountsChanged', accounts);
  provider.on('chainChanged', chain);
  return () => {
    provider.removeListener?.('accountsChanged', accounts);
    provider.removeListener?.('chainChanged', chain);
  };
}

export function sepoliaClients() {
  const provider = injectedProvider();
  return {
    publicClient: createPublicClient({ chain: sepolia, transport: custom(provider) }),
    walletClient: createWalletClient({ chain: sepolia, transport: custom(provider) }),
  };
}

export async function requestAccount(): Promise<string> {
  const provider = injectedProvider();
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts || accounts.length === 0) throw new Error('No account was shared by the wallet.');
  return accounts[0];
}

export async function currentChainId(): Promise<number> {
  const provider = injectedProvider();
  return Number(await provider.request({ method: 'eth_chainId' }));
}

export async function ensureSepolia(): Promise<void> {
  const provider = injectedProvider();
  if ((await currentChainId()) === sepolia.id) return;
  const chainIdHex = '0x' + sepolia.id.toString(16);
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chainIdHex,
          chainName: 'Sepolia',
          nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        },
      ],
    });
  }
}
