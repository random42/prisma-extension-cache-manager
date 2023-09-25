# prisma-extension-cache

A caching extension for [Prisma](https://www.prisma.io/), compatible with [cache-manager](https://www.npmjs.com/package/cache-manager).

## Features

- [cache-manager](https://www.npmjs.com/package/cache-manager) compatibility
- Only model queries can be cacheable (no $query or $queryRaw)
- Uses [object-code](https://www.npmjs.com/package/object-code) as default key generator, but you can pass a custom one
- In-memory cache is recommended, since types like Date or Prisma.Decimal would be lost if using JSON serialization (maybe will try to use some binary serialization in the future)

## Installation

Install:

```
npm i prisma-extension-cache
```

## Usage

```typescript
import { PrismaClient } from '@prisma/client';
import * as cm from 'cache-manager';
import cacheExtension from 'prisma-extension-cache';

async function main() {
  const cache = await cm.caching('memory', {
    ttl: 10000,
    max: 200,
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

## Learn more

- [Docs — Client extensions](https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions)
- [Docs — Shared extensions](https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions/shared-extensions)
- [Examples](https://github.com/prisma/prisma-client-extensions/tree/main)
- [Preview announcement blog post](https://www.prisma.io/blog/client-extensions-preview-8t3w27xkrxxn#introduction)
