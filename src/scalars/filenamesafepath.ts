import { makeFilenamePathSafe } from '@dosgato/templating'
import { GraphQLScalarType, Kind } from 'graphql'

export class FilenameSafePath extends String {}

export const FilenameSafePathScalar = new GraphQLScalarType({
  name: 'FilenameSafePath',
  description: 'This string must only contain URL-safe and lower-case characters.',
  serialize (value: string): string {
    return value
  },
  parseValue (value: string): string {
    if (typeof value !== 'string') {
      throw new Error('FilenameSafePath must be a string')
    }
    return makeFilenamePathSafe(value)
  },
  parseLiteral (ast: any): string {
    if (ast.kind !== Kind.STRING) {
      throw new Error('FilenameSafePath must be a string')
    }
    return makeFilenamePathSafe(ast.value)
  }
})
