import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

// Server-side response cache. Qloo allows private caching with no time limit,
// but the data must never be committed. Set CROWDKIT_CACHE_DIR to put the cache
// on a persistent disk/volume (the Docker image does).
// The default lives in the OS temp folder, NOT the project: the dev server
// watches the project folder and reloads the page when a file appears there,
// which cut the browser's live connection mid-plan.

const memory = new Map<string, unknown>();
const DIR = process.env.CROWDKIT_CACHE_DIR ?? path.join(tmpdir(), "crowdkit-cache");

function keyFor(namespace: string, payload: unknown): string {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
  return `${namespace}-${hash}`;
}

// Read without fetching; null on a miss.
export async function readCached<T>(namespace: string, payload: unknown): Promise<T | null> {
  const key = keyFor(namespace, payload);
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const value = JSON.parse(await readFile(path.join(DIR, `${key}.json`), "utf8")) as T;
    memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export async function writeCached(namespace: string, payload: unknown, value: unknown): Promise<void> {
  const key = keyFor(namespace, payload);
  memory.set(key, value);
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, `${key}.json`), JSON.stringify(value));
  } catch {
    // disk cache is best-effort
  }
}

export async function cached<T>(
  namespace: string,
  payload: unknown,
  fetcher: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const key = keyFor(namespace, payload);
  if (memory.has(key)) return { value: memory.get(key) as T, hit: true };

  const file = path.join(DIR, `${key}.json`);
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as T;
    memory.set(key, value);
    return { value, hit: true };
  } catch {
    // miss
  }

  const value = await fetcher();
  memory.set(key, value);
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(file, JSON.stringify(value));
  } catch {
    // disk cache is best-effort
  }
  return { value, hit: false };
}
