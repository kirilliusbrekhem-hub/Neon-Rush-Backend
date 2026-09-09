-- Guest-first onboarding support. Additive only — does not touch existing rows.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;

-- A registered (non-guest) account must have both email and password.
-- Guests may have neither. This keeps the invariant enforced at the DB level.
ALTER TABLE users ADD CONSTRAINT registered_users_have_credentials
  CHECK (is_guest = true OR (email IS NOT NULL AND password_hash IS NOT NULL));
