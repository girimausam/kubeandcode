/**
 * CloudFront Functions (viewer request) — AWS official SPA URL rewrite pattern.
 * Cheaper/lighter than Lambda@Edge for URI rewrites only.
 *
 * Deploy: Runtime cloudfront-js-2.0, associate with viewer-request on S3 behavior.
 * https://github.com/aws-samples/amazon-cloudfront-functions/tree/main/url-rewrite-single-page-apps
 *
 * Expects each route to have its own index.html in S3 (e.g. /about/index.html).
 * For a single root index.html only, use cloudfront_spa_origin_request.py with REWRITE_MODE=root.
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
