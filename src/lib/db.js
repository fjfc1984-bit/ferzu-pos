import Dexie from "dexie"

export const db = new Dexie("FerzuPOS")
db.version(1).stores({
  products:       "++id, branch_id, category_id, barcode, name",
  offline_orders: "++id, branch_id, created_at, synced",
  sync_queue:     "++id, table_name, operation, payload, created_at, retries",
  cash_sessions:  "id, branch_id, status",
  customers:      "++id, branch_id, phone, name",
})
export async function addToSyncQueue(tableName, operation, payload) {
  await db.sync_queue.add({ table_name: tableName, operation, payload, created_at: new Date().toISOString(), retries: 0 })
}
export default db
