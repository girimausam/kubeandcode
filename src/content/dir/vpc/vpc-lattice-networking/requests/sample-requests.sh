# ECS Order Service
curl http://ORDER_SERVICE_URL/orders
curl -X POST http://ORDER_SERVICE_URL/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"CUST-001","sku":"SKU-001","quantity":2}'

# EKS Inventory Service
curl http://INVENTORY_SERVICE_URL/inventory/SKU-001

# EC2 Customer Service
curl http://CUSTOMER_SERVICE_URL/customers/CUST-001

# Private VPC Resource
curl http://PRIVATE_RESOURCE_URL/config

# Lambda
curl -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ORD-001"}'
