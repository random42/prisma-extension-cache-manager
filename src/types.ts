import { Operation } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client/extension';
import type { Cache } from 'cache-manager';

export const REQUIRED_ARGS_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
] as const satisfies ReadonlyArray<Operation>;
export const OPTIONAL_ARGS_OPERATIONS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
] as const satisfies ReadonlyArray<Operation>;

export const CACHE_OPERATIONS = [
  ...REQUIRED_ARGS_OPERATIONS,
  ...OPTIONAL_ARGS_OPERATIONS,
] as const;

// const OPERATIONS = ["findMany"] as const satisfies ReadonlyArray<Operation>;
type RequiredArgsOperation = (typeof REQUIRED_ARGS_OPERATIONS)[number];
type OptionalArgsOperation = (typeof OPTIONAL_ARGS_OPERATIONS)[number];

export type CacheOperation = RequiredArgsOperation | OptionalArgsOperation;

type RequiredArgsFunction<O extends RequiredArgsOperation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>
) => Promise<Prisma.Result<T, A, O>>;

type OptionalArgsFunction<O extends OptionalArgsOperation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>
) => Promise<Prisma.Result<T, A, O>>;

export type ModelExtension = {
  [O1 in RequiredArgsOperation]: RequiredArgsFunction<O1>;
} & {
  [O2 in OptionalArgsOperation]: OptionalArgsFunction<O2>;
};

export interface CacheOptions {
  /**
   * Time-to-live in milliseconds
   */
  ttl?: number;
  /**
   * Cache key
   */
  key?: string;
}

export type CacheConfig = true | number | CacheOptions;

export interface PrismaCacheArgs {
  cache?: CacheConfig;
}

export type KeyGeneratorArgs = {
  model: string;
  operation: string;
  args: unknown;
};

export type KeyGenerator = (args: KeyGeneratorArgs) => string | Promise<string>;

export interface PrismaCacheExtensionConfig {
  cache: Cache;
  keyGenerator?: KeyGenerator;
}
