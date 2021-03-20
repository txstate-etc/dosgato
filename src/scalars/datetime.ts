import { GraphQLScalarType, Kind, ValueNode } from 'graphql'
import { DateTime } from 'luxon'

export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Date and Time in ISO 8601 string format. JSON parser should convert to javascript Date type.',

  serialize (value: DateTime) {
    return value.toISO()
  },

  parseValue (value: string) {
    return DateTime.fromISO(value)
  },

  parseLiteral (ast: ValueNode) {
    if (ast.kind === Kind.STRING) {
      return DateTime.fromISO(ast.value)
    }
    return null
  }
})
