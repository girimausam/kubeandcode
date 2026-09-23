# ShopFlow on ECS — reference artifacts

Companion to the blog post **ShopFlow: a production ECS Fargate walkthrough**.

| File | Purpose |
|------|---------|
| `app.py` | Single image, `APP_ROLE` selects microservice behavior |
| `Dockerfile` | Production-style image with `curl` health checks + gunicorn |
| `task-def-orders.json` | Orders task with named port + EFS audit volume |
| `service-connect-orders.json` | Client-server Service Connect config |
| `service-connect-storefront-client.json` | Client-only Service Connect |
| `lambda_settlement.py` | VPC Lambda using Cloud Map DNS to orders |

Replace `ACCOUNT_ID`, EFS IDs, and namespace ARN before use.
