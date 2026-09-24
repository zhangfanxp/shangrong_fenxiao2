ALTER TABLE `TaskRecord`
  ADD COLUMN `targetPersonnelId` VARCHAR(191) NULL,
  ADD COLUMN `targetPersonnelKey` VARCHAR(191) NOT NULL DEFAULT 'STORE',
  ADD COLUMN `targetPersonnelNameSnapshot` VARCHAR(50) NULL,
  ADD COLUMN `targetPersonnelPositionSnapshot` VARCHAR(50) NULL,
  DROP INDEX `TaskRecord_taskId_assignedUserId_storeId_executionDate_key`,
  ADD UNIQUE INDEX `TaskRecord_task_assignee_store_target_date_key` (`taskId`, `assignedUserId`, `storeId`, `targetPersonnelKey`, `executionDate`),
  ADD INDEX `TaskRecord_targetPersonnelId_executionDate_idx` (`targetPersonnelId`, `executionDate`),
  ADD CONSTRAINT `TaskRecord_targetPersonnelId_fkey` FOREIGN KEY (`targetPersonnelId`) REFERENCES `Personnel` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
