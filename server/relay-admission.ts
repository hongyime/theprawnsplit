// SEC-003/B1: owner-approved public relay resource admission budgets.
// Enforces (atomically, across serverless instances, via the shared Redis
// store — never a process-local counter): max distinct authors per tag
// ("enrollments per group"), max distinct tags per author ("groups per
// author key"), a per-tag events/sec rate limit, and a per-tag total-bytes
// storage budget. A rejected reservation leaves the store byte-for-byte
// unchanged (every partial add is rolled back before returning) so the
// caller in api/relay.ts can safely reject with HTTP 429 before ever
// touching the write-proof key or writing history.
export interface AdmissionBudgets {
  maxEnrollmentsPerGroup: number;
  maxGroupsPerAuthor: number;
  maxEventsPerSecondPerGroup: number;
  maxBytesPerGroup: number;
}

export const DEFAULT_ADMISSION_BUDGETS: AdmissionBudgets = {
  maxEnrollmentsPerGroup: 20,
  maxGroupsPerAuthor: 50,
  maxEventsPerSecondPerGroup: 5,
  maxBytesPerGroup: 5_000_000,
};

export type AdmissionDecision = { admitted: true } | { admitted: false; retryAfterSeconds: number };

/**
 * The two primitives below must each be a SINGLE indivisible operation from
 * the store's point of view (a Lua `EVAL` for the real Upstash-backed
 * store — Redis executes a script atomically, so no other client can
 * interleave between the add and its cardinality check; a single
 * synchronous method body for an in-memory test double, since JS itself
 * cannot preempt a synchronous function).
 *
 * A naive two-round-trip "SADD, then separately SCARD to check the cap"
 * is NOT safe here: under real concurrency every racer's SADD can land
 * before any of them runs its SCARD check, so all of them observe the same
 * (already-inflated) aggregate size and all incorrectly reject. Folding
 * add+check+conditional-rollback into one atomic operation is what makes
 * "at most N admissions, ever" actually hold.
 *
 * reserveCounter/releaseCounter do NOT need that same atomicity: Redis's
 * INCRBY already returns a uniquely, correctly-ordered new value to each
 * concurrent caller (unlike SCARD's shared aggregate read), so a plain
 * "INCRBY, check my own returned value, DECRBY if I'm the one over budget"
 * is race-free on its own.
 */
export interface AdmissionStore {
  /** Atomically add `member` to the capped set at `key`. */
  reserveSetSlot(key: string, member: string, maxSize: number): Promise<"added" | "existing" | "rejected">;
  /** Unconditionally remove `member` from the set at `key` (rollback of an "added" reservation). */
  releaseSetSlot(key: string, member: string): Promise<void>;
  /** Atomically increment the counter at `key` by `amount`; sets a TTL on first creation if given. */
  incrby(key: string, amount: number, ttlSecondsOnCreate?: number): Promise<number>;
  /** Unconditionally decrement the counter at `key` by `amount` (rollback of an incrby reservation). */
  decrby(key: string, amount: number): Promise<void>;
}

export const admissionKeyPrefix = "ad:";
const enrollKey = (tag: string): string => `${admissionKeyPrefix}enroll:${tag}`;
const groupsKey = (author: string): string => `${admissionKeyPrefix}groups:${author}`;
const rateKey = (tag: string, secondBucket: number): string => `${admissionKeyPrefix}rate:${tag}:${secondBucket}`;
const bytesKey = (tag: string): string => `${admissionKeyPrefix}bytes:${tag}`;

const HARD_CAP_RETRY_SECONDS = 60; // enrollment/group/storage caps have no natural reset
const RATE_RETRY_SECONDS = 1; // the per-second rate bucket resets on its own

/**
 * Atomically reserve capacity for one write of `blobBytes` from `author` into
 * `tag`, against the given budgets. On rejection, every partial reservation
 * already made for this call is rolled back before returning — the store is
 * left exactly as it was found. Never mutates the write-proof or stream keys.
 */
