import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { id, title, description, completed } = ctx.args.input;

  if (!id || id.trim().length === 0) {
    util.error('id is required', 'ValidationError');
  }

  if (
    title === undefined &&
    description === undefined &&
    completed === undefined
  ) {
    util.error(
      'At least one field must be provided for update',
      'ValidationError'
    );
  }


  const values = {
    ...input,
    updatedAt: util.time.nowISO8601()
  };

  const sets = [];
  const expressionNames = {};
  const expressionValues = {};

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      const name = `#${key}`;
      const valueName = `:${key}`;

      sets.push(`${name} = ${valueName}`);
      expressionNames[name] = key;
      expressionValues[valueName] = value;
    }
  }

  return {
    operation: 'UpdateItem',

    key: util.dynamodb.toMapValues({
      owner: ctx.identity.sub,
      id
    }),

    update: {
      expression: `SET ${sets.join(', ')}`,
      expressionNames,
      expressionValues: util.dynamodb.toMapValues(expressionValues)
    },

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