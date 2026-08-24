import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const ticket = ctx.stash.ticket;

  return {
    operation: 'PutEvents',

    events: [
      {
        source: 'ticket.api',

        detailType: 'TicketStatusChanged',

        detail: {
          ticketId: ticket.ticketId,
          status: ticket.status,
          owner: ticket.owner,
          priority: ticket.priority,
          updatedAt: ticket.updatedAt
        }
      }
    ]
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return ctx.stash.ticket;
}
