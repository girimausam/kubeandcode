import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const input = ctx.args.input;
  const id = util.autoId();
  const now = util.time.nowISO8601();

  return {
    operation: 'PutItem',

    key: util.dynamodb.toMapValues({
      PK: `PROJECT#${input.projectId}`,
      SK: `TASK#${id}`
    }),

    attributeValues: util.dynamodb.toMapValues({
      id,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: 'TODO',
      createdBy: ctx.identity.sub,
      createdAt: now,
      updatedAt: now
    })
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return ctx.result;
}