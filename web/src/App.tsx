import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Database, ExternalLink, Layers3, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { type Address, type Hash } from 'viem';
import { contract, publicClient, type Config } from './config';
import { errorText, formatPrice, poolId, WINDOWS, type WindowSeconds } from './oracle';
import { readSnapshot, switchNetwork, transact, type Snapshot } from './service';
import { Chart } from './Chart';
import { Swap, type RunTransaction } from './Swap';

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const duration = (seconds: number) => seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`;

export function App({ c }: { c: Config }) {
  const [account, setAccount] = useState<Address>(), [walletChain, setWalletChain] = useState<number>();
  const [walletError, setWalletError] = useState(''), [walletBusy, setWalletBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(), [loading, setLoading] = useState(true), [readError, setReadError] = useState('');
  const [windowSeconds, setWindowSeconds] = useState<WindowSeconds>(3600), [inverse, setInverse] = useState(false);
  const [busy, setBusy] = useState(false), [txStatus, setTxStatus] = useState(''), [txError, setTxError] = useState(''), [txHash, setTxHash] = useState<Hash>();
  const [target, setTarget] = useState('64'), [growError, setGrowError] = useState('');
  const refreshId = useRef(0), txLock = useRef(false), growInput = useRef<HTMLInputElement>(null);
  const provider = window.ethereum;
  const walletFallback = walletChain === c.chainId ? provider : undefined;
  const client = useMemo(() => publicClient(c, walletFallback), [c, walletFallback]);
  const correctChain = !!account && walletChain === c.chainId;
  const ready = correctChain && !!snapshot && !loading && !readError && !walletBusy;
  const history = snapshot?.histories.find(h => h.seconds === windowSeconds);
  const unit = inverse ? 'ETH per GEOM' : 'GEOM per ETH';
  const rate = (n: number) => formatPrice(inverse ? 1 / n : n);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    setLoading(true); setReadError('');
    try {
      const data = await readSnapshot(client, c, account);
      if (id !== refreshId.current) return;
      setSnapshot(data);
      setTarget(previous => Number(previous) <= data.next ? String(Math.min(65535, data.next + 32)) : previous);
    } catch (e) { if (id === refreshId.current) { setSnapshot(undefined); setReadError(errorText(e)); } }
    finally { if (id === refreshId.current) setLoading(false); }
  }, [c, client, account]);
  useEffect(() => {
    setSnapshot(undefined); void refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !txLock.current) void refresh(); }, 30000);
    return () => { refreshId.current++; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    if (!provider) return;
    let mounted = true;
    const sync = async () => {
      try { const [accounts, chain] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
        if (mounted) { setAccount(accounts[0]); setWalletChain(Number(chain)); } }
      catch { if (mounted) setWalletError('Unable to read the wallet. Unlock it and reconnect.'); }
    };
    const changed = () => { setSnapshot(undefined); setTxError(''); void sync(); };
    const disconnected = () => { setAccount(undefined); setWalletChain(undefined); setSnapshot(undefined); };
    void sync(); provider.on?.('accountsChanged', changed); provider.on?.('chainChanged', changed); provider.on?.('disconnect', disconnected);
    return () => { mounted = false; provider.removeListener?.('accountsChanged', changed); provider.removeListener?.('chainChanged', changed); provider.removeListener?.('disconnect', disconnected); };
  }, [provider]);
  async function connect() {
    setWalletError('');
    if (!provider) { setWalletError('No browser wallet found. Install an Ethereum browser wallet, then reload this page. Public oracle reads work without a wallet.'); return; }
    setWalletBusy(true);
    try { const accounts = await provider.request({ method: 'eth_requestAccounts' }); setAccount(accounts[0]); setWalletChain(Number(await provider.request({ method: 'eth_chainId' }))); }
    catch (e) { setWalletError(`${errorText(e)} Reopen your wallet and try connecting again.`); }
    finally { setWalletBusy(false); }
  }
  async function switchChain() {
    if (!provider) return;
    setWalletError(''); setWalletBusy(true);
    try { await switchNetwork(provider, c); setWalletChain(Number(await provider.request({ method: 'eth_chainId' }))); }
    catch (e) { setWalletError(`${errorText(e)} Select ${c.network.name} in your wallet or try switching again.`); }
    finally { setWalletBusy(false); }
  }
  const runTransaction: RunTransaction = async (call, action) => {
    if (!ready || !provider || !account || txLock.current) return false;
    txLock.current = true; setBusy(true); setTxError(''); setTxHash(undefined); setTxStatus(`${action}. Checking deployment…`);
    try {
      await transact(client, c, provider, account, call, (message, hash) => { setTxStatus(`${action}. ${message}`); if (hash) setTxHash(hash); });
      await refresh(); return true;
    } catch (e) { setTxStatus(''); setTxError(`${errorText(e)} Review your wallet and the explorer before retrying.`); return false; }
    finally { txLock.current = false; setBusy(false); }
  };
  async function grow() {
    setGrowError('');
    const n = Number(target);
    if (!/^\d+$/.test(target) || !Number.isInteger(n) || n <= (snapshot?.next ?? 0) || n > 65535) {
      setGrowError(`Enter a whole number from ${(snapshot?.next ?? 0) + 1} to 65,535.`); growInput.current?.focus(); return;
    }
    await runTransaction({ ...contract(c, c.hook.contract), functionName: 'increaseObservationCardinalityNext', args: [n, poolId(c)] }, `Grow the observation buffer to ${n.toLocaleString()} slots`);
  }
  const divergence = history?.state === 'ready' ? Math.abs(history.standard / history.truncated - 1) * 100 : undefined;

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><a href="#main" className="brand" aria-label="Geomean oracle home"><span className="brand-mark" aria-hidden="true"><Activity size={24} /></span><span>geomean<span className="brand-sub">ORACLE LAB</span></span></a>
      <nav aria-label="Main navigation"><a href="#oracle" className="nav-current">Oracle</a><a href="#swap">Swap</a><a href="#about">How it works <ArrowUpRight size={13} /></a></nav>
      <div className="header-actions"><span className="network-tag"><span className="status-dot" />{c.network.name}</span><button className="button wallet-button" onClick={connect} disabled={walletBusy || busy}><Wallet size={16} />{walletBusy ? 'Opening wallet…' : account ? short(account) : 'Connect wallet'}</button></div>
    </header>
    <main id="main">
      <div className="intro"><div><div className="eyebrow intro-label"><span />An onchain price observatory</div><h1>A steadier view of price.</h1><p>One pool. Two perspectives. Compare standard and truncated<br className="desktop-break" /> time-weighted prices from the Geomean oracle.</p></div><div className="pool-label"><span className="pair-icons"><span>Ξ</span><span>g</span></span><div><strong>ETH / {c.token.symbol}</strong><span>Uniswap v4 · {(c.pool.fee / 10000).toFixed(2)}% fee</span></div></div></div>
      {account && !correctChain && <div className="notice warning" role="status"><div><strong>Wrong wallet network</strong><p>Connect to {c.network.name} to grow the buffer or swap.</p></div><button className="button" disabled={walletBusy || busy} onClick={switchChain}>Switch to {c.network.name}</button></div>}
      <div role="alert" className={walletError ? 'notice warning' : 'empty-region'}>{walletError}</div>
      {readError && <div className="notice warning" role="alert"><div><strong>Unable to verify live data</strong><p>{readError}</p><p>Check your connection, then refresh. Transactions are disabled until verification succeeds.</p></div><button className="button" disabled={loading} onClick={() => void refresh()}>Retry reads</button></div>}
      <div className={txStatus || txError ? `notice ${txError ? 'warning' : 'transaction'}` : 'empty-region'}><div><p role="status">{txStatus}</p><p role="alert">{txError}</p>{txHash && <a href={`${c.network.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction {short(txHash)} <ExternalLink size={14} /></a>}</div></div>
      <div className="dashboard">
        <section id="oracle" className="card oracle-card" aria-labelledby="oracle-heading">
          <div className="card-heading"><div><span className="eyebrow">Price comparison</span><h2 id="oracle-heading">Time-weighted average price</h2></div><button className="icon-button" title="Refresh oracle data" aria-label="Refresh oracle data" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={17} /></button></div>
          <div className="chart-toolbar"><div className="segmented" role="group" aria-label="Chart time window">{WINDOWS.map(s => <button key={s} aria-pressed={windowSeconds === s} onClick={() => setWindowSeconds(s)}>{s / 3600}h</button>)}</div><label className="unit-select"><span className="sr-only">Price units</span><select value={inverse ? 'inverse' : 'direct'} onChange={e => setInverse(e.target.value === 'inverse')}><option value="direct">GEOM per ETH</option><option value="inverse">ETH per GEOM</option></select></label></div>
          <div className="price-summary"><div><span className="legend-label"><i className="legend standard" />Standard TWAP</span><strong>{history?.state === 'ready' ? rate(history.standard) : '—'}</strong><span className="small muted">{unit}</span></div><div><span className="legend-label"><i className="legend truncated" />Truncated TWAP</span><strong>{history?.state === 'ready' ? rate(history.truncated) : '—'}</strong><span className="small muted">{unit}</span></div><div className="divergence"><span className="small muted">Series divergence</span><strong>{divergence === undefined ? '—' : `${divergence.toFixed(3)}%`}</strong><span className="small muted">Standard vs truncated</span></div></div>
          <Chart history={history} inverse={inverse} loading={loading} hours={windowSeconds / 3600} />
          <div className="chart-footer"><span><span className={`status-dot ${snapshot ? '' : 'pending'}`} />{loading ? 'Refreshing data…' : snapshot ? `Block ${snapshot.block.toLocaleString()}` : 'Waiting for verified data'}</span><span>{snapshot ? `As of ${new Date(snapshot.timestamp * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC` : 'Public RPC · No backend'}</span></div>
        </section>
        <aside className="sidebar"><section className="card buffer-card" id="buffer" aria-labelledby="buffer-heading"><div className="card-heading"><div><span className="eyebrow">Oracle capacity</span><h2 id="buffer-heading">Observation buffer</h2></div><Database size={21} className="muted" /></div>
          <div className="buffer-number">{snapshot ? snapshot.cardinality.toLocaleString() : '—'}<span>{snapshot?.cardinality === 1 ? 'slot' : 'slots'}</span></div>
          <div className="buffer-visual" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} className={snapshot && i < Math.ceil(snapshot.cardinality / Math.max(snapshot.next, snapshot.cardinality, 32) * 32) ? 'filled' : ''} />)}</div>
          <dl className="buffer-stats"><div><dt>Requested capacity</dt><dd>{snapshot ? `${snapshot.next.toLocaleString()} ${snapshot.next === 1 ? 'slot' : 'slots'}` : '—'}</dd></div><div><dt>Current ring index</dt><dd>{snapshot?.index ?? '—'}</dd></div><div><dt>Oldest retained observation</dt><dd>{snapshot ? `${duration(snapshot.oldestAge)} ago` : '—'}</dd></div><div><dt>Latest observation</dt><dd>{snapshot ? `${duration(snapshot.lastAge)} ago` : '—'}</dd></div></dl>
          <div className="grow-form"><label htmlFor="capacity">New capacity <span className="small muted">slots</span></label><input id="capacity" ref={growInput} inputMode="numeric" type="number" step="1" min={(snapshot?.next ?? 0) + 1} max="65535" value={target} onChange={e => setTarget(e.target.value)} aria-invalid={!!growError} aria-describedby="grow-help grow-error" /><button className="button primary full" onClick={grow} disabled={!ready || busy || snapshot?.next === 65535}>{busy ? 'Transaction in progress…' : 'Grow buffer'} <ArrowUpRight size={17} /></button><p id="grow-error" className="error-text" role="alert">{growError}</p><p id="grow-help" className="small muted">{!account ? 'Connect your wallet to grow the buffer. ' : !correctChain ? `Switch to ${c.network.name} to continue. ` : ''}Anyone can add slots and pay the network fee. Larger increases cost more gas.</p></div>
          <div className="buffer-tip"><CircleHelp size={17} /><p>More slots retain more future observations. Growth takes effect on later writes; it cannot recover past history.</p></div>
        </section><div className="source-note"><ShieldCheck size={19} /><div><strong>Read directly from the chain</strong><p>Both series come from the same oracle call. No offchain price feeds.</p></div></div></aside>
        <Swap c={c} client={client} account={account} snapshot={snapshot} ready={ready} busy={busy} runTransaction={runTransaction} />
        <section className="card about-card" id="about"><div className="card-heading"><div><span className="eyebrow">Behind the numbers</span><h2>Same price. A different lens.</h2></div><Layers3 size={21} className="muted" /></div><div className="explanation"><span className="explanation-index">01</span><div><h3>Standard follows the pool</h3><p>A geometric mean of price over time. Every recorded tick contributes, including sharp moves.</p></div></div><div className="explanation"><span className="explanation-index">02</span><div><h3>Truncated limits each step</h3><p>Tick movement is capped at {snapshot ? snapshot.maxDelta.toLocaleString() : '—'} per observation. Sudden moves have a smaller immediate effect; the series can still drift.</p></div></div><div className="explanation"><span className="explanation-index">03</span><div><h3>History grows with activity</h3><p>The hook records the pre-swap tick at most once per timestamp. Slot capacity is not a count of filled observations or a time guarantee.</p></div></div><a href={`${c.network.explorer}/address/${contract(c, c.hook.contract).address}#code`} target="_blank" rel="noreferrer">Explore the oracle contract <ArrowUpRight size={15} /></a></section>
      </div>
      <section className="deployment-details" aria-label="Deployment and activity"><details><summary><span><ShieldCheck size={18} />Deployment & recent activity</span><ChevronRight size={18} /></summary><div className="details-grid"><div><h3>Attested contracts</h3>{c.contracts.map(x => <p key={x.name}><span>{x.name}</span><a className="address" href={`${c.network.explorer}/address/${x.address}`} target="_blank" rel="noreferrer">{x.address}<ExternalLink size={13} /></a></p>)}<p><span>Pool ID</span><code>{poolId(c)}</code></p><p><span>Connected wallet</span><code>{account ?? 'Not connected'}</code></p><p><span>Supply</span><strong>{snapshot ? `${Number(snapshot.totalSupply).toLocaleString()} ${snapshot.symbol}` : '—'}</strong></p><a href="./imd-deployment.json">View deployment manifest <ArrowRight size={13} /></a></div><div><h3>Buffer growth events</h3><p className="small muted">Latest 512 blocks · Filtered to this pool · Refreshes every 30 seconds</p>{snapshot?.eventError ? <p className="error-text">Events unavailable: {snapshot.eventError} Refresh to retry.</p> : !snapshot ? <p>Waiting for verified data.</p> : snapshot.events.length ? snapshot.events.map((event, i) => <p key={`${event.hash}-${i}`}><Check size={15} /> {event.old} → {event.next} slots <a href={`${c.network.explorer}/tx/${event.hash}`} target="_blank" rel="noreferrer">Block {event.block.toString()} <ExternalLink size={12} /></a></p>) : <p>No buffer growth events in this block range.</p>}<h3>Need test ETH?</h3><a href={c.network.faucets[0]} target="_blank" rel="noreferrer">Open a {c.network.name} faucet <ArrowUpRight size={13} /></a></div></div></details></section>
    </main>
    <footer><span><span className="footer-brand">geomean</span> A little less noise.</span><span>{c.network.name} testnet <span aria-hidden="true">/</span> Experimental oracle · Not a trading recommendation</span></footer>
  </>;
}
