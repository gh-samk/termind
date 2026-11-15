import { db, initDb } from '../db/client'

export { db }
export const initDbForTests = () => initDb()
