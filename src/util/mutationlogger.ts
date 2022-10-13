import { GraphQLError } from 'graphql'
import db from 'mysql2-async/db'
import { stringify } from 'txstate-utils'

export async function logMutation (queryTime: number, operationName: string, query: string, auth: any, variables: any, data: any, errors?: GraphQLError[]) {
  if (!variables?.validateOnly && query.trimStart().startsWith('mutation') && data.success) {
    await db.insert(`
      INSERT INTO mutationlog (userId, query, mutation, variables)
      SELECT id, ?, ?, ? FROM users WHERE login=?
    `, [query, operationName, stringify({ ...variables, data: 'redacted' }), auth.sub])
  }
}
