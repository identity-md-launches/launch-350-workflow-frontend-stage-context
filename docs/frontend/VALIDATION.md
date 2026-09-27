# Frontend validation

## Scope and completion

Source, lockfile, implementation-derived ABI export, static site and worker evidence are delivered within `web/`, `dist/` and `docs/`. This worker did not publish the site or deploy/change contracts. The app uses the actual deployment handoff, preserved under `web/deployment/` so builds do not depend on the transient `.imd/reads` files.

**Implementation and local validation complete; repository commit blocked.** `git add web dist docs/frontend` failed because `.git/index.lock` cannot be created on this read-only Git mount. No commit was created in the actual repository. The final files are available for publisher collection. The requested root `DESIGN.md` is incompatible with the overriding path budget; `docs/DESIGN.md` contains the full implemented design record.

## Checks performed

| Check | Outcome |
| --- | --- |
| `npm install --cache /tmp/geomean-npm-cache` | Lockfile supplied; initial npm installation audited 143 packages, zero reported vulnerabilities |
| `npm run typecheck` | Passed, TypeScript strict/noEmit |
| `npm test` | 8 passed: ABI hashes, int56 wrap/negative rounding, all sampling windows, decimals/reciprocals, amount/slippage validation, router encoding, chain fallback/rejection and safe paths |
| `npm run build` | Passed; Vite relative base `./`; export manifest generated last. Vite warns that the main JS chunk exceeds 500 KB; complete runtime export remains below 1 MB |
| `npm run check:export` | Passed: exact pinned ABI bytes/hashes, exact deployment/network fields and exhaustive final-byte SHA-256 inventory |
| `npm run test:browser` | Passed against final static output at `/preview/`; detailed checks, measurements and screenshots in `browser-results.json` |
| `npm run check:chain` | All 3 configured public RPCs returned chain 11155111 and nonempty token/hook bytecode; read results in `live-chain.json` |
| `npm run test:live` | Actual Chromium rendering with public RPCs, no mocks/wallet: live reads rendered, all three windows showed insufficient history, font loaded, no browser errors, mobile had no horizontal overflow |

The tests use Chromium headless shell 154.0.8037.0 through Playwright. The provided MCP browser connector was attempted but could not find `/home/seat/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome`. Installed full Chrome also failed its crashpad initialization in this restricted workspace. The installed headless shell provided successful actual browser runs. Each script owns a bounded preview/browser lifecycle and closes both.

Unit and mocked browser checks send **zero real transactions**. The fixture decodes actual calldata from the compiled frontend and checks destination addresses, input values, approval amounts, the add-chain payload and router action bytes. No fixture code is imported by the production app.

## Interaction coverage

- Disconnected oracle reads; unavailable transaction controls; missing wallet, rejected connection, wrong network, exact unknown-chain add/switch fallback and rejected switch.
- Exactly one batched `observe()` per 1h, 6h and 24h window in a refresh; both price directions; full-window figures and 24-row accessible chart table.
- Insufficient-history errors distinct from RPC failures. Missing code, wrong RPC chain and tampered implementation ABI fail closed.
- Capacity validation; actual ABI-encoded growth simulation and mocked signing/receipt; refreshed requested capacity after confirmation.
- Invalid slippage, insufficient balance and quoter revert; precise offending-field feedback.
- Native buy without approval; two separately signed exact-amount token/Permit2 approval stages; token sell with zero native value. Every quote targets the configured quoter; every router/approval target derives from the network handoff.
- Changed inputs, time expiration and account changes invalidate old state. Wallet rejection and simulation revert are visible; failed simulation never sends a transaction.
- Keyboard skip link and time-window controls; semantic labels/table/disclosures; desktop and mobile layouts; reduced motion; 200% root text enlargement; no failed runtime resources or uncaught browser errors in the mocked session.

## Better Interface consolidated review

All six core domains in the pinned guide were read and applied during implementation. Evidence is source review plus rendered screenshots, browser interactions, computed color pairs and axe. This is a worker review, not independent certification.

