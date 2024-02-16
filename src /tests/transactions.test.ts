import { logger, waiter } from '@hirosystems/api-toolkit';
import { MempoolTransaction, Transaction } from '@stacks/stacks-blockchain-api-types';
import { broadcastTransaction, makeSTXTokenTransfer } from '@stacks/transactions';
import { ENV } from '../env';
import { getNextNonce, newSocketClient, stacksNetwork } from '../helpers';

describe('Stacks transactions', () => {
  test('STX transfer', async () => {
    const client = newSocketClient();
    const network = stacksNetwork();
    const nonce = await getNextNonce();

    const txWaiter = waiter<Transaction | MempoolTransaction>();
    const tx = await makeSTXTokenTransfer({
      network,
      nonce,
      recipient: ENV.RECEIVER_STX_ADDRESS,
      amount: 10_000,
      anchorMode: 'any',
      senderKey: ENV.SENDER_KEY,
    });
    const broadcast = await broadcastTransaction(tx, network);
    logger.info(`Transaction broadcast: 0x${broadcast.txid}`);
    const subscription = client.subscribeTransaction(`0x${broadcast.txid}`, tx => {
      if (tx.tx_status == 'pending') {
        logger.info(`Transaction received in the mempool`);
      }
      txWaiter.finish(tx);
    });

    const result = await txWaiter;
    try {
      expect(result.tx_id).toBe(`0x${broadcast.txid}`);
      expect(result.tx_status).toBe('success');
    } finally {
      subscription.unsubscribe();
      client.socket.close();
    }
  });
});
