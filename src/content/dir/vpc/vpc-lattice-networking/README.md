# Simple VPC Lattice Demo Application

## Components

| Component | Runtime | Endpoint |
|---|---|---|
| order-service | ECS | `GET /orders`, `POST /orders` |
| inventory-service | EKS | `GET /inventory/{sku}` |
| customer-service | EC2 | `GET /customers/{id}` |
| notification-service | Lambda | API Gateway/Lambda Function URL style handler |
| RDS | PostgreSQL | `customers`, `orders`, `inventory` sample data |
| private-config-resource | EC2/private VPC resource | `GET /config` |

The services intentionally contain simple HTTP APIs. Deploy each workload privately, expose it through its load balancer/service endpoint, and register that endpoint with VPC Lattice.

## Local test

Each container service can run with Docker Compose:

```bash
docker compose up --build
```

Then test:

```bash
curl http://localhost:8081/orders
curl http://localhost:8082/inventory/SKU-001
curl http://localhost:8083/customers/CUST-001
curl http://localhost:8084/config
```

## Suggested Lattice mapping

- ECS order-service -> VPC Lattice Service
- EKS inventory-service -> VPC Lattice Service
- EC2 customer-service -> VPC Lattice Service
- Lambda notification-service -> VPC Lattice Service / Lambda target group
- RDS -> Resource Configuration
- private-config-resource -> Resource Configuration

The application code does not implement networking policy. VPC Lattice service association, auth policy, resource configuration, and VPC association are infrastructure concerns.
