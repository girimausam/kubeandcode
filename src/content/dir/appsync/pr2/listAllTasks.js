import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const groups = ctx.identity.groups || [];

  if (!groups.includes('Admins')) {
    util.unauthorized();
  }

  const limit = ctx.args.limit ?? 20;

  return {
    operation: 'Scan',
    limit,
    nextToken: ctx.args.nextToken
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return {
    items: ctx.result.items,
    nextToken: ctx.result.nextToken
  };
}