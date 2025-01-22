-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create necessary tables if they don't exist
-- Note: Main tables are managed by Drizzle ORM, this is for additional setup
