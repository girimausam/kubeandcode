import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'GetItem',

    key: util.dynamodb.toMapValues({
      owner: ctx.identity.sub,
      id: ctx.args.id
    })
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  if (!ctx.result) {
    util.error(
      'Task not found',
      'NotFoundError'
    );
  }


  return ctx.result;
}