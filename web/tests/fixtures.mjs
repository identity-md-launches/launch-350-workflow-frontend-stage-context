import { readFileSync } from 'node:fs';
import { decodeFunctionData, encodeAbiParameters, encodeErrorResult, encodeFunctionResult, parseAbi, parseAbiParameters, toHex } from 'viem';

export const manifest = JSON.parse(readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url)));
export const token = manifest.contracts.find(c => c.name === manifest.token.contract);
export const hook = manifest.contracts.find(c => c.name === manifest.hook.contract);
const tokenAbi = JSON.parse(readFileSync(new URL(`../../dist/${token.abiPath}`, import.meta.url)));
const hookAbi = JSON.parse(readFileSync(new URL(`../../dist/${hook.abiPath}`, import.meta.url)));
const key = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
const otherAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
  `function quoteExactInputSingle((${key} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
  'function execute(bytes commands,bytes[] inputs,uint256 deadline) payable',
  'function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)',
  'function approve(address token,address spender,uint160 amount,uint48 expiration)',
  'error Error(string)',
]);
export const fixtureAccount = '0x1111111111111111111111111111111111111111';
export const secondAccount = '0x2222222222222222222222222222222222222222';
const blockHash = `0x${'ab'.repeat(32)}`;
export function createFixture() {
  const state = {
    connected: false, chain: '0x1', known: false, account: fixtureAccount,
    next: 32, cardinality: 16, allowance: 0n, permit: 0n, expiration: 0,
    history: 'ready', rpcError: false, codeMissing: false, wrongRpc: false, simulationError: false,
    quoteError: false, rejectConnect: false, rejectSend: false, rejectSwitch: false,
    requests: [], walletRequests: [], sent: [], observations: [], timestamp: Math.floor(Date.now() / 1000),
  };
  const block = () => ({ number: '0x989680', hash: blockHash, parentHash: blockHash,
    timestamp: toHex(state.timestamp), nonce: '0x0000000000000000', sha3Uncles: blockHash,
    logsBloom: `0x${'00'.repeat(256)}`, transactionsRoot: blockHash, stateRoot: blockHash, receiptsRoot: blockHash,
    miner: fixtureAccount, difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x1000',
    gasLimit: '0x1c9c380', gasUsed: '0x100', baseFeePerGas: '0x3b9aca00', transactions: [], uncles: [], mixHash: blockHash });
  function abiFor(address) { return address.toLowerCase() === token.address ? tokenAbi : address.toLowerCase() === hook.address ? hookAbi : otherAbi; }
  function decode(tx) { return decodeFunctionData({ abi: abiFor(tx.to), data: tx.data }); }
  function contractCall(tx) {
    const abi = abiFor(tx.to);
    const { functionName, args } = decode(tx);
    const output = result => encodeFunctionResult({ abi, functionName, result });
    switch (functionName) {
      case 'poolManager': return output(manifest.network.uniswapV4.poolManager);
      case 'observationState': return output([1, state.cardinality, state.next]);
      case 'decimals': return output(18);
      case 'symbol': return output('GEOM');
      case 'totalSupply': return output(10n ** 27n);
      case 'MAX_ABS_TICK_DELTA': return output(9116);
      case 'getSlot0': return output([78588986356927097284479352776873n, 138000, 0, 3000]);
      case 'getLiquidity': return output(1000000000000000000n);
      case 'observationsById': return output([state.timestamp - (args[1] === 1n ? 30 : 100000), 138000, 10000000n, 9999999n, true]);
      case 'observe': {
        state.observations.push(args[0]);
        if (state.history === 'error') throw { code: -32000, message: 'Oracle RPC read failed' };
        if (state.history === 'short' || (state.history === 'short24' && args[0][0] === 86400)) throw { code: 3, message: 'execution reverted', data: encodeErrorResult({ abi: hookAbi, errorName: 'TargetPredatesOldestObservation', args: [state.timestamp - 1800, state.timestamp - args[0][0]] }) };
        const cumulative = (age, truncated) => {
          const t = 100000 - age;
          const ticks = truncated ? 138000 : 138100;
          return BigInt(Math.round(t * ticks + Math.sin(t / 2500) * (truncated ? 60000 : 240000)));
        };
        return output([args[0].map(a => cumulative(a, false)), args[0].map(a => cumulative(a, true))]);
      }
      case 'balanceOf': return output(100000n * 10n ** 18n);
      case 'allowance': return tx.to.toLowerCase() === token.address ? output(state.allowance) : output([state.permit, state.expiration, 0]);
      case 'quoteExactInputSingle':
        if (state.quoteError) throw { code: 3, message: 'execution reverted: insufficient liquidity', data: encodeErrorResult({ abi: otherAbi, errorName: 'Error', args: ['Insufficient liquidity'] }) };
        return output([args[0].zeroForOne ? args[0].exactAmount * 980000n : args[0].exactAmount / 980000n, 180000n]);
      case 'increaseObservationCardinalityNext': case 'approve': case 'execute':
        if (state.simulationError) throw { code: 3, message: 'execution reverted: simulation blocked', data: encodeErrorResult({ abi: otherAbi, errorName: 'Error', args: ['Simulation blocked'] }) };
        return functionName === 'approve' && tx.to.toLowerCase() === token.address ? output(true) : '0x';
      default: throw Error(`Unmocked call: ${functionName}`);
    }
  }
  async function rpc({ method, params = [] }) {
    state.requests.push({ method, params });
    if (state.rpcError) throw { code: -32000, message: 'Public RPC unavailable' };
    switch (method) {
      case 'eth_chainId': return state.wrongRpc ? '0x1' : manifest.walletAddChain.chainId;
      case 'eth_getCode': return state.codeMissing ? '0x' : '0x60016000';
      case 'eth_blockNumber': return '0x989680';
      case 'eth_getBlockByNumber': return block();
      case 'eth_getBalance': return toHex(10n * 10n ** 18n);
      case 'eth_getLogs': return [];
      case 'eth_call': return contractCall(params[0]);
      case 'eth_estimateGas': return '0x50000';
      case 'eth_getTransactionReceipt': return { blockHash, blockNumber: '0x989680', contractAddress: null,
        cumulativeGasUsed: '0x50000', effectiveGasPrice: '0x3b9aca00', from: state.account, gasUsed: '0x50000', logs: [],
        logsBloom: `0x${'00'.repeat(256)}`, status: '0x1', to: state.sent.at(-1)?.to ?? hook.address, transactionHash: params[0], transactionIndex: '0x0', type: '0x2' };
      default: throw Error(`Unmocked RPC: ${method}`);
    }
  }
  async function wallet(request) {
    state.walletRequests.push(request);
    switch (request.method) {
      case 'eth_accounts': return state.connected ? [state.account] : [];
      case 'eth_chainId': return state.chain;
      case 'eth_requestAccounts':
        if (state.rejectConnect) return { walletError: { code: 4001, message: 'Connection rejected.' } };
        state.connected = true; return [state.account];
      case 'wallet_switchEthereumChain':
        if (state.rejectSwitch) return { walletError: { code: 4001, message: 'Switch rejected.' } };
        if (!state.known) return { walletError: { code: 4902, message: 'Unknown chain.' } };
        state.chain = request.params[0].chainId; return null;
      case 'wallet_addEthereumChain': state.known = true; return null;
      case 'eth_sendTransaction': {
        if (state.rejectSend) return { walletError: { code: 4001, message: 'Transaction rejected.' } };
        const tx = request.params[0];
        const { functionName, args } = decode(tx);
        if (functionName === 'increaseObservationCardinalityNext') state.next = args[0];
        if (functionName === 'approve' && tx.to.toLowerCase() === token.address) state.allowance = args[1];
        else if (functionName === 'approve') { state.permit = args[2]; state.expiration = args[3]; }
        state.sent.push(tx); return `0x${state.sent.length.toString(16).padStart(64, '0')}`;
      }
      default: return rpc(request);
    }
  }
  return { state, rpc, wallet, decode };
}

export async function installFixture(page, fixture, wallet = true) {
  await page.route('https://**/*', async route => {
    if (!manifest.network.rpcUrls.some(url => route.request().url().replace(/\/$/, '') === url)) throw Error(`Unexpected external network request: ${route.request().url()}`);
    const body = route.request().postDataJSON();
    let response;
    try { response = { jsonrpc: '2.0', id: body.id, result: await fixture.rpc(body) }; }
    catch (error) { response = { jsonrpc: '2.0', id: body.id, error: { code: error.code ?? -32000, message: error.message, data: error.data } }; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  if (wallet) {
    await page.exposeFunction('fixtureWalletRequest', fixture.wallet);
    await page.addInitScript(() => {
      const listeners = {};
      window.ethereum = {
        request: async request => { const result = await window.fixtureWalletRequest(request); if (result?.walletError) throw Object.assign(new Error(result.walletError.message), result.walletError); return result; },
        on: (event, listener) => { (listeners[event] ??= []).push(listener); },
        removeListener: (event, listener) => { listeners[event] = listeners[event]?.filter(x => x !== listener); },
      };
      window.fixtureEmit = (event, value) => listeners[event]?.forEach(listener => listener(value));
    });
  }
}
