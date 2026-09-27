import { createPublicClient, custom, defineChain, fallback, http, isAddress, keccak256, toBytes, type Abi, type Address, type EIP1193Provider } from 'viem';

export interface Deployment {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: Record<'poolManager' | 'universalRouter' | 'quoter' | 'stateView' | 'positionManager' | 'permit2', Address>;
  };
  walletAddChain: { chainId: `0x${string}`; chainName: string; rpcUrls: string[]; nativeCurrency: Deployment['network']['nativeCurrency']; blockExplorerUrls: string[] };
  pool: { fee: number; tickSpacing: number; pairedCurrency: Address };
  token: { name: string; symbol: string; contract: string; decimals: number };
  hook: { contract: string };
}
export type Config = Deployment & { abis: Record<string, Abi> };
export type Provider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: Provider } }

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function abiHash(abi: Abi) { return keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2); }
export function safePath(path: string) { return /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').includes('..'); }
export async function loadConfig(): Promise<Config> {
  const response = await fetch(new URL('./imd-deployment.json', document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw Error('Deployment configuration could not be loaded. Reload the page.');
  const d: Deployment = await response.json();
  if (d.version !== 1 || !Number.isSafeInteger(d.chainId) || d.network?.chainId !== d.chainId || Number(d.walletAddChain?.chainId) !== d.chainId)
    throw Error('Deployment network verification failed. Transactions are disabled.');
  if (!d.contracts?.length || !d.network.rpcUrls?.length || !d.pool || !d.token || !d.hook) throw Error('Deployment configuration is incomplete.');
  for (const url of [...d.network.rpcUrls, d.network.explorer]) if (!url.startsWith('https://')) throw Error('Public network endpoints must use HTTPS.');
  if (Object.values(d.network.uniswapV4).some(a => !isAddress(a)) || !isAddress(d.pool.pairedCurrency)) throw Error('Invalid network address.');
  const abis: Record<string, Abi> = {};
  for (const c of d.contracts) {
    if (!safePath(c.abiPath) || !isAddress(c.address)) throw Error('Invalid deployment contract.');
    const res = await fetch(new URL(c.abiPath, document.baseURI));
    if (!res.ok) throw Error(`Unable to load ${c.name} ABI. Reload the page.`);
    const abi: Abi = await res.json();
    if (!Array.isArray(abi) || abiHash(abi) !== c.abiHash) throw Error(`${c.name} ABI verification failed. Transactions are disabled.`);
    abis[c.name] = abi;
  }
  if (!abis[d.token.contract] || !abis[d.hook.contract]) throw Error('The token or oracle ABI is missing.');
  return { ...d, abis };
}
export const contract = (c: Config, name: string) => {
  const found = c.contracts.find(x => x.name === name);
  if (!found) throw Error(`Missing deployment contract: ${name}`);
  return { address: found.address, abi: c.abis[name] };
};
export const chainFor = (c: Config) => defineChain({ id: c.chainId, name: c.network.name, nativeCurrency: c.network.nativeCurrency,
  rpcUrls: { default: { http: c.network.rpcUrls } }, blockExplorers: { default: { name: `${c.network.name} explorer`, url: c.network.explorer } }, testnet: c.network.testnet });
export function publicClient(c: Config, provider?: Provider) {
  return createPublicClient({ chain: chainFor(c), transport: fallback([
    ...c.network.rpcUrls.map(url => http(url, { timeout: 6500, retryCount: 0 })),
    ...(provider ? [custom(provider, { retryCount: 0 })] : []),
  ], { retryCount: 0 }) });
}
