import type { Context } from '@txstate-mws/graphql-server'
import type { GraphQLError } from 'graphql'
import db from 'mysql2-async/db'
import { stringify } from 'txstate-utils'

export async function logMutation (queryTime: number, operationName: string, query: string, auth: any, variables: any, data: any, errors: GraphQLError[] | undefined, ctx: Context) {
  if (!variables?.validateOnly && query.trimStart().startsWith('mutation') && data?.[Object.keys(data)[0]].success) {
    await db.insert(`
      INSERT INTO mutationlog (userId, query, mutation, variables)
      SELECT id, ?, ?, ? FROM users WHERE login=?
    `, [query, operationName, stringify({ ...variables, ...(variables?.data ? { data: 'redacted' } : {}) }), auth.sub ?? auth.client_id])
  }
}
