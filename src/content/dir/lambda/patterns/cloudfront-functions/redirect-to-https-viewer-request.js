/**
 * Viewer request — redirect HTTP to HTTPS (if behavior still accepts HTTP).
 * Runtime: cloudfront-js-2.0
 *
 * Prefer "Redirect HTTP to HTTPS" on the distribution viewer policy when possible;
 * use this function only when you need custom redirect logic.
 */
async function handler(event) {
  var request = event.request;

  if (request.headers["cloudfront-forwarded-proto"]) {
    var proto = request.headers["cloudfront-forwarded-proto"].value;
    if (proto === "http") {
      var host = request.headers.host.value;
      var qs = request.querystring;
      var location =
        "https://" + host + request.uri + (qs ? "?" + qs : "");

      return {
        statusCode: 301,
        statusDescription: "Moved Permanently",
        headers: {
          location: { value: location },
          "cache-control": { value: "max-age=3600" },
        },
      };
    }
  }

  return request;
}
