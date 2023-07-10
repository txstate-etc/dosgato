import { GraphQLScalarType, Kind } from 'graphql'
import { makeSafe, makeSafeFilename } from '../internal.js'

export class FilenameSafePath extends String {}

export function makeFilenamePathSafe (path: string) {
  const parts = path.split('/')
  return [...parts.slice(0, -1).map(makeSafe), makeSafeFilename(parts[parts.length - 1])].join('/')
}

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
