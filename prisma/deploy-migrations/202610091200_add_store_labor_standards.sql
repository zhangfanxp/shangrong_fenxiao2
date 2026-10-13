CREATE TABLE `StoreLaborStandard` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `brandValue` VARCHAR(100) NOT NULL,
  `assessmentMetric` ENUM('RECEIVED_AMOUNT', 'ACTUAL_SALES_AMOUNT') NOT NULL,
  `lowerAmount` DECIMAL(18, 2) NULL,
  `upperAmount` DECIMAL(18, 2) NULL,
  `standardHeadcount` SMALLINT UNSIGNED NOT NULL,
  `remark` VARCHAR(100) NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByUsername` VARCHAR(50) NOT NULL,
  `createdByNameSnapshot` VARCHAR(50) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `updatedByNameSnapshot` VARCHAR(50) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `StoreLaborStandard_recordNo_key`(`recordNo`),
  INDEX `StoreLaborStandard_brandValue_lowerAmount_idx`(`brandValue`, `lowerAmount`),
  INDEX `StoreLaborStandard_brandValue_upperAmount_idx`(`brandValue`, `upperAmount`),
  INDEX `StoreLaborStandard_createdByUserId_createdAt_idx`(`createdByUserId`, `createdAt`),
  INDEX `StoreLaborStandard_updatedByUserId_updatedAt_idx`(`updatedByUserId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StoreLaborStandardSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StoreLaborStandardBrandLock` (
  `brandValue` VARCHAR(100) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`brandValue`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StoreLaborStandard`
  ADD CONSTRAINT `StoreLaborStandard_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `StoreLaborStandard_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
