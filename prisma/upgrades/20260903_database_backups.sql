-- 数据库全量备份设置与R2文件记录。
-- 这是不可重复执行的增量脚本；上线前请先在目标库核对不存在同名表。

CREATE TABLE `DatabaseBackupSetting` (
    `id` VARCHAR(32) NOT NULL,
    `r2StorageId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `frequency` VARCHAR(10) NOT NULL DEFAULT 'DAILY',
    `weekdays` JSON NULL,
    `executionTimes` JSON NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,
    `updatedByName` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DatabaseBackupSetting_r2StorageId_idx`(`r2StorageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DatabaseBackupFile` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `r2StorageId` VARCHAR(191) NOT NULL,
    `r2StorageNameSnapshot` VARCHAR(50) NOT NULL,
    `bucketNameSnapshot` VARCHAR(63) NOT NULL,
    `objectKey` VARCHAR(500) NOT NULL,
    `backupType` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `sizeBytes` BIGINT NOT NULL DEFAULT 0,
    `checksumSha256` VARCHAR(64) NULL,
    `durationSeconds` INTEGER NULL,
    `scheduleKey` VARCHAR(20) NULL,
    `activeLockKey` VARCHAR(32) NULL,
    `errorMessage` TEXT NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `createdByName` VARCHAR(50) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DatabaseBackupFile_fileName_key`(`fileName`),
    UNIQUE INDEX `DatabaseBackupFile_objectKey_key`(`objectKey`),
    UNIQUE INDEX `DatabaseBackupFile_scheduleKey_key`(`scheduleKey`),
    UNIQUE INDEX `DatabaseBackupFile_activeLockKey_key`(`activeLockKey`),
    INDEX `DatabaseBackupFile_status_startedAt_idx`(`status`, `startedAt`),
    INDEX `DatabaseBackupFile_r2StorageId_idx`(`r2StorageId`),
    INDEX `DatabaseBackupFile_backupType_startedAt_idx`(`backupType`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
