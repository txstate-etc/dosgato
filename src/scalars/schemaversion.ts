import { GraphQLScalarType, Kind, type ValueNode } from 'graphql'
import { DateTime } from 'luxon'

const schemaVersionFormat = 'yLLddHHmmss'

export class SchemaVersion extends String {}

export const SchemaVersionScalar = new GraphQLScalarType({
  name: 'SchemaVersion',
  description: 'Date and Time in format yLLddHHmmss (20230101123456 for January 1, 2023 at 12:34:56). JSON parser should convert to javascript Date type.',

  serialize (value: DateTime) {
    return value.toFormat(schemaVersionFormat)
  },

  parseValue (value: string) {
    const parsedValue = DateTime.fromFormat(value, schemaVersionFormat)
    if (!parsedValue.isValid) throw new Error(`Invalid date: ${parsedValue.invalidReason} ${parsedValue.invalidExplanation}`)
    return parsedValue
  },

  parseLiteral (ast: ValueNode) {
    if (ast.kind === Kind.STRING) {
      const parsedValue = DateTime.fromFormat(ast.value, schemaVersionFormat)
      if (!parsedValue.isValid) throw new Error(`Invalid date: ${parsedValue.invalidReason} ${parsedValue.invalidExplanation}`)
      return parsedValue
    }
    return null
  }
})