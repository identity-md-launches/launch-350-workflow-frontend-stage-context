import { BaseError, ContractFunctionRevertedError, encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from 'viem';
import { contract, publicClient, type Config } from './config';

export const WINDOWS = [3600, 21600, 86400] as const;
export type WindowSeconds = typeof WINDOWS[number];
export type Point = { age: number; standard: number; truncated: number };
export type History = { seconds: WindowSeconds; state: 'ready'; points: Point[]; standard: number; truncated: number }
  | { seconds: WindowSeconds; state: 'short' | 'error'; message: string };
export const poolKeyType = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
export function poolKey(c: Config) {
  const token = contract(c, c.token.contract).address;
  const [currency0, currency1] = [c.pool.pairedCurrency, token].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return { currency0, currency1, fee: c.pool.fee, tickSpacing: c.pool.tickSpacing, hooks: contract(c, c.hook.contract).address };
}
export function poolId(c: Config): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters(poolKeyType), [poolKey(c)]));
}
export function meanTick(start: bigint, end: bigint, seconds: number) {
  if (seconds <= 0) throw Error('Window must be positive.');
  const delta = BigInt.asIntN(56, end - start);
  const divisor = BigInt(seconds);
  return Number(delta / divisor - (delta < 0n && delta % divisor !== 0n ? 1n : 0n));
}
export function tickPrice(tick: number, decimals0: number, decimals1: number) {
  return 1.0001 ** tick * 10 ** (decimals0 - decimals1);
}
export function sampleAges(seconds: number) { return Array.from({ length: 25 }, (_, i) => seconds - i * seconds / 24); }
export function seriesFromCumulatives(seconds: WindowSeconds, standard: readonly bigint[], truncated: readonly bigint[], decimals0: number, decimals1: number): History {
  const ages = sampleAges(seconds);
  if (standard.length !== ages.length || truncated.length !== ages.length) throw Error('Oracle response has an unexpected sample count.');
  const price = (series: readonly bigint[], start: number, end: number) => tickPrice(meanTick(series[start], series[end], ages[start] - ages[end]), decimals0, decimals1);
  return { seconds, state: 'ready', standard: price(standard, 0, 24), truncated: price(truncated, 0, 24),
    points: ages.slice(1).map((age, i) => ({ age, standard: price(standard, i, i + 1), truncated: price(truncated, i, i + 1) })) };
}
export function errorText(error: unknown) {
  if (error instanceof BaseError) return error.shortMessage;
  return error instanceof Error ? error.message : 'Request failed. Check your connection and try again.';
}
export function isHistoryError(error: unknown) {
  if (error instanceof BaseError) {
    const cause = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (cause instanceof ContractFunctionRevertedError && cause.data?.errorName === 'TargetPredatesOldestObservation') return true;
  }
  return /TargetPredatesOldestObservation/.test(errorText(error));
}
export function formatPrice(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (value > 0 && (value < 0.00001 || value >= 1e10)) return value.toExponential(4);
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 7 }).format(value);
}
export async function readHistory(client: ReturnType<typeof publicClient>, c: Config, seconds: WindowSeconds, blockNumber: bigint, decimals: number): Promise<History> {
  try {
    const result = await client.readContract({ ...contract(c, c.hook.contract), functionName: 'observe', args: [sampleAges(seconds), poolId(c)], blockNumber }) as [bigint[], bigint[]];
    return seriesFromCumulatives(seconds, result[0], result[1], c.network.nativeCurrency.decimals, decimals);
  } catch (e) {
    return isHistoryError(e) ? { seconds, state: 'short', message: 'Not enough history' } : { seconds, state: 'error', message: errorText(e) };
  }
}
