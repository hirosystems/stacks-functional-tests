import { StacksTestnet } from '@stacks/network';
import { PoxInfo, StackingClient } from '@stacks/stacking';
import { getNonce } from '@stacks/transactions';
import { Wallet, generateNewAccount, generateWallet } from '@stacks/wallet-sdk';
import * as crypto from 'crypto';
import { ENV } from '../env';
import { getAccount, waitForRewardPhase } from '../helpers';
import { withRetry } from '../utils';

jest.setTimeout(1_000_000_000);

describe('nakamoto pox-4', () => {
  const network = new StacksTestnet({
    // url: 'https://api.nakamoto.testnet.hiro.so',
    fetchFn: withRetry(5, fetch),
  });

  let wallet: Wallet;
  let poxInfo: PoxInfo;

  const bob = getAccount(ENV.SENDER_KEY);

  beforeAll(async () => {
    wallet = await generateWallet({
      secretKey:
        'switch hazard add rare render aim pull unlock teach boss parrot mistake bargain fall system blame find grid matrix sentence season sudden please tobacco',
      password: '',
    });
    wallet = Array.from({ length: 7 }).reduce((acc: Wallet) => generateNewAccount(acc), wallet);
  });

  test('get pox info', async () => {
    const client = new StackingClient('', network);
    poxInfo = await client.getPoxInfo();
    console.log(poxInfo);
    console.log('blocks_until_prepare_phase', poxInfo.next_cycle.blocks_until_prepare_phase);
  });

  // test get signer info
  test('get signer info', () => {
    const signer = getAccount(wallet.accounts[0].stxPrivateKey);
    console.log(signer);
  });

  test('get account status', async () => {
    const status = await bob.client.getStatus();
    console.log(status);

    const balance = await bob.client.getAccountBalanceLocked();
    const locked = await bob.client.getAccountBalanceLocked();
    console.log('locked', locked);

    const extended = await bob.client.getAccountExtendedBalances();
    console.log('extended', extended);

    poxInfo = await bob.client.getPoxInfo();
    console.log('min_threshold_ustx', poxInfo.next_cycle.min_threshold_ustx);
    console.log('min_amount_ustx', poxInfo.min_amount_ustx);

    if (
      balance < (BigInt(poxInfo.next_cycle.min_threshold_ustx) * 105n) / 100n ||
      balance < (BigInt(poxInfo.min_amount_ustx) * 105n) / 100n
    )
      throw new Error('not enough balance');
  });

  test('bob stack-stx', async () => {
    const bob = getAccount(ENV.SENDER_KEY);
    const signer = getAccount(wallet.accounts[0].stxPrivateKey);

    // PREP
    const client = new StackingClient(bob.address, network);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    console.log('current-cycle', currentCycle);
    const nextCycle = currentCycle + 1;
    const lockPeriod = 4;
    const amount = (BigInt(poxInfo.next_cycle.min_threshold_ustx) * 105n) / 100n;
    console.log('amount', amount);
    const authId = crypto.randomBytes(1)[0];
    console.log('authId', authId);
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: bob.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    console.log('sig', signature);
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: bob.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: bob.key,
    });
    console.log('txid', txid);
    // naka e9da87b229e75553797bcce86bc70cab807c802d53e0abc4e81ff4b77874ef4a
    // testnet 1f18f067b6cae4aa3fbb10bd938b8bceaabefa741346dc3ec686d66622893ae1 -- not enough locked
    // testnet 99416f429a04a13c5736965023e543b56143bb6cb77b0678000f00fa360eccfa -- more than availabe funds
    // testnet 9b77d3eb5c1d1fcc5b07fe7c6b67d2199aee766c6db72708f3ce1166fbb8d069 -- not found
    // testnet 7be56648a46c89df12e0ac980a8dd659c6532d61fe677ad228292f8dcbb0d16a -- not enough funds
    // testnet e81903115328f7f1a241437c6cd93fc480ed42d0135699ef54db68ca53909dc6
    return;

    // // CHECK POX-4 EVENTS
    // const { results } = await getPox4Events();
    // const datas = results.map(r => r.data).filter(d => d.signer_key.includes(bob.signerPublicKey));

    // expect(datas).toContainEqual(
    //   expect.objectContaining({
    //     start_cycle_id: nextCycle.toString(),
    //     end_cycle_id: (nextCycle + lockPeriod).toString(),
    //   })
    // );

    // // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    // let info = await client.getStatus();
    // if (!info.stacked) throw 'not stacked';

    // expect(info.details.unlock_height).toBeGreaterThan(0);
    // expect(info.details.unlock_height).toBe(
    //   stackHeight -
    //     (stackHeight % poxInfo.reward_cycle_length) +
    //     poxInfo.reward_cycle_length * (lockPeriod + 1)
    // );
    // expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(
    //   nextCycle + lockPeriod
    // ); // same as end_cycle_id

    // if (ENV.REGTEST_SKIP_UNLOCK) return;
    // await waitForBurnBlockHeight(info.details.unlock_height + 2);
    // info = await client.getStatus();
    // expect(info.stacked).toBeFalsy();

    // // ENSURE REWARDS
    // const reward = (await getRewards(bob.btcAddress))[0];
    // expect(reward).toBeDefined();
    // expect(reward.burn_block_height).toBeGreaterThan(stackHeight);
  });

  test('pool delegate', async () => {
    const pool = getAccount(wallet.accounts[4].stxPrivateKey);
    const amy = getAccount(wallet.accounts[5].stxPrivateKey);
    const barb = getAccount(wallet.accounts[6].stxPrivateKey);

    poxInfo = await pool.client.getPoxInfo();

    const amount = (BigInt(poxInfo.min_amount_ustx) * 75n) / 100n;
    const nextCycle = poxInfo.reward_cycle_id + 1;
    const delegateStackCycles = 2;

    // TRANSACTION (amy delegate-stack)
    const { txid: amyDelegate } = await amy.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: amy.key,
    });
    console.log('amy delegate', amyDelegate); // e0e159d00474bca5ad1fe73475dc79632443ea5d29b6763678d614232d8d26c6

    // TRANSACTION (barb delegate-stack)
    const { txid: barbDelegate } = await barb.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: barb.key,
    });
    console.log('barb delegate', barbDelegate); // 06369da5c2b56479760e1aec2db4d68f1ded2d3c37ed0dfd333257b5fb85af37

    // TRANSACTION (pool amy stack-stx)
    let poolNonce = await getNonce(pool.address, network);
    const { txid: amyPool } = await pool.client.delegateStackStx({
      stacker: amy.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: delegateStackCycles,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    console.log('amy pool', amyPool); // b5d348e94e0215d18d4e73085d1d09a0c212f1271066ef0755d3b57c6ed717e0

    // TRANSACTION (pool barb stack-stx)
    const { txid: barbPool } = await pool.client.delegateStackStx({
      stacker: barb.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: delegateStackCycles,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    console.log('barb pool', barbPool); // d8802ec4c43ac3d990290875432163e05da5e00191c1aca6408cd992f6b7fce2

    // TRANSACTION (pool commit)
    const authId = crypto.randomBytes(1)[0];
    console.log('authId', authId);
    const signature = pool.client.signPoxSignature({
      topic: 'agg-commit',
      period: 1,
      rewardCycle: nextCycle,
      poxAddress: pool.btcAddress,
      signerPrivateKey: pool.signerPrivateKey,
      maxAmount: amount * 3n,
      authId,
    });
    const { txid: poolCommit } = await pool.client.stackAggregationCommitIndexed({
      poxAddress: pool.btcAddress,
      rewardCycle: nextCycle,
      signerKey: pool.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount * 3n,
      authId,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    console.log('pool commit', poolCommit); // 880f1459234d2435b080a99e485d86f3fac432e8f7dcd760c23546435b492054
  });
});
