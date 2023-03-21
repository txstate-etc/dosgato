import { GraphQLScalarType, Kind } from 'graphql'
import { lookup } from 'mime-types'

export function makeSafeFilename (str: string) {
  const extFromFileName = str.match(/\.(\w+)$/)?.[1]
  if (extFromFileName && lookup(extFromFileName)) str = str.replace(new RegExp('\\.' + extFromFileName + '$'), '')
  return str.normalize('NFKD').replace(/[^. _a-z0-9-]/ig, '').replace(/\s+/g, ' ').trim()
}

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
