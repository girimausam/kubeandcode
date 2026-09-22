/**
 * Viewer request — redirect viewers in a country to a locale prefix.
 * Runtime: cloudfront-js-2.0
 *
 * Uses CloudFront-Viewer-Country (present on viewer request).
 * Example: DE → /de/index.html
 */
async function handler(event) {
  var request = event.request;
  var country = request.headers["cloudfront-viewer-country"];

  if (!country) {
    return request;
  }

  var code = country.value;
  var uri = request.uri;

  if (code === "DE" && !uri.startsWith("/de/")) {
    return {
      statusCode: 302,
      statusDescription: "Found",
      headers: {
        location: { value: "/de/index.html" },
      },
    };
  }

  return request;
}
