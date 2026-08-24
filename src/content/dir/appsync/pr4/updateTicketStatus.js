import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { ticketId, status } = ctx.args.input;
  const updatedAt = util.time.nowISO8601();

  ctx.stash.ticketId = ticketId;
  ctx.stash.status = status;
  ctx.stash.updatedAt = updatedAt;

  return {
    operation: 'UpdateItem',

    key: util.dynamodb.toMapValues({
      ticketId
    }),

    update: {
      expression:
        'SET #status = :status, #updatedAt = :updatedAt',

      expressionNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      },

      expressionValues: util.dynamodb.toMapValues({
        ':status': status,
        ':updatedAt': updatedAt
      })
    },

    condition: {
      expression: 'attribute_exists(ticketId)'
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    if (ctx.error.type.includes('ConditionalCheckFailed')) {
      util.error('Ticket not found', 'NotFoundError');
    }

    util.error(ctx.error.message, ctx.error.type);
  }

  return ctx.result;
}