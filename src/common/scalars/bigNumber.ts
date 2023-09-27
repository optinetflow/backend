import { GraphQLScalarType, Kind } from 'graphql';

function validateBinaryNumber(value) {
  if (!(typeof value === 'number' || typeof value === 'bigint')) {
    throw new TypeError(`Invalid binary number => ${value}`);
  }

  return value;
}

/* eslint-disable @typescript-eslint/naming-convention */
export const BigNumberScalar = new GraphQLScalarType({
  name: 'BigNumber',
  description: 'A custom scalar type for big numbers',
  serialize(value) {
    // Check if the value is a BigInt
    if (typeof value === 'bigint') {
      return Number(value); // Convert BigInt to a string for serialization
    }

    throw new Error('BigInt must be a BigInt');
  },
  parseValue(value) {
    // Parse the value when it's passed as a variable in the query
    return BigInt(value as number);
  },
  parseLiteral(ast) {
    // Parse the value when it's included directly in the query
    if (ast.kind === Kind.INT) {
      return BigInt(ast.value);
    }

    throw new Error('BigInt must be an integer');
  },
});
