import { encodeAbiParameters, parseAbi, parseAbiParameters, parseUnits, zeroAddress, type Address } from 'viem';
import { contract, type Config } from './config';
import { poolKey, poolKeyType } from './oracle';

// Standard protocol interfaces only. Deployed token and hook ABIs are loaded from the manifest.
export const stateViewAbi = parseAbi(['function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)', 'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)']);
export const quoterAbi = parseAbi([`function quoteExactInputSingle((${poolKeyType} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`]);
export const routerAbi = parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
export const permitAbi = parseAbi(['function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)', 'function approve(address token,address spender,uint160 amount,uint48 expiration)']);
export function amountUnits(value: string, decimals: number) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || (value.split('.')[1]?.length ?? 0) > decimals) throw Error(`Enter a positive amount with up to ${decimals} decimal places.`);
  const amount = parseUnits(value, decimals);
  if (amount <= 0n || amount >= 2n ** 128n) throw Error('Enter an amount greater than zero and below the swap limit.');
  return amount;
}
export function minimumOutput(output: bigint, slippage: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(slippage)) throw Error('Use a slippage from 0.01% to 5%, with up to two decimal places.');
  const bps = Math.round(Number(slippage) * 100);
  if (bps < 1 || bps > 500) throw Error('Use a slippage from 0.01% to 5%.');
  const min = output * BigInt(10000 - bps) / 10000n;
  if (min <= 0n || min >= 2n ** 128n) throw Error('The quote is outside the supported output range. Try another amount.');
  return min;
}
export function currencies(c: Config, sellToken: boolean) {
  const token = contract(c, c.token.contract).address;
  const input: Address = sellToken ? token : c.pool.pairedCurrency;
  const output: Address = sellToken ? c.pool.pairedCurrency : token;
  return { input, output, zeroForOne: input.toLowerCase() === poolKey(c).currency0.toLowerCase() };
}
export function swapCall(c: Config, sellToken: boolean, amount: bigint, minimum: bigint, deadline: bigint) {
  const { input, output, zeroForOne } = currencies(c, sellToken);
  const params = [
    encodeAbiParameters(parseAbiParameters(`(${poolKeyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`), [{ poolKey: poolKey(c), zeroForOne, amountIn: amount, amountOutMinimum: minimum, hookData: '0x' }]),
    encodeAbiParameters(parseAbiParameters('address,uint256'), [input, amount]),
    encodeAbiParameters(parseAbiParameters('address,uint256'), [output, minimum]),
  ];
  return { address: c.network.uniswapV4.universalRouter, abi: routerAbi, functionName: 'execute' as const,
    args: ['0x10', [encodeAbiParameters(parseAbiParameters('bytes,bytes[]'), ['0x060c0f', params])], deadline] as const,
    value: input === zeroAddress ? amount : 0n };
}
