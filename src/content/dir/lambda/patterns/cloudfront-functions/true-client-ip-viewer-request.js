/**
 * Viewer request — forward viewer IP to origin (when origin needs client IP).
 * Runtime: cloudfront-js-2.0
 *
 * CloudFront also provides CloudFront-Viewer-Address on origin request;
 * this adds a familiar header name for apps that expect True-Client-IP.
 */
async function handler(event) {
  var request = event.request;
  var clientIp = event.viewer.ip;

  request.headers["true-client-ip"] = { value: clientIp };

  return request;
}