export async function reserveAdmission(
  store: AdmissionStore,
  tag: string,
  author: string,
  blobBytes: number,
  budgets: AdmissionBudgets = DEFAULT_ADMISSION_BUDGETS,
): Promise<AdmissionDecision> {
  const rollbacks: Array<() => Promise<void>> = [];
  const rollbackAll = async (): Promise<void> => {
    for (let i = rollbacks.length - 1; i >= 0; i--) await rollbacks[i]!();
  };

  const enroll = await store.reserveSetSlot(enrollKey(tag), author, budgets.maxEnrollmentsPerGroup);
  if (enroll === "rejected") return { admitted: false, retryAfterSeconds: HARD_CAP_RETRY_SECONDS };
  if (enroll === "added") rollbacks.push(() => store.releaseSetSlot(enrollKey(tag), author));

  const group = await store.reserveSetSlot(groupsKey(author), tag, budgets.maxGroupsPerAuthor);
  if (group === "rejected") {
    await rollbackAll();
    return { admitted: false, retryAfterSeconds: HARD_CAP_RETRY_SECONDS };
  }
  if (group === "added") rollbacks.push(() => store.releaseSetSlot(groupsKey(author), tag));

  const secondBucket = Math.floor(Date.now() / 1000);
  const rk = rateKey(tag, secondBucket);
  const rateCount = await store.incrby(rk, 1, 2);
  rollbacks.push(() => store.decrby(rk, 1));
  if (rateCount > budgets.maxEventsPerSecondPerGroup) {
    await rollbackAll();
    return { admitted: false, retryAfterSeconds: RATE_RETRY_SECONDS };
  }

  const bk = bytesKey(tag);
  const totalBytes = await store.incrby(bk, blobBytes);
  rollbacks.push(() => store.decrby(bk, blobBytes));
  if (totalBytes > budgets.maxBytesPerGroup) {
    await rollbackAll();
    return { admitted: false, retryAfterSeconds: HARD_CAP_RETRY_SECONDS };
  }

  return { admitted: true };
}

// A minimal Redis-command surface — deliberately narrower than @upstash/redis's
// full `Redis` type, so this module only depends on the handful of commands
// it actually uses and stays trivially mockable in tests.
export interface UpstashRedisLike {
  eval<TArgs extends unknown[], TData = unknown>(script: string, keys: string[], args: TArgs): Promise<TData>;
  incrby(key: string, amount: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  decrby(key: string, amount: number): Promise<number>;
  srem(key: string, member: string): Promise<number>;
}

// Atomic add-to-a-capped-set: existence-check, SADD, cardinality check and
// conditional SREM rollback all happen inside one Redis-executed script, so
// no other client's command can interleave between the add and its check —
// this is what actually makes "never admit more than maxSize members" hold
// under real concurrency (see reserveAdmission's doc comment above for why a
// plain two-round-trip SADD-then-SCARD is NOT sufficient).
const RESERVE_SET_SLOT_SCRIPT = `
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
  return 'existing'
end
redis.call('SADD', KEYS[1], ARGV[1])
local count = redis.call('SCARD', KEYS[1])
if count > tonumber(ARGV[2]) then
  redis.call('SREM', KEYS[1], ARGV[1])
  return 'rejected'
end
return 'added'
`;

/**
 * Real, cross-instance-safe AdmissionStore backed by Upstash Redis.
 * reserveSetSlot/releaseSetSlot cover the enrollment/group dimensions;
 * incrby/decrby cover the rate/storage counters (already race-free without
 * Lua — see reserveAdmission's doc comment).
 */
export function createUpstashAdmissionStore(redis: UpstashRedisLike): AdmissionStore {
  return {
    async reserveSetSlot(key, member, maxSize) {
      return redis.eval<[string, string], "added" | "existing" | "rejected">(
        RESERVE_SET_SLOT_SCRIPT,
        [key],
        [member, String(maxSize)],
      );
    },
    async releaseSetSlot(key, member) {
      await redis.srem(key, member);
    },
    async incrby(key, amount, ttlSecondsOnCreate) {
      const value = await redis.incrby(key, amount);
      if (ttlSecondsOnCreate !== undefined && value === amount) await redis.expire(key, ttlSecondsOnCreate);
      return value;
    },
    async decrby(key, amount) {
      await redis.decrby(key, amount);
    },
  };
}

