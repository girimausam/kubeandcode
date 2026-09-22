"""
Lambda@Edge: SPA routing for S3 + CloudFront (OAC).

Use on **viewer request** (preferred for URI rewrites) or origin request.

Two deploy styles (set REWRITE_MODE):

  root — One index.html at bucket root (Vite, CRA, Angular CLI default).
         /dashboard  →  /index.html

  path — Per-route index files (Gatsby/Hugo export, aws-samples SPA rewrite).
         /dashboard  →  /dashboard/index.html
         /docs/      →  /docs/index.html

References:
  https://github.com/aws-samples/amazon-cloudfront-functions/tree/main/url-rewrite-single-page-apps
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-response-code.html

Deploy:
  1. Create in us-east-1; runtime Python 3.11 or Node 20.
  2. Publish a version; attach to distribution **viewer request** (or origin request).
  3. S3 origin + OAC; default root object: index.html.
  4. Custom error responses (S3 REST often returns 403 for missing keys):
       403 → /index.html, response code 200
       404 → /index.html, response code 200
     (Use with REWRITE_MODE=root; optional if rewrite covers all routes.)

Lambda@Edge has no environment variables — edit constants below.
"""

REWRITE_MODE = "root"  # "root" | "path"
INDEX_FILE = "index.html"
SKIP_PREFIXES = ("/api/",)


def _path_only(uri: str) -> str:
    return uri.split("?", 1)[0]


def _is_static_object(path: str) -> bool:
    """True if the last URL segment looks like a file (has an extension)."""
    segment = path.rstrip("/").rsplit("/", 1)[-1] if path != "/" else ""
    if not segment:
        return False
    return "." in segment


def _rewrite_root(path: str) -> str:
    if path in ("", "/"):
        return f"/{INDEX_FILE}"
    if _is_static_object(path):
        return path
    return f"/{INDEX_FILE}"


def _rewrite_path(path: str) -> str:
    """Same rules as aws-samples url-rewrite-single-page-apps."""
    if _is_static_object(path):
        return path
    if path.endswith("/"):
        return f"{path}{INDEX_FILE}"
    return f"{path}/{INDEX_FILE}"


def lambda_handler(event, context):
    record = event["Records"][0]["cf"]
    request = record["request"]
    path = _path_only(request["uri"])

    if any(path.startswith(prefix) for prefix in SKIP_PREFIXES):
        return request

    if REWRITE_MODE == "path":
        request["uri"] = _rewrite_path(path)
    else:
        request["uri"] = _rewrite_root(path)

    return request
