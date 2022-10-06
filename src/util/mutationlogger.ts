import db from 'mysql2-async/db'
import { Cache } from 'txstate-utils'

const internalIdCache = new Cache(async (login: string) => {
  return await db.getval<number>('SELECT id FROM users WHERE login = ?', [login])
})

// TODO: Need to make sure data is actually being mutated, not just validated
export async function logMutation (queryTime: number, operationName: string, query: string, auth: any, variables: any) {
  if (query.includes('mutation')) {
    const userId = await internalIdCache.get(auth.sub)
    if (userId) {
      // await db.insert('INSERT INTO mutationlog (userId, query, mutation, variables) VALUES (?,?,?,?)',
      //   [userId, query, operationName, JSON.stringify(variables)])
    } else {
      // TODO: still log the mutation if the user can't be found? What would the userId be?
      console.error(`logMutation: user ${auth.sub} not found.`)
    }
  }
}
