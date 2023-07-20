import { GraphQLScalarType, Kind } from 'graphql'

export const LargeInt = new GraphQLScalarType({
  name: 'LargeInt',
  description: 'An integer value that can go up to javascript\'s MAX_SAFE_INTEGER (about 53-bit) instead of the 32-bit signed Int type from graphql.',
  serialize (value: number): number {
    return value
  },
  parseValue (value: number): number {
    if (typeof value !== 'number' || value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
      throw new Error('LargeInt must be a number less than MAX_SAFE_INTEGER.')
    }
    return value
  },
  parseLiteral (ast: any): number {
    if (typeof ast.value !== 'number' || ast.value > Number.MAX_SAFE_INTEGER || ast.value < Number.MIN_SAFE_INTEGER) {
      throw new Error('LargeInt must be a number less than MAX_SAFE_INTEGER.')
    }
    return ast.value
  }
})
