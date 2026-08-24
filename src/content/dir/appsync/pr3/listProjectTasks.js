import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'Query',

    query: {
      expression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionValues: util.dynamodb.toMapValues({
        ':pk': `PROJECT#${ctx.args.projectId}`,
        ':sk': 'TASK#'
      })
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return ctx.result.items;
}