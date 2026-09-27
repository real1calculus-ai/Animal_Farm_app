-- A least-privilege role for the application's runtime connection.
--
-- The policies added in the previous migration were inert: Supabase's
-- `postgres` role carries BYPASSRLS, so the app walked straight through every
-- one of them. Enabling RLS and then connecting as a role that ignores it is
-- worse than not enabling it, because the dashboard says "protected".
--
-- So the runtime connects as this role instead, which has no BYPASSRLS, is
-- not the table owner, and can do nothing but DML on the public schema.
-- Migrations keep using `postgres` through DIRECT_URL, because this role
-- deliberately cannot run DDL.
--
-- The password is NOT set here. A credential committed to a migration is a
-- credential published to everyone with the repository.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    -- NOLOGIN until a password is set, so the role cannot be used before it
    -- has been given one.
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  ELSE
    ALTER ROLE app_user NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Tables created by later migrations must be reachable too, or the app breaks
-- the next time the schema grows.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Prisma reads its migration history on connect; without this the runtime
-- role errors before it reaches a single query.
GRANT SELECT ON TABLE "_prisma_migrations" TO app_user;

GRANT EXECUTE ON FUNCTION current_farm_id() TO app_user;
