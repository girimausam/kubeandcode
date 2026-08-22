import { util } from '@aws-appsync/utils';

export function request(ctx) {
  // Error handling

  const { title, description } = ctx.args.input;

  if (!title || title.trim().length === 0) {
    util.error('title is required', 'ValidationError');
  }

  if (title.length > 200) {
    util.error(
      'title cannot exceed 200 characters',
      'ValidationError'
    );
  }

  if (description && description.length > 2000) {
    util.error(
      'description cannot exceed 2000 characters',
      'ValidationError'
    );
  }

  const id = util.autoId();
  const now = util.time.nowISO8601();
  const owner = ctx.identity.sub;

  return {
    operation: 'PutItem',

    key: util.dynamodb.toMapValues({
      owner,
      id
    }),

    attributeValues: util.dynamodb.toMapValues({
      title: ctx.args.input.title,
      description: ctx.args.input.description,
      completed: false,
      createdAt: now,
      updatedAt: now
    }),

    condition: {
      expression: 'attribute_not_exists(id)'
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return ctx.result;
}