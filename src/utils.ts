import { exec } from 'child_process';
import { promisify } from 'util';

const x = promisify(exec);

export function withRetry<T, A extends any[]>(
  maxRetries: number,
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return async function retryWrapper(...args: A): Promise<T> {
    let attempts = 0;
    while (true) {
      try {
        return await fn(...args);
      } catch (err: any) {
        if (err.status === 502) continue; // ignore Bad Gateway errors and retry
        if (attempts >= maxRetries) throw err;
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

export async function storeEventsCsv() {
  let testname = expect.getState().currentTestName ?? '';
  testname = testname
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .replace(/\W+/g, '-');
  testname += new Date().toISOString().replace(/\D/g, '').slice(0, 15);
  const out = await x(
    `docker exec stacks-regtest-env-postgres-1 psql \
      -U postgres stacks_blockchain_api -c \
      "COPY (SELECT id, receive_timestamp, event_path, payload FROM event_observer_requests ORDER BY id ASC) TO STDOUT ENCODING 'UTF8'" > \
      ${testname}.csv`
  );
  if (out.stderr) throw new Error(out.stderr);
  return out.stdout;
}
