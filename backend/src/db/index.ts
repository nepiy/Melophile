import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

function createClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL must be set to the Railway PostgreSQL URL.')
  return drizzle(postgres(connectionString, { max: 10, idle_timeout: 20 }), { schema })
}

type DbClient = ReturnType<typeof createClient>
const globalForDb = globalThis as unknown as { __melophileDb?: DbClient }
function compat<T extends object>(target: T): T {
  return new Proxy(target, {
    get(current, property, receiver) {
      if (property === 'get') return async () => (await (current as any).execute())[0]
      if (property === 'all') return async () => (current as any).execute()
      if (property === 'run') return async () => (current as any).execute()
      if (property === 'transaction') {
        return (callback: (tx: any) => unknown, ...args: unknown[]) =>
          (current as any).transaction((tx: object) => callback(compat(tx)), ...args)
      }
      const value = Reflect.get(current, property, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const result = value.apply(current, args)
        // Drizzle's fluent builders change concrete class after calls such as
        // .from(), .where(), and .limit(). Wrap every non-Promise object so
        // the SQLite compatibility helpers remain available at the end of
        // any PostgreSQL query chain.
        if (result && typeof result === 'object' && !(result instanceof Promise)) {
          return compat(result)
        }
        return result
      }
    },
  })
}

// The compatibility type retains current query-module inference while those
// modules are migrated from SQLite helpers to PostgreSQL-native repositories.
export const db: any = globalForDb.__melophileDb ?? compat(createClient())
if (process.env.NODE_ENV !== 'production') globalForDb.__melophileDb = db
export { schema }
export * from './schema'
