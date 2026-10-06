-- Manual MySQL installation only. Docker Compose creates the configured
-- database and application user automatically on a fresh MySQL volume.
CREATE DATABASE IF NOT EXISTS olamide
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Create a dedicated application user with a strong secret through your
-- secret manager, then grant only this database:
-- CREATE USER 'olamide_app'@'127.0.0.1' IDENTIFIED BY '<strong secret>';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
--   ON olamide.* TO 'olamide_app'@'127.0.0.1';
-- The migration job applies schema.sql, the feature schemas and additive
-- migrations before the API starts. Keep CREATE/ALTER/INDEX privileges for
-- this deployment's migration user; a separate read/write API credential can
-- be introduced when migrations run with distinct credentials.
