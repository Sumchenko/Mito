import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'

/** Local changes not yet confirmed by the server. */
export const usePendingCount = () => useLiveQuery(() => db.outbox.count(), []) ?? 0
