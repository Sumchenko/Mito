// In-memory IndexedDB so the real Dexie schema and repositories run under Node.
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { clearAllData } from '@/data/backup'

beforeEach(async () => {
  await clearAllData()
})
