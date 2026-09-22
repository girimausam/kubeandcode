/**
 * Viewer response — add CORS if origin did not send Access-Control-Allow-Origin.
 * Runtime: cloudfront-js-2.0
 *
 * Set ALLOWED_ORIGIN to your web app origin (not * in production with credentials).
 */
async function handler(event) {
  var response = event.response;
  var headers = response.headers;
  var allowedOrigin = "https://app.example.com";

  if (!headers["access-control-allow-origin"]) {
    headers["access-control-allow-origin"] = { value: allowedOrigin };
    headers["access-control-allow-methods"] = {
      value: "GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE",
    };
    headers["access-control-allow-headers"] = {
      value: "Content-Type, Authorization, X-Amz-Date, X-Api-Key",
    };
    headers["vary"] = { value: "Origin" };
  }

  return response;
}
