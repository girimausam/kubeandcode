/**
 * Viewer response — add common HTTP security headers.
 * Runtime: cloudfront-js-2.0
 */
async function handler(event) {
  var response = event.response;
  var headers = response.headers;

  headers["strict-transport-security"] = {
    value: "max-age=63072000; includeSubdomains; preload",
  };
  headers["x-content-type-options"] = { value: "nosniff" };
  headers["x-frame-options"] = { value: "DENY" };
  headers["x-xss-protection"] = { value: "1; mode=block" };
  headers["referrer-policy"] = { value: "strict-origin-when-cross-origin" };
  // Tighten for your app; example allows same-origin + inline for legacy widgets.
  headers["content-security-policy"] = {
    value: "default-src 'self'; img-src 'self' data: https:; script-src 'self'",
  };

  return response;
}
