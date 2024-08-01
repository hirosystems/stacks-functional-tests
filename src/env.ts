import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

const schema = Type.Object({
  STACKS_CHAIN: Type.Enum({ mainnet: 'mainnet', testnet: 'testnet' }, { default: 'testnet' }),

  /** Stacks API host */
  STACKS_API: Type.String({ default: 'http://localhost:3999' }),

  /** Stacks node host */
  STACKS_NODE: Type.String({ default: 'http://localhost:20443' }),

  /** List of pre-funded STX accounts on devnet (wallet 4, 5, 6, 1, 2, 3) */
  PRIVATE_KEYS: Type.Array(Type.String(), {
    default: [
      // taken from `settings/Devnet.toml`
      'f9d7206a47f14d2870c163ebab4bf3e70d18f5d14ce1031f3902fbbc894fe4c701',
      '3eccc5dac8056590432db6a35d52b9896876a3d5cbdea53b72400bc9c2099fe801',
      '7036b29cb5e235e5fd9b09ae3e8eec4404e44906814d5d01cbca968a60ed4bfb01',
      '7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801', // signer
      '530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101', // signer
      'd655b2523bcd65e34889725c73064feb17ceb796831c0e111ba1a552b0f31b3901', // signer
    ],
  }),

  /** Wallet seed phrase of pre-funded wallet on devnet (wallet 4) */
  WALLET_SEED: Type.String({
    default:
      // taken from `settings/Devnet.toml`
      'board list obtain sugar hour worth raven scout denial thunder horse logic fury scorpion fold genuine phrase wealth news aim below celery when cabin',
  }),

  /**
   * Command to run to start regtest-env.
   * e.g. this could `cd` into the regtest-env directory and run `docker compose up -d`
   */
  NETWORK_UP_CMD: Type.String({ default: "echo 'no-op'" }),
  /**
   * Command to run to stop regtest-env.
   * e.g. this could `cd` into the regtest-env directory and run `docker compose down`
   */
  NETWORK_DOWN_CMD: Type.String({ default: "echo 'no-op'" }),

  /**
   * If true, doesn't wait for unlock and verifying rewards in regtest tests.
   * Useful for speeding up tests when running many long-running regtest-env tests
   */
  SKIP_UNLOCK: Type.Boolean({ default: false }),

  POLL_INTERVAL: Type.Integer({ default: 750 }),
  RETRY_INTERVAL: Type.Integer({ default: 500 }),

  STACKS_TX_TIMEOUT: Type.Integer({ default: 10_000 }),
  BITCOIN_TX_TIMEOUT: Type.Integer({ default: 15_000 }),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  dotenv: true,
  schema,
});
