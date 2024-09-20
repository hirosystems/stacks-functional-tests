import { timeout } from '@hirosystems/api-toolkit';
import { exec } from 'child_process';
import { existsSync, renameSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { ENV } from './env';

const x = promisify(exec);

export function withRetry<T, A extends any[]>(
  maxRetries: number,
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return async function retryWrapper(...args: A): Promise<T> {
    let attempts = 0;
    while (true) {
      try {
        const response = await fn(...args);

        if (response instanceof Response && !response.ok) {
          const clone = response.clone();

          // Don't retry on these errors:
          if ((await clone.text()).includes('NoEstimateAvailable')) return response as T;

          console.log(
            `(retry) status: ${clone.status} (${attempts}/${maxRetries}) ${clone.url}\n${await clone.text()}`
          );
          if (attempts >= maxRetries) throw clone.status;

          await timeout(ENV.RETRY_INTERVAL);
          attempts++;
          continue;
        }

        return response as T;
      } catch (err: any) {
        if (err.status !== 502 && attempts >= maxRetries) throw err; // ignore Bad Gateway errors
        await timeout(ENV.RETRY_INTERVAL);
        attempts++;
      }
    }
  };
}

export function withTimeout<T, A extends any[]>(
  timeoutMs: number,
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return async function timeoutWrapper(...args: A): Promise<T> {
    let handle = undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      handle = setTimeout(() => reject('Timeout'), timeoutMs);
    });

    try {
      return await Promise.race([timeoutPromise, fn(...args)]);
    } finally {
      if (handle) clearTimeout(handle);
    }
  };
}

export async function networkEnvUp() {
  if (!ENV.NETWORK_UP_CMD) return;

  console.log('starting network...');
  const out = await x(ENV.NETWORK_UP_CMD);
  // if (out.stderr) throw new Error(out.stderr);
  return out.stdout;
}

export async function networkEnvDown() {
  if (!ENV.NETWORK_DOWN_CMD) return;

  console.log('stopping network...');
  const out = await x(ENV.NETWORK_DOWN_CMD);
  // if (out.stderr) throw new Error(out.stderr);
  return out.stdout;
}

export async function regtestComposeUp(name?: string, opts?: string) {
  if (!ENV.REGTEST_WORKING_DIR) return;

  console.log(`starting regtest services... ${name}`);
  const out = await x(
    `cd ${ENV.REGTEST_WORKING_DIR} && docker compose ${opts ? opts : ''} up -d ${name}`
  );
  return out.stdout;
}

export async function regtestComposeDown(name?: string) {
  if (!ENV.REGTEST_WORKING_DIR) return;

  console.log(`stopping regtest services... ${name}`);
  const out = await x(`cd ${ENV.REGTEST_WORKING_DIR} && docker compose down ${name}`);
  return out.stdout;
}

export async function regtestComposeLogs(name?: string) {
  if (!ENV.REGTEST_WORKING_DIR) return;

  console.log(`stopping regtest services... ${name}`);
  const out = await x(`cd ${ENV.REGTEST_WORKING_DIR} && docker compose logs ${name}`);
  return out.stdout;
}

/** WIP */
export async function storeEventsTsv(suffix: string = '') {
  let testname = expect.getState().currentTestName ?? '';
  testname = testname
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .replace(/\W+/g, '-');
  const filename = `${testname}${suffix ? `-${suffix}` : ''}.tsv`;
  const filepath = join(process.cwd(), filename);

  if (existsSync(filepath)) {
    // Backup if exists
    const datetime = new Date().toISOString().replace(/\D/g, '').slice(0, 15);
    const backupPath = join(process.cwd(), `${filename}.${datetime}.bak`);
    renameSync(filepath, backupPath);
  }

  const out = await x(
    `docker exec stacks-regtest-env-postgres-1 psql \
      -U postgres stacks_blockchain_api -c \
      "COPY (SELECT id, receive_timestamp, event_path, payload FROM event_observer_requests ORDER BY id ASC) TO STDOUT ENCODING 'UTF8'" > \
      ${filename}`
  );
  if (out.stderr) throw new Error(out.stderr);
  return out.stdout;
}
