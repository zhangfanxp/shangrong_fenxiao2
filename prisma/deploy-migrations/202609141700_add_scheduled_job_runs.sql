CREATE TABLE `ScheduledJobRun` (
  `id` VARCHAR(191) NOT NULL,
  `jobType` VARCHAR(50) NOT NULL,
  `executionDate` DATE NOT NULL,
  `scheduledTime` VARCHAR(5) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `result` JSON NULL,
  `error` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ScheduledJobRun_jobType_executionDate_key`(`jobType`, `executionDate`),
  INDEX `ScheduledJobRun_status_startedAt_idx`(`status`, `startedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
