import { GraphQLScalarType, Kind } from 'graphql'
import { makeSafe } from '../internal.js'

export class UrlSafePath extends String {}

export function makePathSafe (path: string) {
  return path.split('/').map(makeSafe).join('/')
}

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
