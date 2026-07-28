import { revalidatePath, revalidateTag } from 'next/cache'
import { TAGS, type CacheTag } from './data'
import { STORE_TAGS, type StoreTag } from './store-data'

/**
 * Called by every admin save. This is the mechanism that makes
 * "content changes go live without a redeploy" true: the tag drops the cached
 * read, and revalidatePath drops the rendered route shell.
 *
 * Passing no tags revalidates everything, which is the safe default for a
 * save that touches more than one collection.
 */
export function revalidateContent(...tags: (CacheTag | StoreTag)[]): void {
  const list = tags.length
    ? tags
    : ([...Object.values(TAGS), ...Object.values(STORE_TAGS)] as (CacheTag | StoreTag)[])
  for (const tag of list) revalidateTag(tag)

  // Routes affected by each tag. Home reads almost everything, so it is always
  // in the list; being over-eager here costs one render, being under-eager
  // costs the client's trust that the admin works.
  const routes = new Set<string>(['/'])
  for (const tag of list) {
    switch (tag) {
      case TAGS.releases:
        routes.add('/music')
        routes.add('/artists')
        routes.add('/about')
        break
      case TAGS.artists:
        routes.add('/artists')
        routes.add('/music')
        break
      case TAGS.about:
        routes.add('/about')
        break
      case TAGS.contact:
      case TAGS.blackouts:
        routes.add('/contact')
        break
      case TAGS.services:
        break
      case STORE_TAGS.products:
      case STORE_TAGS.storePage:
        routes.add('/store')
        routes.add('/store/merch')
        routes.add('/store/music')
        routes.add('/store/beats')
        break
      case STORE_TAGS.events:
      case STORE_TAGS.eventsPage:
        routes.add('/events')
        break
      case TAGS.settings:
      case TAGS.home:
        routes.add('/music')
        routes.add('/artists')
        routes.add('/about')
        routes.add('/contact')
        routes.add('/store')
        routes.add('/events')
        break
    }
  }

  for (const route of routes) revalidatePath(route)
}
