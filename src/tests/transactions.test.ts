import { makeContractDeploy, makeSTXTokenTransfer } from '@stacks/transactions';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ENV } from '../env';
import {
  broadcastAndWaitForTransaction,
  getAccount,
  getNextNonce,
  stacksNetwork,
  waitForNextNonce,
} from '../helpers';

describe('Stacks transactions', () => {
  const SENDER = getAccount(ENV.PRIVATE_KEYS[0]).key;
  const RECEIVER = getAccount(ENV.PRIVATE_KEYS[1]).address;

  const network = stacksNetwork();
  let nextNonce: number;

  beforeEach(async () => {
    nextNonce = await getNextNonce(SENDER);
  });

  afterEach(async () => {
    await waitForNextNonce(SENDER, nextNonce);
  });

  test('STX transfer', async () => {
    const tx = await makeSTXTokenTransfer({
      network,
      nonce: nextNonce,
      recipient: RECEIVER,
      amount: 10_000,
      anchorMode: 'any',
      senderKey: SENDER,
    });
    const result = await broadcastAndWaitForTransaction(tx, network);
    expect(result.tx_status).toBe('success');
  });

  test('Contract deploy', async () => {
    const codeBody = fs.readFileSync(path.join(__dirname, '../contracts/counter.clar'), 'utf-8');
    const tx = await makeContractDeploy({
      network,
      nonce: nextNonce,
      contractName: `counter-${crypto.randomBytes(3).toString('hex')}`,
      codeBody,
      anchorMode: 'any',
      senderKey: SENDER,
    });
    const result = await broadcastAndWaitForTransaction(tx, network);
    expect(result.tx_status).toBe('success');
  });

  test('FT contract deploy', async () => {
    const codeBody = fs.readFileSync(
      path.join(__dirname, '../contracts/fungible-token.clar'),
      'utf-8'
    );
    const tx = await makeContractDeploy({
      network,
      nonce: nextNonce,
      contractName: `test-ft-${crypto.randomBytes(3).toString('hex')}`,
      codeBody,
      anchorMode: 'any',
      senderKey: SENDER,
    });
    const result = await broadcastAndWaitForTransaction(tx, network);
    expect(result.tx_status).toBe('success');
  });
});
