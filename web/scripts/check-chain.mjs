import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, encodeAbiParameters, parseAbiParameters, keccak256 } from 'viem';
const manifest = JSON.parse(readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url)));
const evidence = { checkedAt: new Date().toISOString(), transactionsSent: 0, endpoints: [] };
for (const url of manifest.network.rpcUrls) {
  const entry = { url };
  evidence.endpoints.push(entry);
  try {
    const client = createPublicClient({ transport: http(url, { timeout: 8000, retryCount: 0 }) });
    entry.chainId = await client.getChainId();
    if (entry.chainId !== manifest.chainId) throw Error('Wrong RPC chain');
    entry.contracts = await Promise.all(manifest.contracts.map(async c => ({ name: c.name, address: c.address, codeBytes: ((await client.getCode({ address: c.address }))?.length - 2) / 2 })));
    if (entry.contracts.some(c => !c.codeBytes)) throw Error('Missing contract code');
    const hook = manifest.contracts.find(c => c.name === manifest.hook.contract);
    const token = manifest.contracts.find(c => c.name === manifest.token.contract);
    const abi = JSON.parse(readFileSync(new URL(`../../dist/${hook.abiPath}`, import.meta.url)));
    const id = keccak256(encodeAbiParameters(parseAbiParameters('address,address,uint24,int24,address'), [manifest.pool.pairedCurrency, token.address, manifest.pool.fee, manifest.pool.tickSpacing, hook.address]));
    entry.poolId = id;
    entry.block = (await client.getBlockNumber()).toString();
    entry.observationState = await client.readContract({ address: hook.address, abi, functionName: 'observationState', args: [id] });
    entry.windows = [];
    for (const seconds of [3600, 21600, 86400]) {
      try { const value = await client.readContract({ address: hook.address, abi, functionName: 'observe', args: [[seconds, 0], id] }); entry.windows.push({ seconds, result: value.map(a => a.map(String)) }); }
      catch (e) { entry.windows.push({ seconds, error: e.shortMessage ?? e.message }); }
    }
  } catch (e) { entry.error = e.shortMessage ?? e.message; }
}
writeFileSync(new URL('../../docs/frontend/live-chain.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
