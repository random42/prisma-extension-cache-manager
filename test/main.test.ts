import { Prisma, PrismaClient } from '@prisma/client';
import { Metrics } from '@prisma/client/runtime/library';
import * as cm from 'cache-manager';
import { KeyvCacheableMemory } from 'cacheable';
import Keyv from 'keyv';
import assert from 'node:assert';
import test from 'node:test';
import v8 from 'node:v8';
import { hash } from 'object-code';
import ext from '../src';
import { CACHE_OPERATIONS } from '../src/types';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

test('extension', { only: true }, async (t) => {
  const defaultTtl = 100;
  const cache = cm.createCache({
    ttl: defaultTtl,
    stores: [
      new Keyv({
        store: new KeyvCacheableMemory({ ttl: defaultTtl }),
        serialize: (x) => v8.serialize(x).toString('base64'),
        deserialize: (s) => v8.deserialize(Buffer.from(s, 'base64')),
      }),
    ],
  });

  // regenerate client to reset metrics
  const getClient = () => new PrismaClient().$extends(ext({ cache }));

  let prisma = getClient();
  assert(prisma.$cache === cache);
  // db queries count
  const queries = async (): Promise<number | undefined> =>
    ((await (prisma as any).$metrics.json()) as Metrics).counters.find(
      (x: any) => x.key === 'prisma_client_queries_total'
    )?.value;
  // expected db query count
  let q = 0;

  // reset client and cache before each test
  t.beforeEach(async () => {
    prisma = getClient();
    await cache.clear();
    q = 0;
  });

  const assertDbQueries = async () => {
    const qq = await queries();
    assert.strictEqual(qq, q, 'queries mismatch');
  };

  const assertCacheKeys = async (...keys: string[]) => {
    const data = await cache.mget(keys);
    assert.strictEqual(data.length, keys.length);
    assert.ok(data.every((x) => x));
  };

  const insert = {
    string: 'string',
    // decimal: new Prisma.Decimal('10.44'),
    float: 321.84784,
    timestamp: new Date(),
    bigint: BigInt(4784788738318273),
    bytes: Buffer.from('o21ijferve9ir3'),
  };
  // clear table
  await prisma.$executeRaw`delete from "User"`;
  const user = await prisma.user.create({
    data: insert,
  });

  const args = {
    where: {
      OR: [
        {
          id: {
            gte: 1,
          },
          bytes: user.bytes,
        },
        {
          string: {
            not: null,
          },
          // decimal: {
          //   not: new Prisma.Decimal('10.99'),
          // },
        },
      ],
    },
    orderBy: {
      timestamp: 'desc',
    },
  } satisfies Prisma.UserFindManyArgs;

  // t.runOnly(true);

  await t.test('every model operation', async (t) => {
    const useCache = { cache: true } as const;
    await prisma.user.findFirst(useCache);
    await prisma.user.findFirstOrThrow(useCache);
    const findUniqueArgs = {
      where: {
        id: user.id,
      },
      ...useCache,
    } satisfies Prisma.UserFindUniqueArgs;
    await prisma.user.findUnique(findUniqueArgs);
    await prisma.user.findUniqueOrThrow(findUniqueArgs);
    await prisma.user.groupBy({
      by: 'id',
      _sum: {
        float: true,
      },
      ...useCache,
    });
    await prisma.user.findMany(useCache);
    await prisma.user.count(useCache);
    const expectedOperations = CACHE_OPERATIONS.length;
    q += expectedOperations;
    await assertDbQueries();
  });

  await t.test('value matching', async (t) => {
    const key = 'key';
    const arg = {
      ...args,
      cache: {
        key,
      },
    };
    const d1 = await prisma.user.findMany(arg);
    q++;
    const d2 = await prisma.user.findMany(arg); // cached
    const d3: typeof d2 = (await cache.get(key))!;
    await assertDbQueries();
    assert(d3);
    assert.deepStrictEqual(d1, d2);
    assert.deepStrictEqual(d1, d3);
  });

  await t.test('key generation', async (t) => {
    const hashingData = { model: 'User', operation: 'findMany', args };
    await prisma.user.findMany({ ...args, cache: true });
    const key = hash(hashingData).toString();
    assert(await cache.get(key));
    q++;
    await assertDbQueries();
    // same arguments but different instantiation
    const now = new Date();
    await prisma.user.count({
      where: {
        // decimal: new Prisma.Decimal('1.1213'),
        bytes: Buffer.from('123'),
        timestamp: now,
      },
      cache: true,
    });
    // hit because object hash is the same
    // this may be different using a Decimal field
    await prisma.user.count({
      where: {
        // decimal: new Prisma.Decimal('1.1213'),
        bytes: Buffer.from('123'),
        timestamp: now,
      },
      cache: true,
    });
    q += 1;
    await assertDbQueries();
  });

  await t.test('no cache', async (t) => {
    const key = 'key';
    await prisma.user.findMany({ cache: { key } });
    await prisma.user.findMany();
    q += 2;
    assertCacheKeys(key);
    await assertDbQueries();
  });

  await t.test(
    'same args different operation should use different key',
    async (t) => {
      await prisma.user.findMany({ ...args, cache: true });
      await prisma.user.count({ ...args, cache: true });
      q += 2;
      await assertDbQueries();
    }
  );

  await t.test('same args different cache options', async (t) => {
    // miss
    await prisma.user.count({ ...args, cache: true });
    // hit
    await prisma.user.count({
      ...args,
      cache: {
        ttl: 200,
      },
    });
    // miss (different key)
    await prisma.user.count({
      ...args,
      cache: {
        ttl: 100,
        key: 'key',
      },
    });
    q += 2;
    await assertCacheKeys('key');
    await assertDbQueries();
  });

  await t.test('default ttl', async (t) => {
    await prisma.user.findFirst({
      cache: true,
    });
    q++;
    await sleep(defaultTtl + 10);
    // cache miss
    await prisma.user.findFirst({
      cache: true,
    });
    q++;
    await assertDbQueries();
  });

  await t.test('custom ttl', async (t) => {
    const ttl = 200;
    await prisma.user.count({
      cache: ttl,
    });
    q++;
    await sleep(ttl + 10);
    await prisma.user.count({
      cache: ttl,
    });
    q++;
    await assertDbQueries();
  });

  await t.test('shortened ttl should still use cache', async (t) => {
    const ttl = 400;
    await prisma.user.count({
      cache: ttl,
    });
    q++;
    await sleep(ttl / 2);
    await prisma.user.count({
      cache: ttl / 4,
    });
    await assertDbQueries();
  });
});
