import { studionet } from 'genlayer-js/chains';

export const studioChainId = `0x${studionet.id.toString(16)}`;

function requireProvider(provider) {
  if (!provider || typeof provider.request !== 'function') {
    throw new Error('No compatible browser wallet was found.');
  }
}

function isUnknownChain(error) {
  return error?.code === 4902 || error?.data?.originalError?.code === 4902;
}

export async function ensureStudionet(provider) {
  requireProvider(provider);
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === studioChainId) return;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: studioChainId }] });
  } catch (error) {
    if (!isUnknownChain(error)) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: studioChainId,
        chainName: studionet.name,
        rpcUrls: studionet.rpcUrls.default.http,
        nativeCurrency: studionet.nativeCurrency,
        blockExplorerUrls: ['https://explorer-studio.genlayer.com'],
      }],
    });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: studioChainId }] });
  }

  const selected = await provider.request({ method: 'eth_chainId' });
  if (String(selected).toLowerCase() !== studioChainId) {
    throw new Error('Switch your wallet to GenLayer Studionet.');
  }
}

export async function connectWalletProvider(provider) {
  requireProvider(provider);
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0] || '')) {
    throw new Error('Wallet returned no valid account.');
  }
  await ensureStudionet(provider);
  return accounts[0];
}

export async function verifyWalletProvider(provider, address) {
  requireProvider(provider);
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!Array.isArray(accounts) || !accounts.some((account) => account.toLowerCase() === address.toLowerCase())) {
    throw new Error('The connected wallet account changed. Connect again before writing.');
  }
  await ensureStudionet(provider);
}
