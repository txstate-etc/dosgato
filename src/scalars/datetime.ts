import { GraphQLScalarType, Kind, type ValueNode } from 'graphql'
import { DateTime } from 'luxon'

export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Date and Time in ISO 8601 string format. JSON parser should convert to javascript Date type.',

  serialize (value: DateTime) {
    return value.toISO()
  },

  // TODO: Uncomment validity check onces the schema version scalar is in use
  parseValue (value: string) {
    const parsedValue = DateTime.fromISO(value)
    // if (!parsedValue.isValid) throw new Error(`Invalid date: ${parsedValue.invalidReason} ${parsedValue.invalidExplanation}`)
    return parsedValue
  },

  parseLiteral (ast: ValueNode) {
    if (ast.kind === Kind.STRING) {
      const parsedValue = DateTime.fromISO(ast.value)
      // if (!parsedValue.isValid) throw new Error(`Invalid date: ${parsedValue.invalidReason} ${parsedValue.invalidExplanation}`)
      return parsedValue
    }
    return null
  }
})