| Domain | Coverage and evidence | Limitations |
| --- | --- | --- |
| Accessibility — Checked | Native buttons/fields/disclosures, labels and field errors, skip link, focus screenshot, keyboard selection, solid/dashed lines and data table, persistent live regions. Axe WCAG 2/2.1 AA tags found zero violations | No assistive screen-reader session, exhaustive keyboard walkthrough of wallet software or formal conformance claim |
| Layout — Checked | Shared card edges; content/action grouping; full page at 1440/880/768/390/320px; no page overflow; 200% root text enlargement at 880px | No physical devices, browser-native 200% zoom, RTL or pseudolocalization |
| Writing — Checked | Labels match transaction consequences; missing-history recovery; distinguish capacity from filled/history slots; network/approval/gas prerequisites; singular slot wording | English only |
| Typography — Checked | Real locally loaded variable font; hierarchy; tabular numbers; wrapping identifiers; 16px mobile fields; responsive SVG coordinate width preserves axis text | Platform fallback appearance not exhaustively tested; very small decorative brand lettering intentional |
| Colors — Checked | Semantic tokens; 7 rendered foreground/background measurements, all above 4.5:1; named solid/dashed series; axe scan | No dark theme (not applicable); not every hover/disabled/focus adjacency individually measured |
| UI — Checked | Empty/loading/error/disabled/active states, border hierarchy, modest selected-state shadow, 120ms button feedback, reduced-motion check, native disclosure affordances | No 10%-speed Animations-panel replay; no modal, theme switch or entrance animation (not applicable) |

### Findings fixed and rechecked

| Severity / domain | Final source location | Finding, correction and recheck |
| --- | --- | --- |
| Medium / data refresh | `web/src/App.tsx:22` | Browser instrumentation found six observe calls at first load. Wallet-chain discovery recreated an unchanged HTTP client. Memoization now depends on the actual fallback provider; the browser asserts three batches of 25 ages |
| Medium / typography | `web/src/Chart.tsx:7` | Initial fixed SVG viewBox shrank axis text on narrow screens. A ResizeObserver now matches viewBox width to CSS width, reduces x labels on narrow charts and retains the data table. Final browser asserts near-1:1 scale at 880/768/390/320px; `mobile-chart.png` was visually inspected |
| Medium / layout | `web/src/styles.css:211` | The 320px screenshot clipped the selected units. A 170px minimum for the select lets the toolbar wrap. The final chart screenshot shows the full label and no overflow |
| Medium / accessibility | `web/src/Swap.tsx:19` | Invalid slippage previously focused the amount field. Separate field identity/ref now mark and focus slippage correctly. Browser submits 9%, verifies `aria-invalid` and focus, then recovers |
| Low / writing | `web/src/Chart.tsx:19`, `web/src/App.tsx:114` | One-hour missing-history recovery offered a nonexistent shorter option and one slot used plural text. Copy now points to growth/future history for 1h and displays singular slot values. Rechecked with actual chain rendering |

An initial browser assertion ran before ResizeObserver settled after viewport resizing; the test now polls the measured scale instead of racing layout. Earlier screenshots and failed-run artifacts were removed from the final evidence set.

## Rendered evidence

`desktop.png`, `keyboard-focus.png`, `insufficient-history.png`, `880px.png`, `390px.png`, `320px.png`, and `mobile-chart.png` show **controlled mocked data and wallet behavior**, not actual market history. These support repeatable filled-chart, empty, interaction and responsive checks.

`live-desktop.png` and `live-mobile.png` show **actual RPC reads**. `live-browser.json` records the returned page text, requested RPC methods, font loading and errors. At validation the real oracle had `(index, cardinality, cardinalityNext) = (0,1,1)`. Both contracts had nonempty bytecode (1,753 bytes for Geomean and 8,843 for GeomeanOracleHook in the endpoint check). All configured RPCs reported the expected chain. The live chart correctly showed “Not enough history” for 1h/6h/24h.

## Untested behavior and trust limits

No real wallet was funded, connected or asked to sign; no live growth, approval, quote from a funded account or swap was broadcast. Mocked successful receipts do not establish chain execution success. The production app performs live simulations before signing. No contract tests/audit were rerun because this frontend task preserves deployed source and is not a redeployment or contract audit.

No IPFS pin, DNS/site name, named/immutable gateway check or control-plane publication verification was performed. Manifest/ABI hashing checks local handoff consistency and file integrity, not the authenticity of an arbitrary replaced manifest. Public RPC availability remains an external dependency. Recent events intentionally cover only 512 blocks. The page supports the attested native-ETH pool and injected browser wallets; other token pairs and WalletConnect are not implemented.

## Paths and size

Source and frontend configuration are entirely under `web/`; every production asset is under `dist/`; documentation/evidence are under `docs/`. The explicit `web/.gitignore` budget was used; no other ignore file was changed. Recursive `node_modules`, cache and test-report exclusions keep generated dependencies out of the submission. No archives or submodules were added. Root build settings, contracts, libraries and existing ABIs are unchanged.

The final packaging check is recorded in `submission-size.json`. A temporary Git repository under `test/scratch/` measures a full bundle of the existing history plus proposed delivery without modifying the actual read-only Git directory. That measurement is not a commit in the assigned repository, and the temporary bundle is not a deliverable.
