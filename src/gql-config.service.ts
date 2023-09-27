import { ApolloDriverConfig } from '@nestjs/apollo';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GqlOptionsFactory } from '@nestjs/graphql';

import { GraphqlConfig } from './common/configs/config.interface';
import { BigNumberScalar } from './common/scalars/bigNumber';

@Injectable()
export class GqlConfigService implements GqlOptionsFactory {
  constructor(private configService: ConfigService) {}

  createGqlOptions(): ApolloDriverConfig {
    const graphqlConfig = this.configService.get<GraphqlConfig>('graphql');

    return {
      // schema options
      autoSchemaFile: graphqlConfig?.schemaDestination || './src/schema.graphql',
      sortSchema: graphqlConfig?.sortSchema,
      buildSchemaOptions: {
        numberScalarMode: 'integer',
      },
      // subscription
      installSubscriptionHandlers: true,
      includeStacktraceInErrorResponses: graphqlConfig?.debug,
      playground: graphqlConfig?.playgroundEnabled,
      introspection: graphqlConfig?.introspection,
      context: ({ req }) => ({ req }),
      resolvers: {
        BigNumber: BigNumberScalar,
      },
    };
  }
}
