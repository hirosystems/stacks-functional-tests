import { StacksDevnet } from '@stacks/network';
import { PoxInfo, StackingClient } from '@stacks/stacking';
import * as crypto from 'crypto';
import { ENV } from '../env';
import {
  burnHeightToRewardCycle,
  getAccount,
  getPox4Events,
  getRewards,
  isInPreparePhase,
  waitForBurnBlockHeight,
  waitForNextCycle,
  waitForNode,
  waitForPreparePhase,
  waitForRewardPhase,
  waitForTransaction,
} from '../helpers';
import { startRegtestEnv, stopRegtestEnv, storeEventsTsv } from '../utils';

jest.setTimeout(1_000_000_000);

describe('regtest-env pox-4', () => {
  const network = new StacksDevnet(); // this test only works on regtest-env
  let poxInfo: PoxInfo;

  beforeEach(async () => {
    await startRegtestEnv();
    await waitForNode();
  });

  afterEach(async () => {
    await stopRegtestEnv();
  });

  test('stack-stx (in reward-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    const nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = (BigInt(poxInfo.min_amount_ustx) * 120n) / 100n;
    const authId = crypto.randomBytes(1)[0];
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    const datas = results
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    let info = await client.getStatus();
    if (!info.stacked) throw 'not stacked';

    expect(info.details.unlock_height).toBeGreaterThan(0);
    expect(info.details.unlock_height).toBe(
      stackHeight -
        (stackHeight % poxInfo.reward_cycle_length) +
        poxInfo.reward_cycle_length * (lockPeriod + 1)
    );
    expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(
      nextCycle + lockPeriod
    ); // same as end_cycle_id

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    if (ENV.REGTEST_IGNORE_UNLOCK) return;
    await waitForBurnBlockHeight(info.details.unlock_height + 2);
    info = await client.getStatus();
    expect(info.stacked).toBeFalsy();

    // ENSURE REWARDS
    const reward = (await getRewards(steph.btcAddress))[0];
    expect(reward).toBeDefined();
    expect(reward.burn_block_height).toBeGreaterThan(stackHeight);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (before prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks on a prepare-phase start (not deep in
    // the prepare phase)
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo); // ensure we are not already somewhere in the prepare phase
    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo, -1); // one before real prepare phase

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();
    expect(
      isInPreparePhase((poxInfo.current_burnchain_block_height as number) + 1, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    const nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = (BigInt(poxInfo.min_amount_ustx) * 120n) / 100n;
    const authId = crypto.randomBytes(1)[0];
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    const datas = results
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    // todo: this is incorrect on the stacks-node side currently, it shouldn't have the prepare offset included yet
    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    let info = await client.getStatus();
    if (!info.stacked) throw 'not stacked';

    expect(info.details.unlock_height).toBeGreaterThan(0);
    expect(info.details.unlock_height).toBe(
      stackHeight -
        (stackHeight % poxInfo.reward_cycle_length) +
        poxInfo.reward_cycle_length * (lockPeriod + 1)
    );
    expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(
      nextCycle + lockPeriod
    ); // same as end_cycle_id

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    if (ENV.REGTEST_IGNORE_UNLOCK) return;
    await waitForBurnBlockHeight(info.details.unlock_height + 2);
    info = await client.getStatus();
    expect(info.stacked).toBeFalsy();

    // ENSURE REWARDS
    const reward = (await getRewards(steph.btcAddress))[0];
    expect(reward).toBeDefined();
    expect(reward.burn_block_height).toBeGreaterThan(stackHeight);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (in prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and attempts to stack 1 block after the
    // prepare-phase has started, which is considered a neglected prepare-phase
    // for stacking -- this should result in no rewards being paid out.
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(
      isInPreparePhase((poxInfo.current_burnchain_block_height as number) - 1, poxInfo)
    ).toBeFalsy();
    expect(
      isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    const nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = (BigInt(poxInfo.min_amount_ustx) * 120n) / 100n;
    const authId = crypto.randomBytes(1)[0];
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    const datas = results
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    let info = await client.getStatus();
    if (!info.stacked) throw 'not stacked';

    expect(info.details.unlock_height).toBeGreaterThan(0);
    expect(info.details.unlock_height).toBe(
      stackHeight -
        (stackHeight % poxInfo.reward_cycle_length) +
        poxInfo.reward_cycle_length * (lockPeriod + 1)
    );
    expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(
      nextCycle + lockPeriod
    ); // same as end_cycle_id

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked, but didn't make it in time for rewards)

    if (ENV.REGTEST_IGNORE_UNLOCK) return;
    await waitForBurnBlockHeight(info.details.unlock_height + 2);
    info = await client.getStatus();
    expect(info.stacked).toBeFalsy();

    // ENSURE NO REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.every(r => r.burn_block_height < stackHeight)).toBeTruthy(); // no new rewards

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase) and stack-extend (reward-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then extends in a reward-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 2;
    const amount = (BigInt(poxInfo.min_amount_ustx) * 120n) / 100n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    expect(poxInfo.reward_cycle_id).toBe(nextCycle);
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-extend)
    const extendHeight = poxInfo.current_burnchain_block_height as number;
    const extendCycles = 1;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-extend',
      period: extendCycles,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid: txidExtend } = await client.stackExtend({
      extendCycles,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txidExtend);

    const resultExtend = await waitForTransaction(txidExtend);
    expect(resultExtend.tx_result.repr).toContain('(ok');
    expect(resultExtend.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results: resultsExtend } = await getPox4Events();
    datas = resultsExtend
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (burnHeightToRewardCycle(stackUnlock, poxInfo) + extendCycles).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBeGreaterThan(stackUnlock);
    expect(status.details.unlock_height).toBe(
      stackUnlock + poxInfo.reward_cycle_length * extendCycles
    );

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph is stacked and extended in the current cycle)

    if (ENV.REGTEST_IGNORE_UNLOCK) return;
    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > extendHeight).length).toBeGreaterThan(0);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase) and stack-extend (prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then attempts to extend in a prepare-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = (BigInt(poxInfo.min_amount_ustx) * 120n) / 100n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE PREPARE PHASE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(
      isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-extend)
    const extendHeight = poxInfo.current_burnchain_block_height as number;
    const extendCycles = 1;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-extend',
      period: extendCycles,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid: txidExtend } = await client.stackExtend({
      extendCycles,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid extend', txidExtend);

    const resultExtend = await waitForTransaction(txidExtend);
    expect(resultExtend.tx_result.repr).toContain('(ok');
    expect(resultExtend.tx_status).toBe('success');

    // CHECK POX-4 EVENTS AFTER EXTEND
    const { results: resultsExtend } = await getPox4Events();
    datas = resultsExtend
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: (burnHeightToRewardCycle(stackUnlock, poxInfo) + extendCycles).toString(), // extended period
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBeGreaterThan(stackUnlock);
    expect(status.details.unlock_height).toBe(
      stackUnlock + poxInfo.reward_cycle_length * extendCycles
    );

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph was stacked, but the extend didn't make it in time)

    if (ENV.REGTEST_IGNORE_UNLOCK) return;
    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > extendHeight).length).toBe(0); // extend didn't make it

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase) and stack-increase (reward-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then increases in a reward-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 2;
    const amount = (BigInt(poxInfo.min_amount_ustx) * 120n) / 100n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    expect(poxInfo.reward_cycle_id).toBe(nextCycle);
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-increase)
    const increaseHeight = poxInfo.current_burnchain_block_height as number;
    const increaseBy = amount;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-increase',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount * 2n,
      authId,
    });
    const { txid: txidIncrease } = await client.stackIncrease({
      increaseBy,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount * 2n,
      authId,
      privateKey: steph.key,
    });
    console.log('txid increase', txidIncrease);

    const resultIncrease = await waitForTransaction(txidIncrease);
    expect(resultIncrease.tx_result.repr).toContain('(ok');
    expect(resultIncrease.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results: resultsIncr } = await getPox4Events();
    datas = resultsIncr.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: burnHeightToRewardCycle(stackUnlock, poxInfo).toString(), // original unlock
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBe(stackUnlock);

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph was stacked and increased for the current cycle)

    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > increaseHeight).length).toBeGreaterThan(0);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase) and stack-increase (prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then increases in a prepare-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 2;
    const amount = (BigInt(poxInfo.min_amount_ustx) * 120n) / 100n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE PREPARE PHASE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(
      isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-increase)
    const increaseHeight = poxInfo.current_burnchain_block_height as number;
    const increaseBy = amount;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-increase',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount * 2n,
      authId,
    });
    const { txid: txidIncrease } = await client.stackIncrease({
      increaseBy,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount * 2n,
      authId,
      privateKey: steph.key,
    });
    console.log('txid increase', txidIncrease);

    const resultIncrease = await waitForTransaction(txidIncrease);
    expect(resultIncrease.tx_result.repr).toContain('(ok');
    expect(resultIncrease.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results: resultsIncr } = await getPox4Events();
    datas = resultsIncr.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: burnHeightToRewardCycle(stackUnlock, poxInfo).toString(), // original unlock
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBe(stackUnlock);

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph was stacked, but the increase didn't make it in time)

    if (ENV.REGTEST_IGNORE_UNLOCK) return;
    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > increaseHeight).length).toBeGreaterThan(0);

    // todo: (functional) somehow ensure the slots were not increased on the blockchain side

    // EXPORT EVENTS
    await storeEventsTsv();
  });
});
