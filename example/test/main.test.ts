import test, { before } from 'node:test';
import assert from 'node:assert';
import util from 'node:util';
import { hash } from 'object-code';
import { Prisma, PrismaClient } from '@prisma/client';
import * as cm from 'cache-manager';
import ext from '../../src';
import { Metrics } from '@prisma/client/runtime/library';
import _ from 'lodash';
import { CACHE_OPERATIONS, PrismaCacheArgs } from '../../src/types';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

test('extension', { only: true }, async (t) => {
  const defaultTtl = 100;
  const cache = await cm.caching('memory', {
    ttl: defaultTtl,
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
  // expected cache size
  let c = 0;

  // reset client and cache before each test
  t.beforeEach(async () => {
    prisma = getClient();
    await cache.reset();
    q = 0;
    c = 0;
  });

  const testCache = async () => {
    const qq = await queries();
    const cc = cache.store.size;
    assert.equal(qq, q, 'queries mismatch');
    assert.equal(cc, c, 'cache mismatch');
  };
  const insert = {
    string: 'string',
    decimal: new Prisma.Decimal('10.44'),
    bigint: BigInt('1283231897'),
    float: 321.84784,
    timestamp: new Date(),
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
          decimal: {
            not: new Prisma.Decimal('10.99'),
          },
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
    c += expectedOperations;
    await testCache();
  });

  await t.test('value deep cloning', async (t) => {
    const key = 'key';
    const arg = {
      ...args,
      cache: {
        key,
      },
    };
    const d1 = await prisma.user.findMany(arg);
    q++;
    c++;
    await testCache();
    const d2 = await prisma.user.findMany(arg);
    const d3: typeof d2 = (await cache.get(key))!;
    await testCache();
    assert(d3);
    assert.deepEqual(d1, d2);
    assert.deepEqual(d1, d3);
    assert(d1 !== d2 && d1 !== d3 && d2 !== d3);
    assert(d1[0] !== d2[0] && d1[0] !== d3[0] && d2[0] !== d3[0]);
    assert(
      d1[0].timestamp !== d2[0].timestamp &&
        d1[0].timestamp !== d3[0].timestamp &&
        d2[0].timestamp !== d3[0].timestamp
    );
  });

  await t.test('key generation', async (t) => {
    const hashingData = { model: 'User', operation: 'findMany', args };
    await prisma.user.findMany({ ...args, cache: true });
    const key = hash(hashingData).toString();
    assert(await cache.get(key));
    q++;
    c++;
    await testCache();
    // same arguments but different instantiation
    const now = Date.now();
    await prisma.user.count({
      where: {
        decimal: new Prisma.Decimal('1.1213'),
        bytes: Buffer.from('123'),
        timestamp: new Date(now),
      },
      cache: true,
    });
    await prisma.user.count({
      where: {
        decimal: new Prisma.Decimal('1.1213'),
        bytes: Buffer.from('123'),
        timestamp: new Date(now),
      },
      cache: true,
    });
    c++;
    q++;
    await testCache();
  });

  await t.test('no cache', async (t) => {
    await prisma.user.findMany({ cache: true });
    await prisma.user.findMany();
    q += 2;
    c++;
    await testCache();
  });

  await t.test(
    'same args different operation should use different key',
    async (t) => {
      await prisma.user.findMany({ ...args, cache: true });
      await prisma.user.count({ ...args, cache: true });
      q += 2;
      c += 2;
      await testCache();
    }
  );

  await t.test('same args different cache options', async (t) => {
    await prisma.user.count({ ...args, cache: true });
    // cache hit
    await prisma.user.count({
      ...args,
      cache: {
        ttl: 200,
      },
    });
    // cache miss
    await prisma.user.count({
      ...args,
      cache: {
        ttl: 100,
        key: 'different-key',
      },
    });
    q += 2;
    c += 2;
    await testCache();
  });

  await t.test('default ttl', async (t) => {
    await prisma.user.findFirst({
      cache: true,
    });
    q++;
    c++;
    await sleep(defaultTtl + 10);
    await c--;
    // cache miss
    await prisma.user.findFirst({
      cache: true,
    });
    q++;
    c++;
    await testCache();
  });

  await t.test('custom ttl', async (t) => {
    const ttl = 200;
    await prisma.user.count({
      cache: ttl,
    });
    q++;
    c++;
    await sleep(ttl + 10);
    await prisma.user.count({
      cache: ttl,
    });
    q++;
    await testCache();
  });

  await t.test('shortened ttl should still use cache', async (t) => {
    const ttl = 400;
    await prisma.user.count({
      cache: ttl,
    });
    q++;
    c++;
    await sleep(ttl / 2);
    await prisma.user.count({
      cache: ttl / 4,
    });
    await testCache();
  });
});
