import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'DeleteItem',

    key: util.dynamodb.toMapValues({
      owner: ctx.identity.sub,
      id: ctx.args.id
    }),

    condition: {
      expression: 'attribute_exists(id)'
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return ctx.result;
}