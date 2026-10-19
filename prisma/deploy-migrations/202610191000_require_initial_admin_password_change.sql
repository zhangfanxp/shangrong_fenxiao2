-- Mark newly initialized super-admin accounts for a mandatory first-login password change.
ALTER TABLE `User`
  ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false;
