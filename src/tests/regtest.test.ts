import { StacksDevnet } from '@stacks/network';
import { PoxInfo, StackingClient } from '@stacks/stacking';
import * as crypto from 'crypto';
import { ENV } from '../env';
import {
  getAccount,
  isInPreparePhase,
  waitForBurnBlockHeight,
  waitForNode,
  waitForPreparePhase,
} from '../helpers';
import { getSignerLogs, startRegtestEnv, stopRegtestEnv, withRetry } from '../utils';

jest.setTimeout(1_000_000_000);

describe('regtest-env pox-4', () => {
  const network = new StacksDevnet({ fetchFn: withRetry(3, fetch) }); // this test only works on regtest-env
  let poxInfo: PoxInfo;

  beforeEach(async () => {
    await startRegtestEnv();
    await waitForNode();
  });

  afterEach(async () => {
    await stopRegtestEnv();
  });

  test('signer logs', async () => {
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(
      isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    const nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
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

    let lines = await getSignerLogs();
    expect(lines.split('\n')).toContain('message A');

    lines = await getSignerLogs();
    expect(lines.split('\n')).toContain('message B');
  });
});
