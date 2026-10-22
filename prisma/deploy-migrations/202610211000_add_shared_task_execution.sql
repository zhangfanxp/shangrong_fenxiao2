ALTER TABLE `Task`
  ADD COLUMN `singleRecordForMultipleExecutors` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `TaskRecord`
  ADD COLUMN `sharedExecution` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `sharedRecordKey` VARCHAR(64) NULL,
  ADD COLUMN `editOwnerUserId` VARCHAR(191) NULL,
  ADD COLUMN `editOwnerNameSnapshot` VARCHAR(50) NULL,
  ADD UNIQUE INDEX `TaskRecord_sharedRecordKey_key` (`sharedRecordKey`);

CREATE TABLE `TaskRecordSharedExecutor` (
  `taskRecordId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`taskRecordId`, `userId`),
  INDEX `TaskRecordSharedExecutor_userId_idx` (`userId`),
  CONSTRAINT `TaskRecordSharedExecutor_taskRecordId_fkey`
    FOREIGN KEY (`taskRecordId`) REFERENCES `TaskRecord` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
