-- Run as a MySQL administrator before starting the API.
CREATE DATABASE IF NOT EXISTS olamide
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Create a dedicated application user with a strong secret through your
-- secret manager, then grant only this database:
-- CREATE USER 'olamide_app'@'127.0.0.1' IDENTIFIED BY '<strong secret>';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
--   ON olamide.* TO 'olamide_app'@'127.0.0.1';
-- The API applies schema.sql at startup. Revoke DDL privileges after
-- migrating to a separate migration job for production.
