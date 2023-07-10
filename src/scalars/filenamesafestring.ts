import { makeSafeFilename } from '@dosgato/templating'
import { GraphQLScalarType, Kind } from 'graphql'

export class FilenameSafeString extends String {}

export const FilenameSafeStringScalar = new GraphQLScalarType({
  name: 'FilenameSafeString',
  description: 'This string must only contain URL-safe and lower-case characters.',
  serialize (value: string): string {
    return value
  },
  parseValue (value: string): string {
    if (typeof value !== 'string') {
      throw new Error('FilenameSafeString must be a string')
    }
    return makeSafeFilename(value)
  },
  parseLiteral (ast: any): string {
    if (ast.kind !== Kind.STRING) {
      throw new Error('FilenameSafeString must be a string')
    }
    return makeSafeFilename(ast.value)
  }
})
