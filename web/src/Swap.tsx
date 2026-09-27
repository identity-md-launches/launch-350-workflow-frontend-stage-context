import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, Check, ExternalLink } from 'lucide-react';
import { formatUnits, type Address, type Abi } from 'viem';
import { contract, type Config, type publicClient } from './config';
import { errorText, formatPrice, poolKey } from './oracle';
import { amountUnits, currencies, minimumOutput, permitAbi, quoterAbi, swapCall } from './protocol';
import { type Snapshot } from './service';

export type TransactionCall = { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint };
export type RunTransaction = (call: TransactionCall, action: string) => Promise<boolean>;
interface Props { c: Config; client: ReturnType<typeof publicClient>; account?: Address; snapshot?: Snapshot; ready: boolean; busy: boolean; runTransaction: RunTransaction }
type Quote = { output: bigint; minimum: bigint; amount: bigint; time: number };

export function Swap({ c, client, account, snapshot, ready, busy, runTransaction }: Props) {
  const [sellToken, setSellToken] = useState(false), [amount, setAmount] = useState(''), [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<Quote>(), [quoting, setQuoting] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const slippageRef = useRef<HTMLInputElement>(null);
  const [invalidField, setInvalidField] = useState<'amount' | 'slippage'>();
  useEffect(() => { generation.current++; setQuote(undefined); setError(''); setInvalidField(undefined); }, [amount, slippage, sellToken, account, ready]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const inputSymbol = sellToken ? c.token.symbol : c.network.nativeCurrency.symbol;
  const outputSymbol = sellToken ? c.network.nativeCurrency.symbol : c.token.symbol;
  const inDecimals = sellToken ? snapshot?.decimals ?? c.token.decimals : c.network.nativeCurrency.decimals;
  const outDecimals = sellToken ? c.network.nativeCurrency.decimals : snapshot?.decimals ?? c.token.decimals;
  const balance = sellToken ? snapshot?.tokenBalance : snapshot?.ethBalance;
  const expired = !!quote && now - quote.time >= 60000;
  const tokenApproved = !!quote && (snapshot?.allowance ?? 0n) >= quote.amount;
  const routerApproved = !!quote && (snapshot?.permitAmount ?? 0n) >= quote.amount && (snapshot?.permitExpiry ?? 0) > now / 1000 + 60;
  const actionable = ready && !!quote && !expired && !busy && !quoting;

  async function getQuote() {
    setError(''); setQuote(undefined);
    const version = ++generation.current;
    let field: 'amount' | 'slippage' | undefined = 'amount';
    try {
      const units = amountUnits(amount, inDecimals);
      field = 'slippage';
      minimumOutput(1000000n, slippage);
      field = 'amount';
      if (balance === undefined || units > balance) throw Error(`Insufficient ${inputSymbol} balance. Reduce the amount or fund your wallet.`);
      field = undefined;
      if (!snapshot?.liquidity) throw Error('The pool has no active liquidity. A swap cannot be quoted.');
      setQuoting(true);
      const result = await client.simulateContract({ address: c.network.uniswapV4.quoter, abi: quoterAbi, functionName: 'quoteExactInputSingle',
        args: [{ poolKey: poolKey(c), zeroForOne: currencies(c, sellToken).zeroForOne, exactAmount: units, hookData: '0x' }], account });
      if (generation.current !== version) return;
      const minimum = minimumOutput(result.result[0], slippage);
      setQuote({ output: result.result[0], minimum, amount: units, time: Date.now() }); setNow(Date.now());
    } catch (e) { if (generation.current === version) { setError(`${errorText(e)} Check the amount and slippage, then request another quote.`); setInvalidField(field); (field === 'slippage' ? slippageRef : inputRef).current?.focus(); } }
    finally { setQuoting(false); }
  }
  async function approveToken() {
    if (!quote || !actionable) return;
    await runTransaction({ ...contract(c, c.token.contract), functionName: 'approve', args: [c.network.uniswapV4.permit2, quote.amount] }, `Approve ${amount} ${c.token.symbol} for Permit2`);
    setQuote(undefined);
  }
  async function approveRouter() {
    if (!quote || !actionable || !tokenApproved) return;
    await runTransaction({ address: c.network.uniswapV4.permit2, abi: permitAbi, functionName: 'approve', args: [contract(c, c.token.contract).address, c.network.uniswapV4.universalRouter, quote.amount, Math.floor(Date.now() / 1000) + 1800] }, `Allow the router to spend ${amount} ${c.token.symbol} for 30 minutes`);
    setQuote(undefined);
  }
  async function swap() {
    if (!quote || !actionable || (sellToken && (!tokenApproved || !routerApproved))) return;
    await runTransaction(swapCall(c, sellToken, quote.amount, quote.minimum, BigInt(Math.floor(Date.now() / 1000) + 1200)), `Swap ${amount} ${inputSymbol} for at least ${formatUnits(quote.minimum, outDecimals)} ${outputSymbol}`);
    setQuote(undefined);
  }
  return <section className="card swap-card" id="swap" aria-labelledby="swap-heading">
    <div className="card-heading"><div><span className="eyebrow">Trade the pool</span><h2 id="swap-heading">Swap {c.network.nativeCurrency.symbol} & {c.token.symbol}</h2></div><span className="tag">Testnet</span></div>
    <p className="muted">Quotes come from Uniswap v4. Your wallet confirms every transaction.</p>
    <div className="swap-layout"><div>
      <div className="amount-box"><label htmlFor="swap-amount">You pay</label><div className="amount-row"><input id="swap-amount" ref={inputRef} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} aria-invalid={invalidField === 'amount'} aria-describedby="swap-error" /><strong>{inputSymbol}</strong></div><span className="small muted">Balance: {balance !== undefined ? formatPrice(Number(formatUnits(balance, inDecimals))) : '—'} {inputSymbol}</span></div>
      <button className="direction-button" type="button" onClick={() => setSellToken(x => !x)} aria-label={`Switch to selling ${outputSymbol}`}><ArrowDownUp size={17} /></button>
      <div className="amount-box receive"><span className="field-label">You receive · estimated</span><div className="amount-row"><strong className="estimated">{quote ? formatPrice(Number(formatUnits(quote.output, outDecimals))) : '—'}</strong><strong>{outputSymbol}</strong></div><span className="small muted">{quote ? `1 ${inputSymbol} ≈ ${formatPrice(Number(formatUnits(quote.output, outDecimals)) / Number(amount))} ${outputSymbol}` : 'Request a quote to see the exchange rate'}</span></div>
    </div><div className="swap-review">
      <div className="slippage"><label htmlFor="slippage">Slippage tolerance</label><div><input id="slippage" ref={slippageRef} inputMode="decimal" value={slippage} onChange={e => setSlippage(e.target.value)} aria-invalid={invalidField === 'slippage'} aria-describedby="slippage-help swap-error" /><span>%</span></div></div>
      <p id="slippage-help" className="small muted">0.01%–5% · Pool fee {(c.pool.fee / 10000).toFixed(2)}%</p>
      <dl className="review-lines"><div><dt>Minimum received</dt><dd>{quote ? `${formatPrice(Number(formatUnits(quote.minimum, outDecimals)))} ${outputSymbol}` : '—'}</dd></div><div><dt>Quote expires in</dt><dd>{quote ? `${Math.max(0, Math.ceil((60000 - now + quote.time) / 1000))}s` : '—'}</dd></div></dl>
      <button className="button full" type="button" disabled={!ready || busy || quoting} onClick={getQuote}>{quoting ? 'Requesting quote…' : quote ? 'Refresh quote' : 'Get quote'} <ArrowRight size={16} /></button>
      {sellToken && <div className="approval-steps"><span className="small muted">Approve only the input amount. Requote after each confirmation.</span><button className="button full" disabled={!actionable || tokenApproved} onClick={approveToken}>{tokenApproved ? <Check size={15} /> : <span>1.</span>} Approve {c.token.symbol} for Permit2</button><button className="button full" disabled={!actionable || !tokenApproved || routerApproved} onClick={approveRouter}>{routerApproved ? <Check size={15} /> : <span>2.</span>} Allow router · 30 minutes</button></div>}
      <button className="button full dark" type="button" disabled={!actionable || (sellToken && (!tokenApproved || !routerApproved))} onClick={swap}>Swap {inputSymbol} for {outputSymbol} <ArrowRight size={16} /></button>
      <p className="small muted">{!account ? 'Connect your wallet to quote and swap.' : !ready ? 'Wait for verified data and the correct wallet network.' : expired ? 'Quote expired. Request a fresh quote to continue.' : !sellToken ? 'Native ETH needs no approval. Keep ETH for network fees.' : 'Token sales require both approval steps before swapping.'}</p>
      <p id="swap-error" className="error-text" role="alert">{error}</p>
      <a className="small" href={`${c.network.explorer}/address/${c.network.uniswapV4.universalRouter}`} target="_blank" rel="noreferrer">View Uniswap router <ExternalLink size={12} /></a>
    </div></div>
  </section>;
}
