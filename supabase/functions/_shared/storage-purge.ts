// Removes every object under `{userId}/` in a Storage bucket.
// One job: empty one user's folder, paginating until the listing is empty.
//
// Why paginate: Storage `list` returns at most `limit` entries per call.
// A list-once-then-remove implementation silently leaves objects behind for
// any user with more files than one page. This loop re-lists from offset 0
// after each batch is removed, so it terminates only when nothing is left.
//
// The bucket is passed in as a minimal interface so the loop can be unit
// tested without a Supabase client.

export type StorageEntry = { name: string; id?: string | null };

export type StorageBucketLike = {
  list(
    prefix: string,
    opts: { limit: number; offset: number },
  ): Promise<{ data: StorageEntry[] | null; error: unknown }>;
  remove(paths: string[]): Promise<{ error: unknown }>;
};

const DEFAULT_PAGE_SIZE = 100;
// Hard ceiling so a misbehaving backend (e.g. remove reporting success but
// not removing) cannot spin forever. 1,000 pages × 100 = 100k objects.
const MAX_PAGES = 1_000;

export async function purgeUserStorage(
  bucket: StorageBucketLike,
  userId: string,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<{ removed: number }> {
  let removed = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await bucket.list(userId, {
      limit: pageSize,
      offset: 0,
    });
    if (error) throw new Error(`storage list failed: ${String(error)}`);

    // Folder placeholders come back with a null id; only real objects are
    // removable. Files live flat under `{userId}/` by convention.
    const paths = (data ?? [])
      .filter((entry) => entry.name && entry.id !== null)
      .map((entry) => `${userId}/${entry.name}`);

    if (paths.length === 0) return { removed };

    const { error: removeErr } = await bucket.remove(paths);
    if (removeErr) {
      throw new Error(`storage remove failed: ${String(removeErr)}`);
    }
    removed += paths.length;
  }

  throw new Error(
    `storage purge for ${userId} exceeded ${MAX_PAGES} pages; aborting`,
  );
}
