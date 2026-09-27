# Geomean oracle frontend

A single-page Vite, React and TypeScript interface for the deployed Sepolia ETH/GEOM oracle. Production files are in repository-root `dist/`; no server or rewrite rules are needed. JavaScript uses public JSON-RPC endpoints and an optional injected Ethereum wallet at runtime.

## Install, develop, preview

Requires Node 22.12+ (validated with Node 24.9.0), npm and the Git object for the deployed source commit.

```sh
cd web
npm ci
npm run build
npm run preview
```

`npm run dev` first builds deployment artifacts, then starts Vite with hot reload. The development middleware serves the same generated manifest and ABIs from `dist/`. `npm run preview` serves the complete production export. Do not open `index.html` as a `file://` URL: JSON fetching requires HTTP hosting. The HTML, font, CSS, JS, ABI and manifest paths are relative, including when hosted under an IPFS gateway subpath ending in `/`.

## Deployment configuration and ABI provenance

`deployment/handoff.json` and `deployment/network.json` are preserved copies of the supplied, pinned handoffs. They are build inputs; neither is imported into the browser bundle. There are no private credentials, API keys or project IDs.

`scripts/export.mjs`, run after Vite, reads each raw JSON ABI array from `git show <sourceCommit>:docs/abi/<Contract>.json`. It requires exact agreement with the existing ABI files and the handoff's canonical Keccak-256 hashes (recursively sorted object keys, unchanged array order, compact JSON). It copies the pinned ABI bytes to `dist/abi/`, then writes `dist/imd-deployment.json` with:

- Exact launch ID, chain ID, deployed source commit, attestation hash and complete contract name/address/ABI-hash set.
- The supplied `network` object, unchanged, and exact `walletAddChain` parameters.
- Attested pool parameters and token/hook identifiers needed to derive the pool key.
- Lowercase SHA-256 hashes for every other exported file, including HTML and ABIs. The manifest excludes itself.

The app fetches **this manifest** through `src/config.ts`, loads its referenced ABIs and verifies their canonical hashes. It derives the pool key and ID from that data. All Uniswap addresses, explorer/faucet links and RPC URLs come from `manifest.network`. Standard router, quoter, StateView and Permit2 interfaces are colocated in `src/protocol.ts`; deployed token/hook interfaces are never handwritten.

After modifying source, run `npm run build` to regenerate both assets and manifest. Never hand-edit `dist/` or maintain another deployment map. Builds fail on mismatched ABI provenance or export limits. Handoff hash matching establishes the supplied binding; the worker is not independently verifying an attestation signature.

## Oracle behavior

Public reads work before wallet connection. Each refresh pins pool/metadata/history reads to one block and makes one `observe()` call per 1h/6h/24h window. Each batch contains 25 ages, producing 24 adjacent interval TWAPs and an entire-window summary from the endpoints. Mean ticks use signed int56 modular subtraction and floor negative fractions, matching `consult()`. Price is `1.0001 ** meanTick` adjusted for currency decimals; reverse units are its reciprocal. Prices are approximate displayed numbers; transaction amounts remain bigint throughout.

The live ABI's `TargetPredatesOldestObservation` becomes “Not enough history.” Other RPC/revert failures are shown separately. Nothing generates placeholder chart prices. Data refreshes every 30 seconds while the page is visible, on wallet changes, after confirmation and through the refresh button.

The buffer shows capacity, requested capacity, ring index, oldest retained observation and latest write. Capacity can include unfilled slots. Anyone can request growth up to 65,535 slots; the input must exceed requested capacity. Growth costs gas, activates on subsequent writes and cannot restore overwritten history. Recent growth events are filtered by this pool over the latest 512 blocks; event errors are separately disclosed.

## Wallets and transactions

Supports browser wallets exposing `window.ethereum`; no WalletConnect ID was supplied, so QR/mobile WalletConnect is not implemented. The wallet's selected injected provider is used. A wrong-network banner offers a single switch action. Error 4902/unknown chain triggers the exact supplied add-chain request and a second switch. Rejection remains visible without chain addition.

Transaction controls require a connected account, correct chain, verified ABIs, matching RPC chain, nonempty code for deployed and configured Uniswap contracts, matching hook PoolManager, expected token metadata and initialized pool. HTTP RPCs are tried in supplied order with a connected correct-chain provider fallback. Signing always uses the visitor's wallet. Account and chain are rechecked before simulation and before sending; account/network changes invalidate quotes.

The primary user actions are grow, quote, explicit token approval, explicit Permit2 approval and swap. PoolManager-only callbacks are not user actions. There is no mint, ownership, upgrade, admin or pause control in these contracts. Generic ERC-20 transfers and LP position management are outside this oracle page's scope.

Quotes use `simulateContract(quoteExactInputSingle)`. Inputs reject excess decimal precision, zero and overflow. Slippage is 0.01–5% and applies through integer minimum-output arithmetic. Quotes expire after 60 seconds and are cleared after input/account/network/data changes and each confirmed action.

Native ETH buys send the exact amount and require no approval. Token sales require separate exact-amount ERC-20 approval to the configured Permit2, then a Permit2 allowance to the configured Universal Router for 30 minutes. Refresh the quote between steps. The router executes `0x10` with actions `0x060c0f`, native ETH settlement where appropriate, exact input, minimum output and a 20-minute execution deadline. All writes are simulated before the wallet prompt; confirmed/reverted/rejected/pending states and explorer links are shown. No maximum allowance is requested. Retain ETH for gas.

## Validation

```sh
npm run typecheck
npm test
npm run build
npm run check:export
npm run test:browser
npm run check:chain
npm run test:live
```

Browser scripts start and close their own HTTP server under `/preview/` and use Playwright Chromium. Use `CHROMIUM_PATH=/path/to/chromium` if needed, or install Playwright Chromium with `npx playwright install chromium`. On this worker the installed Chromium headless shell is detected automatically. The MCP browser connector lacked its expected executable; the scripts supplied actual rendered browser validation instead.

`test:browser` drives the final production bundle with mocked EIP-1193 and JSON-RPC responses, including transaction signing and receipts. It sends no network transactions. `check:chain` performs only real RPC reads. `test:live` opens the export with unmodified public RPCs and no wallet. Reports and screenshots are in `docs/frontend/`; populated chart screenshots are explicitly fixture evidence, not historical market data.

See [validation](../docs/frontend/VALIDATION.md), [design](../docs/DESIGN.md) and [dependency notices](../docs/frontend/THIRD_PARTY.md). Live wallet signing, funded execution and publication/IPFS checks were not performed. The existing source, Foundry setup and libraries are unchanged.

## Submission scope

Only `web/**`, `dist/**` and `docs/**` are deliverables. The explicit `web/.gitignore` allowance is used for recursively excluding dependencies, caches and browser reports; caches are otherwise in temporary storage. Never add `node_modules`, npm caches, tarballs or submodules. Root `DESIGN.md` conflicts with the task's overriding write scope, so the implemented design record is at `docs/DESIGN.md`.

The workspace `.git` is mounted read-only. `git add` failed with “Unable to create .git/index.lock: Read-only file system”; therefore this worker could not stage or commit the deliverable. Source, lockfile, static export and evidence are present for the publisher to collect. This is a commit limitation, not a claim that a commit exists.
