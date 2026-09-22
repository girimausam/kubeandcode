/**
 * Viewer request — drop marketing query params to improve cache hit ratio.
 * Runtime: cloudfront-js-2.0
 *
 * Example: /page?utm_source=x&id=1 → /page?id=1
 */
async function handler(event) {
  var request = event.request;
  var qs = request.querystring;

  if (!qs) {
    return request;
  }

  var strip = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
  var kept = {};

  for (var key in qs) {
    if (strip.indexOf(key) === -1) {
      kept[key] = qs[key];
    }
  }

  request.querystring = kept;
  return request;
}
