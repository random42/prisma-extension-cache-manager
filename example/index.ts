import { PrismaClient } from '@prisma/client';
import * as cm from 'cache-manager';
import assert from 'node:assert';
import util from 'node:util';
import cacheExtension from '../dist';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const cache = await cm.caching('memory', {
    ttl: 1000,
    max: 200,
  });
  const debug = () =>
    console.error(
      util.inspect(cache.store.dump(), {
        depth: 4,
        colors: true,
      })
    );
  const ext = cacheExtension({ cache });
  const prisma = new PrismaClient().$extends(ext);
  assert(prisma.$cache === cache);
  const user = {
    email: 'foo@example.com',
    name: 'john schmoe',
  };
  await prisma.user.upsert({
    where: {
      email: user.email,
    },
    update: {},
    create: user,
  });
  // console.log('upsert');
  const x1 = await prisma.user.findUniqueOrThrow({
    where: {
      email: user.email,
    },
    cache: {
      key: '1',
    },
  });
  const x2 = await prisma.user.findUniqueOrThrow({
    where: {
      email: user.email,
    },
    cache: {
      key: '1',
    },
  });
  debug();
}

main().catch(console.error);
