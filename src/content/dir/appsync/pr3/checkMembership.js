import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const projectId = ctx.args.projectId ?? ctx.args.input.projectId;

  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({
      PK: `PROJECT#${projectId}`,
      SK: `MEMBER#${ctx.identity.sub}`
    })
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  if (!ctx.result) {
    util.error(
    'Project membership not found',
    'MembershipError'
  );
  }

  return ctx.result;
}