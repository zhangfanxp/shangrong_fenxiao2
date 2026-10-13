CREATE TABLE `StoreLaborStandardPolicyVersion` (
  `id` VARCHAR(191) NOT NULL,
  `brandValue` VARCHAR(100) NOT NULL,
  `version` INTEGER NOT NULL,
  `assessmentMetric` ENUM('RECEIVED_AMOUNT', 'ACTUAL_SALES_AMOUNT') NULL,
  `rules` JSON NOT NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByUsername` VARCHAR(50) NOT NULL,
  `createdByNameSnapshot` VARCHAR(50) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `StoreLaborStandardPolicyVersion_brandValue_version_key` (`brandValue`, `version`),
  INDEX `StoreLaborStandardPolicyVersion_brandValue_createdAt_idx` (`brandValue`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StoreLaborRecord` (
  `id` VARCHAR(191) NOT NULL,
  `businessDate` DATE NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `storeNameSnapshot` VARCHAR(100) NOT NULL,
  `brandIdSnapshot` VARCHAR(191) NOT NULL,
  `brandNameSnapshot` VARCHAR(100) NOT NULL,
  `attendanceRecordId` VARCHAR(191) NULL,
  `salesSubmissionId` VARCHAR(191) NULL,
  `policyVersionId` VARCHAR(191) NULL,
  `assessmentMetricSnapshot` ENUM('RECEIVED_AMOUNT', 'ACTUAL_SALES_AMOUNT') NULL,
  `actualSalesAmount` DECIMAL(18, 2) NULL,
  `receivedAmount` DECIMAL(18, 2) NULL,
  `assessedAmount` DECIMAL(18, 2) NULL,
  `actualHeadcount` SMALLINT UNSIGNED NULL,
  `standardRecordIdSnapshot` VARCHAR(191) NULL,
  `lowerAmountSnapshot` DECIMAL(18, 2) NULL,
  `upperAmountSnapshot` DECIMAL(18, 2) NULL,
  `standardHeadcountSnapshot` SMALLINT UNSIGNED NULL,
  `laborStatus` ENUM('NORMAL', 'OVERSTAFFED', 'UNDERSTAFFED', 'UNABLE_TO_CALCULATE') NOT NULL DEFAULT 'UNABLE_TO_CALCULATE',
  `unavailableReason` VARCHAR(200) NULL,
  `calculatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `StoreLaborRecord_attendanceRecordId_key` (`attendanceRecordId`),
  UNIQUE INDEX `StoreLaborRecord_salesSubmissionId_key` (`salesSubmissionId`),
  UNIQUE INDEX `StoreLaborRecord_storeId_businessDate_key` (`storeId`, `businessDate`),
  INDEX `StoreLaborRecord_businessDate_storeNameSnapshot_idx` (`businessDate`, `storeNameSnapshot`),
  INDEX `StoreLaborRecord_brandIdSnapshot_businessDate_idx` (`brandIdSnapshot`, `businessDate`),
  INDEX `StoreLaborRecord_laborStatus_businessDate_idx` (`laborStatus`, `businessDate`),
  INDEX `StoreLaborRecord_policyVersionId_idx` (`policyVersionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StoreLaborRecord`
  ADD CONSTRAINT `StoreLaborRecord_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `StoreLaborRecord_attendanceRecordId_fkey` FOREIGN KEY (`attendanceRecordId`) REFERENCES `DailyAttendanceRecord` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `StoreLaborRecord_salesSubmissionId_fkey` FOREIGN KEY (`salesSubmissionId`) REFERENCES `TaskSubmission` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `StoreLaborRecord_policyVersionId_fkey` FOREIGN KEY (`policyVersionId`) REFERENCES `StoreLaborStandardPolicyVersion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
