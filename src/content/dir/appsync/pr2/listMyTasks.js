/**
 * Sends a request to the attached data source
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the request
 */
export function request(ctx) {
  const limit = ctx.args.limit ?? 20;
  return {
      operation: 'Query',
  
      query: {
        expression: '#owner = :owner',
        expressionNames: {
          '#owner': 'owner'
        },
        expressionValues: util.dynamodb.toMapValues({
          ':owner': ctx.identity.sub
        })
      },
      
      limit,
      nextToken: ctx.args.nextToken
    };
}

/**
* Returns the resolver result
* @param {import('@aws-appsync/utils').Context} ctx the context
* @returns {*} the result
*/
export function response(ctx) {
if (ctx.error) {
  util.error(ctx.error.message, ctx.error.type);
}

return {
  items: ctx.result.items,
  nextToken: ctx.result.nextToken
};
}
