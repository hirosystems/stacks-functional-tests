import { logger, waiter } from '@hirosystems/api-toolkit';
import { StacksApiSocketClient } from '@stacks/blockchain-api-client';
import { StacksMocknet } from '@stacks/network';
import { MempoolTransaction, Transaction } from '@stacks/stacks-blockchain-api-types';
import { broadcastTransaction, makeSTXTokenTransfer } from '@stacks/transactions';

describe('Stacks transactions', () => {
  test('STX transfer', async () => {
    const recipientAddress = 'STQM73RQC4EX0A07KWG1J5ECZJYBZS4SJ4ERC6WN';
    const client = new StacksApiSocketClient({
      url: `http://localhost:3999`,
      socketOpts: { reconnection: false },
    });
    const txWaiter = waiter<Transaction | MempoolTransaction>();

    const network = new StacksMocknet({ url: 'http://localhost:20443' });
    const tx = await makeSTXTokenTransfer({
      network,
      recipient: recipientAddress,
      amount: 10_000,
      anchorMode: 'any',
      senderKey: 'cb3df38053d132895220b9ce471f6b676db5b9bf0b4adefb55f2118ece2478df01',
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
