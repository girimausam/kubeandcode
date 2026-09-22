/**
 * Lambda@Edge (viewer request) — single root index.html (typical React/Vite SPA on S3).
 *
 * Deploy: us-east-1, Node.js 20.x, publish version, viewer-request trigger.
 */
"use strict";

const INDEX = "/index.html";
const SKIP_PREFIXES = ["/api/"];

function isStaticPath(uri) {
  const path = uri.split("?")[0];
  const segment = path.replace(/\/$/, "").split("/").pop() || "";
  return segment.includes(".");
}

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  let uri = request.uri.split("?")[0];

  if (SKIP_PREFIXES.some((p) => uri.startsWith(p))) {
    return request;
  }

  if (uri === "/" || uri === INDEX || isStaticPath(uri)) {
    return request;
  }

  request.uri = INDEX;
  return request;
};
