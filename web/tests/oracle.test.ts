import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeAbiParameters, parseAbiParameters, zeroAddress } from 'viem';
import { abiHash, safePath, type Config } from '../src/config';
import { meanTick, sampleAges, seriesFromCumulatives, tickPrice, poolKey, poolId } from '../src/oracle';
import { amountUnits, minimumOutput, swapCall } from '../src/protocol';
import { switchNetwork, assertWallet } from '../src/service';
import { poolKeyType } from '../src/oracle';

const c = JSON.parse(readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8')) as Config;
c.abis = Object.fromEntries(c.contracts.map(x => [x.name, JSON.parse(readFileSync(new URL(`../../dist/${x.abiPath}`, import.meta.url), 'utf8'))]));
test('implementation ABIs match all handoff hashes', () => {
  for (const contract of c.contracts) assert.equal(abiHash(c.abis[contract.name]), contract.abiHash);
});
test('mean ticks floor negative fractions and preserve signed int56 wrapping', () => {
  assert.equal(meanTick(0n, -10n, 3), -4);
  assert.equal(meanTick(0n, 10n, 3), 3);
  assert.equal(meanTick((1n << 55n) - 5n, -(1n << 55n) + 5n, 3), 3);
  assert.equal(meanTick(-(1n << 55n) + 5n, (1n << 55n) - 5n, 3), -4);
  assert.throws(() => meanTick(0n, 0n, 0));
});
test('one batch per window yields 24 interval geometric means and full-window summary', () => {
  for (const seconds of [3600, 21600, 86400] as const) {
    const ages = sampleAges(seconds);
    assert.equal(ages.length, 25); assert.equal(ages[0], seconds); assert.equal(ages[24], 0);
    const result = seriesFromCumulatives(seconds, ages.map(age => -100n * BigInt(age)), ages.map(age => -50n * BigInt(age)), 18, 18);
    assert.equal(result.state, 'ready');
    if (result.state !== 'ready') return;
    assert.equal(result.points.length, 24);
    assert.equal(result.standard, 1.0001 ** 100);
    assert.equal(result.truncated, 1.0001 ** 50);
    assert.equal(result.points[0].standard, result.standard);
    assert.equal(result.points[23].age, 0);
  }
  assert.equal(tickPrice(0, 18, 6), 1e12);
  const price = tickPrice(138000, 18, 18);
  assert.ok(Math.abs(price * (1 / price) - 1) < 1e-12);
});
test('amount parsing rejects rounding, signs, zero, and uint128 overflow', () => {
  assert.equal(amountUnits('0.123456', 6), 123456n);
  for (const amount of ['0', '-1', '1e4', '.5', '1.0000001', '01']) assert.throws(() => amountUnits(amount, 6));
  assert.throws(() => amountUnits((1n << 128n).toString(), 0));
  assert.equal(minimumOutput(10000n, '0.5'), 9950n);
  for (const s of ['0', '5.1', '-1', '0.001', 'a']) assert.throws(() => minimumOutput(10000n, s));
});
test('router encoding uses attested currencies, exact amount, minimum and settlement actions', () => {
  assert.equal(poolKey(c).currency0, zeroAddress); assert.match(poolId(c), /^0x[0-9a-f]{64}$/);
  for (const sell of [false, true]) {
    const call = swapCall(c, sell, 123n, 99n, 1000n);
    assert.equal(call.address, c.network.uniswapV4.universalRouter); assert.equal(call.value, sell ? 0n : 123n);
    assert.equal(call.args[0], '0x10');
    const [actions, params] = decodeAbiParameters(parseAbiParameters('bytes,bytes[]'), call.args[1][0]);
    assert.equal(actions, '0x060c0f');
    const [swap] = decodeAbiParameters(parseAbiParameters(`(${poolKeyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`), params[0]);
    assert.equal(swap.zeroForOne, !sell); assert.equal(swap.amountIn, 123n); assert.equal(swap.amountOutMinimum, 99n);
    const [input, amount] = decodeAbiParameters(parseAbiParameters('address,uint256'), params[1]);
    const [output, minimum] = decodeAbiParameters(parseAbiParameters('address,uint256'), params[2]);
    assert.equal(input.toLowerCase(), sell ? c.contracts.find(x => x.name === c.token.contract)!.address : zeroAddress);
    assert.equal(output.toLowerCase(), sell ? zeroAddress : c.contracts.find(x => x.name === c.token.contract)!.address);
    assert.equal(amount, 123n); assert.equal(minimum, 99n);
  }
});
test('unknown chain receives exact add-chain payload, followed by another switch', async () => {
  const calls: { method: string; params?: unknown }[] = [];
  const provider = { request: async (request: { method: string; params?: unknown }) => {
    calls.push(request);
    if (calls.length === 1) throw Object.assign(new Error('Unknown chain'), { code: 4902 });
    return null;
  } };
  await switchNetwork(provider as never, c);
  assert.deepEqual(calls.map(x => x.method), ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
  assert.deepEqual(calls[1].params, [c.walletAddChain]);
});
test('wallet rejection is not misclassified as unknown chain; stale account is refused', async () => {
  let calls = 0;
  await assert.rejects(() => switchNetwork({ request: async () => { calls++; throw Object.assign(new Error('Rejected'), { code: 4001 }); } } as never, c), /Rejected/);
  assert.equal(calls, 1);
  await assert.rejects(() => assertWallet({ request: async ({ method }: { method: string }) => method === 'eth_chainId' ? c.walletAddChain.chainId : [] } as never, c, c.contracts[0].address), /account changed/);
});
test('ABI paths cannot escape static export', () => {
  assert.equal(safePath('abi/Geomean.json'), true);
  for (const path of ['../x', '/x', 'https://x/x', 'abi/../../x', 'abi/%2e%2e/x']) assert.equal(safePath(path), false);
});
