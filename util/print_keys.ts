import { getAccount, getWallet } from '../src/helpers';

async function printAccountKeys(length: number) {
  let wallet = await getWallet(length);
  
  wallet.accounts
    .map(a => getAccount(a.stxPrivateKey))
    .forEach((a, i) => console.log(`Account ${i}: Address=${a.address}, Private Key=${a.key}`));
}

const args = process.argv.slice(2);
const accounts = parseInt(args[0]) || 10;
printAccountKeys(accounts);
