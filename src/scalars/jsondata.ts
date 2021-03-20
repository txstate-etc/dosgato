import { GraphQLScalarType } from 'graphql'

export const JsonData = new GraphQLScalarType({
  name: 'JsonData',
  description: 'Unstructured JSON data.',
  serialize (value: any): any {
    return value
  },
  parseValue (value: any): any {
    return value
  },
  parseLiteral (ast: any): any {
    return ast.value
  }
})
