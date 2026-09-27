import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { keccak256, toBytes } from 'viem';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');
const handoff = JSON.parse(readFileSync(resolve(root, 'web/deployment/handoff.json')));
const network = JSON.parse(readFileSync(resolve(root, 'web/deployment/network.json')));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hashAbi = abi => keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
const check = process.argv.includes('--check');
if (handoff.chainId !== network.network.chainId || Number(network.walletAddChain.chainId) !== handoff.chainId)
  throw Error('Handoff and network chain IDs differ');
const contracts = handoff.contracts.map(({ name, address, abiHash }) => {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw Error('Unsafe contract name');
  const file = `docs/abi/${name}.json`;
  // Git object at the attested source commit, never a reconstructed interface.
  const bytes = execFileSync('git', ['show', `${handoff.sourceCommit}:${file}`], { cwd: root });
  const abi = JSON.parse(bytes);
  if (!Array.isArray(abi) || hashAbi(abi) !== abiHash) throw Error(`ABI hash mismatch: ${name}`);
  if (!bytes.equals(readFileSync(resolve(root, file)))) throw Error(`Source ABI differs from pinned commit: ${name}`);
  const abiPath = `abi/${name}.json`;
  if (check) {
    if (!bytes.equals(readFileSync(resolve(dist, abiPath)))) throw Error(`Export ABI changed: ${name}`);
  } else {
    mkdirSync(resolve(dist, 'abi'), { recursive: true });
    writeFileSync(resolve(dist, abiPath), bytes);
  }
  console.log(`Verified ${name}: ${abiHash}`);
  return { name, address, abiHash, abiPath };
});
function walk(dir, prefix = '') {
  return readdirSync(dir).sort().flatMap(name => {
    const path = prefix + name;
    return statSync(resolve(dir, name)).isDirectory() ? walk(resolve(dir, name), path + '/') : [path];
  });
}
let total = 0;
const assets = walk(dist).filter(p => p !== 'imd-deployment.json').map(path => {
  const bytes = readFileSync(resolve(dist, path));
  if (bytes.length > 8388608) throw Error(`Asset too large: ${path}`);
  total += bytes.length;
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
});
if (assets.length > 128 || total > 8 * 1024 * 1024 || !existsSync(resolve(dist, 'index.html')))
  throw Error('Export exceeds assignment budget or lacks index.html');
const result = {
  version: 1, launchId: handoff.launchId, chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash,
  contracts, assets, network: network.network, walletAddChain: network.walletAddChain,
  pool: handoff.manifest.pool, token: handoff.manifest.token, hook: { contract: handoff.manifest.hook.contract },
};
const serialized = JSON.stringify(result, null, 2) + '\n';
if (check) {
  if (readFileSync(resolve(dist, 'imd-deployment.json'), 'utf8') !== serialized) throw Error('Manifest inventory/configuration mismatch');
} else writeFileSync(resolve(dist, 'imd-deployment.json'), serialized);
console.log(`${check ? 'Checked' : 'Exported'} ${assets.length} assets, ${total} bytes; manifest excludes itself.`);
