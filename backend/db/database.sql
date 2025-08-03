USE ai_finad_db;

CREATE TABLE IF NOT EXISTS users (
    id varchar(32) NOT NULL,
    username varchar(50) NOT NULL,
    password varchar(255) NOT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    totp_secret varchar(255) DEFAULT NULL,
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_portrait (
    id int NOT NULL AUTO_INCREMENT,
    user_id varchar(32) NOT NULL,
    age int DEFAULT NULL,
    income bigint DEFAULT NULL,
    asset bigint DEFAULT NULL,
    education_level int DEFAULT NULL,
    married tinyint(1) DEFAULT NULL,
    kids int DEFAULT NULL,
    occupation int DEFAULT NULL,
    risk_tolerance float DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY user_id (user_id),
    CONSTRAINT user_portrait_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB AUTO_INCREMENT = 72 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS allocations (
    id int NOT NULL AUTO_INCREMENT,
    user_id varchar(32) NOT NULL,
    asset varchar(10) NOT NULL,
    allocation float NOT NULL,
    PRIMARY KEY (id),
    KEY fk_allocations_users (user_id),
    CONSTRAINT fk_allocations_users FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB AUTO_INCREMENT = 183 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS goals (
    goal_id varchar(32) NOT NULL,
    user_id varchar(32) NOT NULL,
    goal_type varchar(50) NOT NULL,
    amount decimal(12, 2) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    start_net_income float DEFAULT NULL,
    end_net_income float DEFAULT NULL,
    closing_date date DEFAULT NULL,
    PRIMARY KEY (goal_id),
    KEY fk_user_id (user_id),
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT goals_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS expenses_income (
    id int NOT NULL AUTO_INCREMENT,
    user_id varchar(32) NOT NULL,
    expense_type varchar(50) DEFAULT NULL,
    income_type varchar(50) DEFAULT NULL,
    amount decimal(12, 2) NOT NULL,
    miscellaneous_good_service text,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_expenses_income_user_id (user_id),
    CONSTRAINT expenses_income_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_expenses_income_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 46 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;