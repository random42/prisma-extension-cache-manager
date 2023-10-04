import { Prisma } from '@prisma/client/extension';
import { hash } from 'object-code';
import {
  CACHE_OPERATIONS,
  CacheConfig,
  CacheOptions,
  KeyGenerator,
  ModelExtension,
  PrismaCacheExtensionConfig,
} from './types';

export type {
  Cache,
  CacheConfig,
  CacheOperation,
  CacheOptions,
  KeyGenerator,
  KeyGeneratorArgs,
  Milliseconds,
  PrismaCacheArgs,
  PrismaCacheExtensionConfig,
} from './types';

export const defaultKeyGenerator: KeyGenerator = (args) =>
  hash(args).toString();

const _parseConfig = (config: CacheConfig): CacheOptions => {
  let options: CacheOptions = {};
  if (typeof config === 'object') {
    options = config;
  } else if (typeof config === 'number') {
    options.ttl = config;
  }
  return options;
};

export default (config: PrismaCacheExtensionConfig) => {
  const { cache } = config;
  const keyGenerator = config.keyGenerator ?? defaultKeyGenerator;
  return Prisma.defineExtension({
    name: 'cache',
    client: {
      $cache: cache,
    },
    model: {
      $allModels: {} as ModelExtension,
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const useCache = !!(
            ['number', 'boolean', 'object'].includes(typeof args.cache) &&
            args.cache !== null &&
            (CACHE_OPERATIONS as ReadonlyArray<string>).includes(operation)
          );
          if (!useCache) {
            return query(args);
          }
          const queryArgs = {
            ...args,
          };
          delete queryArgs.cache;
          const options = _parseConfig(args.cache as CacheConfig);
          const key: string =
            options.key ??
            (await keyGenerator({ model, operation, args: queryArgs }));
          return cache.wrap(key, () => query(queryArgs), options.ttl);
        },
      },
    },
  });
};
