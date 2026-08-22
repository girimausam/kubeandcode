import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const groups = ctx.identity.groups || [];

  if (!groups.includes('admins')) {
    util.unauthorized();
  }

  return {
    operation: 'GetItem',

    key: util.dynamodb.toMapValues({
      owner: ctx.args.owner,
      id: ctx.args.id
    })
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return ctx.result;
}