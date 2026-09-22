/**
 * Viewer request — simple shared-secret gate via query param (demo only).
 * Runtime: cloudfront-js-2.0
 *
 * NOT a replacement for real auth. For production use Cognito, signed cookies, or JWT.
 * Allows: /preview?token=SECRET   Blocks other /preview paths without token.
 */
async function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (!uri.startsWith("/preview")) {
    return request;
  }

  var qs = request.querystring;
  var token = qs && qs.token ? qs.token.value : "";
  var expected = "change-me";

  if (token === expected) {
    return request;
  }

  return {
    statusCode: 403,
    statusDescription: "Forbidden",
    headers: {
      "content-type": { value: "text/plain" },
    },
    body: "Forbidden",
  };
}
