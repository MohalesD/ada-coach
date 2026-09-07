import { describe, expect, it } from 'vitest';
import { purgeUserStorage, type StorageBucketLike, type StorageEntry } from './storage-purge';

// In-memory bucket that pages exactly like Supabase Storage: `list` returns
// at most `limit` entries, and removed objects disappear from later lists.
function fakeBucket(initial: string[]) {
  const objects = new Set(initial);
  const calls = { list: 0, remove: 0, removedPaths: [] as string[] };

  const bucket: StorageBucketLike = {
    async list(prefix, { limit, offset }) {
      calls.list++;
      const entries: StorageEntry[] = [...objects]
        .filter((p) => p.startsWith(`${prefix}/`))
        .map((p) => ({ name: p.slice(prefix.length + 1), id: `id-${p}` }))
        .slice(offset, offset + limit);
      return { data: entries, error: null };
    },
    async remove(paths) {
      calls.remove++;
      for (const p of paths) {
        objects.delete(p);
        calls.removedPaths.push(p);
      }
      return { error: null };
    },
  };

  return { bucket, objects, calls };
}

describe('purgeUserStorage', () => {
  it('returns 0 and issues no remove when the folder is empty', async () => {
    const { bucket, calls } = fakeBucket([]);
    const result = await purgeUserStorage(bucket, 'user-a');
    expect(result.removed).toBe(0);
    expect(calls.remove).toBe(0);
  });

  it('removes every object even when there are more than one page', async () => {
    const paths = Array.from({ length: 7 }, (_, i) => `user-a/file-${i}.pdf`);
    const { bucket, objects, calls } = fakeBucket(paths);

    const result = await purgeUserStorage(bucket, 'user-a', 3);

    expect(result.removed).toBe(7);
    expect(objects.size).toBe(0);
    // 3 + 3 + 1 removed, then one final empty list to confirm termination.
    expect(calls.remove).toBe(3);
    expect(calls.list).toBe(4);
  });

  it("never touches another user's folder", async () => {
    const { bucket, objects } = fakeBucket(['user-a/mine.txt', 'user-b/theirs.txt']);
    await purgeUserStorage(bucket, 'user-a');
    expect(objects.has('user-b/theirs.txt')).toBe(true);
    expect(objects.has('user-a/mine.txt')).toBe(false);
  });

  it('skips folder placeholders (null id) instead of trying to remove them', async () => {
    const bucket: StorageBucketLike = {
      async list() {
        return { data: [{ name: 'subfolder', id: null }], error: null };
      },
      async remove() {
        throw new Error('remove must not be called for placeholders');
      },
    };
    const result = await purgeUserStorage(bucket, 'user-a');
    expect(result.removed).toBe(0);
  });

  it('throws instead of looping forever when remove silently does nothing', async () => {
    const bucket: StorageBucketLike = {
      async list() {
        return { data: [{ name: 'stuck.txt', id: 'x' }], error: null };
      },
      async remove() {
        return { error: null };
      },
    };
    await expect(purgeUserStorage(bucket, 'user-a')).rejects.toThrow(/exceeded/);
  });

  it('surfaces a list error rather than treating it as empty', async () => {
    const bucket: StorageBucketLike = {
      async list() {
        return { data: null, error: new Error('boom') };
      },
      async remove() {
        return { error: null };
      },
    };
    await expect(purgeUserStorage(bucket, 'user-a')).rejects.toThrow(/list failed/);
  });
});
