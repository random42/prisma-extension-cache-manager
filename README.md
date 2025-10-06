# prisma-extension-cache-manager

A caching extension for [Prisma](https://www.prisma.io/), compatible with [cache-manager](https://www.npmjs.com/package/cache-manager).

## Features

- [cache-manager](https://www.npmjs.com/package/cache-manager) compatibility
- Only model queries can be cacheable (no $query or $queryRaw)
- Uses [object-code](https://www.npmjs.com/package/object-code) as default key generator, but you can pass a custom one

Because `cache-manager` needs a `keyv` compatible store, string serialization is mandatory.
`v8` object serialization is good enough to serialize JavaScript native types like `BigInt` or `Date`,
but be aware that it cannot serialize Prisma's `Decimal` type for example.

## Installation

Install:

```
npm i prisma-extension-cache-manager cache-manager cacheable keyv
```

## Usage

```typescript
import v8 from 'node:v8';
import { PrismaClient } from '@prisma/client';
import { KeyvCacheableMemory } from 'cacheable';
import Keyv from 'keyv';
import * as cm from 'cache-manager';
import cacheExtension from 'prisma-extension-cache-manager';

async function main() {
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
  const prisma = new PrismaClient().$extends(cacheExtension({ cache }));
  await prisma.user.findUniqueOrThrow({
    where: {
      email: user.email,
    },
    cache: true, // using cache default settings
  });
  await prisma.user.findMany({
    cache: 5000, // setting ttl in milliseconds
  });
  await prisma.user.count({
    cache: {
      ttl: 2000,
      key: 'user_count', // custom cache key
    },
  });
}

main().catch(console.error);
```
