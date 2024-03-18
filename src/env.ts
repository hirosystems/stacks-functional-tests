import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

const schema = Type.Object({
  STACKS_CHAIN: Type.Enum({ mainnet: 'mainnet', testnet: 'testnet' }),
  /* STX address of the issuer of all transactions we will be testing */
  SENDER_STX_ADDRESS: Type.String(),
  /* `SENDER_STX_ADDRESS`'s hex private key */
  SENDER_KEY: Type.String(),
  /* STX address of the receiver of any sent tokens */
  RECEIVER_STX_ADDRESS: Type.String(),

  /* Stacks Blockchain API host */
  STACKS_API_HOST: Type.String(),
  /* Stacks Blockchain API port */
  STACKS_API_PORT: Type.Integer(),
  /* Stacks node host */
  STACKS_NODE_HOST: Type.String(),
  /* Stacks node port */
  STACKS_NODE_PORT: Type.Integer(),

  STACKS_TX_TIMEOUT: Type.Integer({ default: 15_000 }),

  POLL_INTERVAL: Type.Integer({ default: 100 }),

  /* List of pre-funded STX addresses on regtest-env */
  REGTEST_KEYS: Type.Array(Type.String(), {
    default: [
      // taken from `stacks-kryton-miner.toml`
      'cb3df38053d132895220b9ce471f6b676db5b9bf0b4adefb55f2118ece2478df01',
      '21d43d2ae0da1d9d04cfcaac7d397a33733881081f0b2cd038062cf0ccbb752601',
    ],
  }),
  /* Signer private key for generating signatures */
  SIGNER_KEY: Type.String({
    default: '08c14a1eada0dd42b667b40f59f7c8dedb12113613448dc04980aea20b268ddb01',
  }),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  dotenv: true,
  schema,
});
