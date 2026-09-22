/**
 * Viewer response — set Cache-Control for static assets (long TTL) vs HTML (no cache).
 * Runtime: cloudfront-js-2.0
 */
async function handler(event) {
  var response = event.response;
  var request = event.request;
  var uri = request.uri;
  var headers = response.headers;

  var isHtml =
    uri.endsWith(".html") ||
    uri.endsWith("/") ||
    (!uri.includes(".") && response.statusCode === 200);

  if (isHtml) {
    headers["cache-control"] = {
      value: "public, max-age=0, must-revalidate",
    };
  } else {
    headers["cache-control"] = {
      value: "public, max-age=31536000, immutable",
    };
  }

  return response;
}
