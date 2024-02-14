import { StacksMocknet } from '@stacks/network';
import { broadcastTransaction, makeSTXTokenTransfer } from '@stacks/transactions';

describe('Stacks transactions', () => {
  test('STX transfer', async () => {
    const network = new StacksMocknet({ url: 'http://localhost:20443' });
    const tx = await makeSTXTokenTransfer({
      network,
      recipient: 'STQM73RQC4EX0A07KWG1J5ECZJYBZS4SJ4ERC6WN',
      amount: 10_000,
      anchorMode: 'any',
      senderKey: 'cb3df38053d132895220b9ce471f6b676db5b9bf0b4adefb55f2118ece2478df01',
    });
    const broadcast = await broadcastTransaction(tx, network);
    console.log(broadcast);
  });
});
