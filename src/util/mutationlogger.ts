import type { Context } from '@txstate-mws/graphql-server'
import type { FastifyTxStateAuthInfo } from 'fastify-txstate'
import type { GraphQLError } from 'graphql'
import db from 'mysql2-async/db'
import { stringify } from 'txstate-utils'

/**
 * GraphQL results nest the response under the mutation name (`{ createPage: { success } }`),
 * while the RESTful upload routes pass their flat response object (`{ success, ids }`).
 */
function wasSuccessful (data: any) {
  if (data == null || typeof data !== 'object') return false
  if (data.success === true) return true
  const firstKey = Object.keys(data)[0]
  return firstKey != null && data[firstKey]?.success === true
}

/**
 * Records one row per successful mutation. Runs from the server's `after` hook for GraphQL
 * mutations and is called directly by the RESTful upload routes. `auth` is the object built by
 * the authenticate callback: `username` for a user, `clientId` for a service token.
 */
export async function logMutation (queryTime: number, operationName: string | undefined, query: string, auth: FastifyTxStateAuthInfo | undefined, variables: any, data: any, errors: GraphQLError[] | undefined, ctx: Context) {
  if (!variables?.validateOnly && query.trimStart().startsWith('mutation') && wasSuccessful(data)) {
    const login = auth?.username ?? auth?.clientId
    if (!login) return
    const componentData = variables?.data?.templateKey?.length
      ? { data: { redacted: true, templateKey: variables.data.templateKey } }
      : variables?.data ? { data: { redacted: true } } : {}
    await db.insert(`
      INSERT INTO mutationlog (userId, query, mutation, variables)
      SELECT id, ?, ?, ? FROM users WHERE login=?
    `, [query, operationName ?? null, stringify({ ...variables, ...componentData }), login])
  }
}
