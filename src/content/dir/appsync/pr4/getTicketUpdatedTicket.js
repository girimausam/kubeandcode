import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'GetItem',

    key: util.dynamodb.toMapValues({
      ticketId: ctx.stash.ticketId
    })
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  if (!ctx.result) {
    util.error('Ticket not found', 'NotFoundError');
  }

  ctx.stash.ticket = ctx.result;

  return ctx.result;
}
