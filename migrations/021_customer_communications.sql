CREATE TABLE conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_key VARCHAR(191) NOT NULL,
  type ENUM('CUSTOMER_ADMIN','CUSTOMER_DRIVER') NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NULL,
  status ENUM('OPEN','HANDLED','CLOSED') NOT NULL DEFAULT 'OPEN',
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_thread_key (thread_key),
  KEY idx_conversations_admin_inbox (type,status,updated_at,id),
  KEY idx_conversations_customer (customer_id,updated_at,id),
  KEY idx_conversations_driver (driver_id,updated_at,id),
  CONSTRAINT fk_conversations_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_conversations_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_conversations_driver FOREIGN KEY (driver_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE conversation_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_user_id BIGINT UNSIGNED NOT NULL,
  sender_role ENUM('CUSTOMER','ADMIN','DRIVER') NOT NULL,
  message VARCHAR(1000) NOT NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_conversation_messages_thread (conversation_id,id),
  KEY idx_conversation_messages_unread (conversation_id,read_at,sender_user_id),
  CONSTRAINT fk_conversation_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_conversation_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id),
  CONSTRAINT chk_conversation_message_length CHECK (CHAR_LENGTH(message) BETWEEN 1 AND 1000)
) ENGINE=InnoDB;
