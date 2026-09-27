import { createWalletClient, custom, formatUnits, parseAbiItem, zeroAddress, type Address, type Hash } from 'viem';
import { chainFor, contract, publicClient, type Config, type Provider } from './config';
import { errorText, poolId, readHistory, WINDOWS, type History } from './oracle';
import { permitAbi, stateViewAbi } from './protocol';

export interface Snapshot {
  block: bigint; timestamp: number; decimals: number; symbol: string; totalSupply: string;
  index: number; cardinality: number; next: number; oldestAge: number; lastAge: number;
  maxDelta: number; tick: number; liquidity: bigint; histories: History[];
  ethBalance?: bigint; tokenBalance?: bigint; allowance?: bigint; permitAmount?: bigint; permitExpiry?: number;
  events: { hash: Hash; old: number; next: number; block: bigint }[]; eventError?: string;
}
export async function verifyDeployment(client: ReturnType<typeof publicClient>, c: Config) {
  if (await client.getChainId() !== c.chainId) throw Error('The RPC is on a different chain. Transactions are disabled.');
  if (c.pool.pairedCurrency !== zeroAddress) throw Error('This oracle interface requires the attested native currency pool.');
  const addresses = [...new Set([...c.contracts.map(x => x.address), ...Object.values(c.network.uniswapV4)])];
  await Promise.all(addresses.map(async address => {
    const code = await client.getCode({ address });
    if (!code || code === '0x') throw Error(`No contract code at ${address}. Transactions are disabled.`);
  }));
  const manager = await client.readContract({ ...contract(c, c.hook.contract), functionName: 'poolManager' }) as Address;
  if (manager.toLowerCase() !== c.network.uniswapV4.poolManager.toLowerCase()) throw Error('Oracle PoolManager does not match the network configuration.');
}
export async function readSnapshot(client: ReturnType<typeof publicClient>, c: Config, account?: Address): Promise<Snapshot> {
  await verifyDeployment(client, c);
  const block = await client.getBlock();
  const blockNumber = block.number;
  const hook = contract(c, c.hook.contract), token = contract(c, c.token.contract), id = poolId(c);
  const readHook = (functionName: string, args: unknown[] = []) => client.readContract({ ...hook, functionName, args, blockNumber });
  const readToken = (functionName: string, args: unknown[] = []) => client.readContract({ ...token, functionName, args, blockNumber });
  const [state, decimals, symbol, supply, delta, slot, liquidity] = await Promise.all([
    readHook('observationState', [id]) as Promise<[number, number, number]>,
    readToken('decimals') as Promise<number>, readToken('symbol') as Promise<string>, readToken('totalSupply') as Promise<bigint>,
    readHook('MAX_ABS_TICK_DELTA') as Promise<number>,
    client.readContract({ address: c.network.uniswapV4.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [id], blockNumber }),
    client.readContract({ address: c.network.uniswapV4.stateView, abi: stateViewAbi, functionName: 'getLiquidity', args: [id], blockNumber }),
  ]);
  if (decimals !== c.token.decimals || symbol !== c.token.symbol) throw Error('Token metadata does not match the deployment. Transactions are disabled.');
  const [index, cardinality, next] = state;
  if (!cardinality || slot[0] === 0n) throw Error('The pool is not initialized. Oracle reads and transactions are unavailable.');
  type Observation = [number, number, bigint, bigint, boolean];
  const [latest, candidate] = await Promise.all([
    readHook('observationsById', [id, BigInt(index)]) as Promise<Observation>,
    readHook('observationsById', [id, BigInt((index + 1) % cardinality)]) as Promise<Observation>,
  ]);
  const oldest = candidate[4] ? candidate : await readHook('observationsById', [id, 0n]) as Observation;
  const age = (timestamp: number) => Number(BigInt.asUintN(32, block.timestamp - BigInt(timestamp)));
  const histories = await Promise.all(WINDOWS.map(seconds => readHistory(client, c, seconds, blockNumber, decimals)));
  let balances = {};
  if (account) {
    const [ethBalance, tokenBalance, allowance, permit] = await Promise.all([
      client.getBalance({ address: account, blockNumber }), readToken('balanceOf', [account]) as Promise<bigint>,
      readToken('allowance', [account, c.network.uniswapV4.permit2]) as Promise<bigint>,
      client.readContract({ address: c.network.uniswapV4.permit2, abi: permitAbi, functionName: 'allowance', args: [account, token.address, c.network.uniswapV4.universalRouter], blockNumber }),
    ]);
    balances = { ethBalance, tokenBalance, allowance, permitAmount: permit[0], permitExpiry: permit[1] };
  }
  const events: Snapshot['events'] = [];
  let eventError: string | undefined;
  try {
    const logs = await client.getLogs({ address: hook.address, event: parseAbiItem('event IncreaseObservationCardinalityNext(bytes32 indexed underlyingPoolId,uint16 observationCardinalityNextOld,uint16 observationCardinalityNextNew)'), args: { underlyingPoolId: id }, fromBlock: blockNumber > 512n ? blockNumber - 512n : 0n, toBlock: blockNumber, strict: true });
    for (const log of logs.slice(-4).reverse()) events.push({ hash: log.transactionHash, old: log.args.observationCardinalityNextOld, next: log.args.observationCardinalityNextNew, block: log.blockNumber });
  } catch (e) { eventError = errorText(e); }
  return { block: blockNumber, timestamp: Number(block.timestamp), decimals, symbol, totalSupply: formatUnits(supply, decimals),
    index, cardinality, next, oldestAge: age(oldest[0]), lastAge: age(latest[0]), maxDelta: delta, tick: slot[1], liquidity,
    histories, events, eventError, ...balances };
}
export async function switchNetwork(provider: Provider, c: Config) {
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.walletAddChain.chainId }] }); }
  catch (e) {
    const error = e as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    if (error.code !== 4902 && error.data?.originalError?.code !== 4902 && !/unknown chain|unrecognized chain|not added/i.test(error.message ?? '')) throw e;
    await provider.request({ method: 'wallet_addEthereumChain', params: [c.walletAddChain] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.walletAddChain.chainId }] });
  }
}
export async function assertWallet(provider: Provider, c: Config, account: Address) {
  const chain = await provider.request({ method: 'eth_chainId' });
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (Number(chain) !== c.chainId) throw Error(`Switch your wallet to ${c.network.name} and try again.`);
  if (accounts[0]?.toLowerCase() !== account.toLowerCase()) throw Error('Your wallet account changed. Review the action again.');
}
export async function transact(client: ReturnType<typeof publicClient>, c: Config, provider: Provider, account: Address,
  call: { address: Address; abi: import('viem').Abi; functionName: string; args: readonly unknown[]; value?: bigint },
  status: (message: string, hash?: Hash) => void) {
  await assertWallet(provider, c, account);
  await verifyDeployment(client, c);
  status('Simulating transaction…');
  const simulation = await client.simulateContract({ ...call, account });
  await assertWallet(provider, c, account);
  status('Confirm the transaction in your wallet.');
  const wallet = createWalletClient({ chain: chainFor(c), transport: custom(provider), account });
  const hash = await wallet.writeContract(simulation.request);
  status('Transaction submitted. Waiting for confirmation…', hash);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120000 });
  if (receipt.status !== 'success') throw Error('Transaction reverted. Inspect the transaction on the explorer before trying again.');
  status('Transaction confirmed.', hash);
  return hash;
}
