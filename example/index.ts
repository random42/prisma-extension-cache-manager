import { PrismaClient } from '@prisma/client';
import * as cm from 'cache-manager';
import assert from 'node:assert';
import cacheExtension from '../dist';

async function main() {
  const cache = await cm.caching('memory', {
    ttl: 1000,
    max: 200,
  });
  const ext = cacheExtension({ cache });
  const prisma = new PrismaClient().$extends(ext);
  assert(prisma.$cache === cache);
  await prisma.user.findMany({
    take: 20,
    cache: true,
  });
  await prisma.user.findUnique({
    where: {
      id: 1,
    },
    cache: 10 * 1000,
  });
  await prisma.user.count({
    where: {
      id: {
        gt: 0,
      },
    },
    cache: {
      ttl: 30 * 1000,
      key: `user_count_gt_0`,
    },
  });
}

main().catch(console.error);
