CREATE TABLE customers (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(20) NOT NULL
);

CREATE TABLE inventory (
    sku VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    available INTEGER NOT NULL
);

CREATE TABLE orders (
    id VARCHAR(20) PRIMARY KEY,
    customer_id VARCHAR(20) REFERENCES customers(id),
    sku VARCHAR(20) REFERENCES inventory(sku),
    quantity INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO customers (id, name, tier) VALUES
('CUST-001', 'Alice Smith', 'GOLD'),
('CUST-002', 'Bob Jones', 'STANDARD');

INSERT INTO inventory (sku, name, available) VALUES
('SKU-001', 'Laptop', 15),
('SKU-002', 'Monitor', 8),
('SKU-003', 'Keyboard', 42);

INSERT INTO orders (id, customer_id, sku, quantity, status) VALUES
('ORD-001', 'CUST-001', 'SKU-001', 2, 'CREATED'),
('ORD-002', 'CUST-002', 'SKU-002', 1, 'COMPLETED');
