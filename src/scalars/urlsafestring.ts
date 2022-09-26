import { GraphQLScalarType, Kind } from 'graphql'

export function makeSafe (str: string) {
  return str.normalize('NFKD').toLocaleLowerCase().replace(/[^.a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-/, '').replace(/-$/, '')
}

export class UrlSafeString extends String {}

export const UrlSafeStringScalar = new GraphQLScalarType({
  name: 'UrlSafeString',
  description: 'This string must only contain URL-safe and lower-case characters.',
  serialize (value: string): string {
    return value
  },
  parseValue (value: string): string {
    if (typeof value !== 'string') {
      throw new Error('UrlSafeString must be a string')
    }
    return makeSafe(value)
  },
  parseLiteral (ast: any): string {
    if (ast.kind !== Kind.STRING) {
      throw new Error('UrlSafeString must be a string')
    }
    return makeSafe(ast.value)
  }
})
