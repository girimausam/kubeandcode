/**
 * Viewer request — SPA / static site path rewrite (per-route index.html in S3).
 * Runtime: cloudfront-js-2.0
 *
 * /about     → /about/index.html
 * /docs/     → /docs/index.html
 * /app.js    → unchanged (has extension)
 *
 * Single root index.html only → use ../cloudfront_spa_origin_request.py (REWRITE_MODE=root).
 */
async function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith("/")) {
    request.uri += "index.html";
  } else if (!uri.includes(".")) {
    request.uri += "/index.html";
  }

  return request;
}
