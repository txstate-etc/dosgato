import { makePathSafe } from '@dosgato/templating'
import { GraphQLScalarType, Kind } from 'graphql'

export class UrlSafePath extends String {}

export const UrlSafePathScalar = new GraphQLScalarType({
  name: 'UrlSafePath',
  description: 'This string must only contain URL-safe and lower-case characters.',
  serialize (value: string): string {
    return value
  },
  parseValue (value: string): string {
    if (typeof value !== 'string') {
      throw new Error('UrlSafePath must be a string')
    }
    return makePathSafe(value)
  },
  parseLiteral (ast: any): string {
    if (ast.kind !== Kind.STRING) {
      throw new Error('UrlSafePath must be a string')
    }
    return makePathSafe(ast.value)
  }
})
