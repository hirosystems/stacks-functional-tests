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
  waitForPreparePhase,
  waitForRewardPhase,
  waitForTransaction,
} from '../helpers';
import { storeEventsCsv } from '../utils';

jest.setTimeout(1_000_000);

const network = new StacksDevnet(); // this test only works on regtest-env
let poxInfo: PoxInfo;

test('regtest-env pox-4 stacks-stx (in reward-phase)', async () => {
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
  expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBe(false);

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
    privateKey: steph.key,
    maxAmount: amount,
    authId,
  });
  console.log('txid', txid);

  const result = await waitForTransaction(txid);
  expect(result.tx_result.repr).toContain('(ok');
  expect(result.tx_status).toBe('success');

  // CHECK POX-4 EVENTS
  const { results } = await getPox4Events();
  const datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

  expect(datas).toContainEqual(
    expect.objectContaining({
      start_cycle_id: nextCycle.toString(), // next cycle
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
  expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(nextCycle + lockPeriod); // same as end_cycle_id

  await waitForBurnBlockHeight(info.details.unlock_height + 1);
  info = await client.getStatus();
  expect(info.stacked).toBe(false);

  // ENSURE REWARDS
  const reward = (await getRewards(steph.btcAddress))[0];
  expect(reward).not.toBeNull();
  expect(reward.burn_block_height).toBeGreaterThan(stackHeight);

  // EXPORT EVENTS
  await storeEventsCsv();
});

test('regtest-env pox-4 stacks-stx (on prepare-phase start)', async () => {
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
  await waitForPreparePhase(poxInfo); // todo: fix this to ensure to be EXACTLY at start of a prepare phase

  poxInfo = await client.getPoxInfo();
  expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBe(true);

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
    privateKey: steph.key,
    maxAmount: amount,
    authId,
  });
  console.log('txid', txid);

  const result = await waitForTransaction(txid);
  expect(result.tx_result.repr).toContain('(ok');
  expect(result.tx_status).toBe('success');

  // CHECK POX-4 EVENTS
  const { results } = await getPox4Events();
  const datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

  // todo: this is incorrect on the stacks-node side currently
  expect(datas).toContainEqual(
    expect.objectContaining({
      start_cycle_id: (nextCycle + 1).toString(), // next cycle + prepare offset
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
  expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(nextCycle + lockPeriod); // same as end_cycle_id

  await waitForBurnBlockHeight(info.details.unlock_height + 1);
  info = await client.getStatus();
  expect(info.stacked).toBe(false);

  // ENSURE REWARDS
  // This might be unexpected, since we're "in prepare-phase" but to the
  // blockchain the height isn't neglected yet and the stacking operation will
  // get into the next cycle.
  const reward = (await getRewards(steph.btcAddress))[0];
  expect(reward).not.toBeNull();
  expect(reward.burn_block_height).toBeGreaterThan(stackHeight);

  // EXPORT EVENTS
  await storeEventsCsv();
});

test('regtest-env pox-4 stacks-stx (in neglected prepare-phase)', async () => {
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
  // wait one more block to be in the neglected part of the prepare-phase
  await waitForBurnBlockHeight((poxInfo.current_burnchain_block_height as number) + 1);

  poxInfo = await client.getPoxInfo();

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
    privateKey: steph.key,
    maxAmount: amount,
    authId,
  });
  console.log('txid', txid);

  const result = await waitForTransaction(txid);
  expect(result.tx_result.repr).toContain('(ok');
  expect(result.tx_status).toBe('success');

  // CHECK POX-4 EVENTS
  const { results } = await getPox4Events();
  const datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

  expect(datas).toContainEqual(
    expect.objectContaining({
      start_cycle_id: (nextCycle + 1).toString(), // next cycle + prepare offset
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
  expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(nextCycle + lockPeriod); // same as end_cycle_id

  await waitForBurnBlockHeight(info.details.unlock_height + 1);
  info = await client.getStatus();
  expect(info.stacked).toBe(false);

  // ENSURE NO REWARDS
  const rewards = await getRewards(steph.btcAddress);
  expect(rewards.every(r => r.burn_block_height < stackHeight)).toBe(true); // no new rewards

  // EXPORT EVENTS
  await storeEventsCsv();
});
