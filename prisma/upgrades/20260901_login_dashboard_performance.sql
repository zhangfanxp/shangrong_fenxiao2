-- Apply once to an existing database before deploying the matching application version.
-- These indexes accelerate the authenticated dashboard queries executed immediately after login.
CREATE INDEX `User_lastLoginAt_idx` ON `User`(`lastLoginAt`);
CREATE INDEX `Contract_status_endDate_idx` ON `Contract`(`status`, `endDate`);
CREATE INDEX `TaskRecord_status_taskId_idx` ON `TaskRecord`(`status`, `taskId`);
