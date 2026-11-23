CREATE TABLE IF NOT EXISTS customer_orders (
 order_seq BIGINT UNSIGNED PRIMARY KEY,
 customer_id VARCHAR(100) NOT NULL,
 INDEX customer_order_history(customer_id,order_seq),
 FOREIGN KEY(order_seq) REFERENCES orders(seq) ON DELETE CASCADE,
 FOREIGN KEY(customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO customer_orders (order_seq,customer_id)
SELECT orders.seq,customers.id FROM orders
JOIN customers ON customers.id=JSON_UNQUOTE(JSON_EXTRACT(orders.data,'$.customerId'));

INSERT IGNORE INTO schema_migrations VALUES(3,'2026-11-21T00:00:00.000Z');
