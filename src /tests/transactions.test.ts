import { logger, waiter } from '@hirosystems/api-toolkit';
import { MempoolTransaction, Transaction } from '@stacks/stacks-blockchain-api-types';
import {
  broadcastTransaction,
  makeContractDeploy,
  makeSTXTokenTransfer,
} from '@stacks/transactions';
import { ENV } from '../env';
import { getNextNonce, newSocketClient, stacksNetwork, waitForNextNonce } from '../helpers';
import { StacksApiSocketClient } from '@stacks/blockchain-api-client';
import { StacksNetwork } from '@stacks/network';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Stacks transactions', () => {
  let socketClient: StacksApiSocketClient;
  let network: StacksNetwork;
  let nextNonce: number;

  beforeAll(() => {
    network = stacksNetwork();
  });

  beforeEach(async () => {
    socketClient = newSocketClient();
    nextNonce = await getNextNonce();
  });

  afterEach(async () => {
    socketClient.socket.close();
    await waitForNextNonce(nextNonce);
  });

  test('STX transfer', async () => {
    const txWaiter = waiter<Transaction | MempoolTransaction>();
    const tx = await makeSTXTokenTransfer({
      network,
      nonce: nextNonce,
      recipient: ENV.RECEIVER_STX_ADDRESS,
      amount: 10_000,
      anchorMode: 'any',
      senderKey: ENV.SENDER_KEY,
    });
    const broadcast = await broadcastTransaction(tx, network);
    logger.info(`Transaction broadcast: 0x${broadcast.txid}`);
    const subscription = socketClient.subscribeTransaction(`0x${broadcast.txid}`, tx => {
      if (tx.tx_status == 'pending') {
        logger.info(`Transaction received in the mempool`);
        return;
      }
      txWaiter.finish(tx);
    });

    const result = await txWaiter;
    try {
      expect(result.tx_id).toBe(`0x${broadcast.txid}`);
      expect(result.tx_status).toBe('success');
    } finally {
      subscription.unsubscribe();
    }
  });

  test('Contract deploy', async () => {
    const txWaiter = waiter<Transaction | MempoolTransaction>();
    const codeBody = fs.readFileSync(path.join(__dirname, '../contracts/counter.clar'), 'utf-8');
    const tx = await makeContractDeploy({
      network,
      nonce: nextNonce,
      contractName: `counter-${crypto.randomBytes(3).toString('hex')}`,
      codeBody,
      anchorMode: 'any',
      senderKey: ENV.SENDER_KEY,
    });

    const broadcast = await broadcastTransaction(tx, network);
    logger.info(`Transaction broadcast: 0x${broadcast.txid}`);
    const subscription = socketClient.subscribeTransaction(`0x${broadcast.txid}`, tx => {
      if (tx.tx_status == 'pending') {
        logger.info(`Transaction received in the mempool`);
        return;
      }
      txWaiter.finish(tx);
    });

    const result = await txWaiter;
    try {
      expect(result.tx_id).toBe(`0x${broadcast.txid}`);
      expect(result.tx_status).toBe('success');
    } finally {
      subscription.unsubscribe();
    }
  });
});
