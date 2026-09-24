CREATE TABLE `MonthlyPurchaseSalesSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MonthlyPurchaseSalesImportBatch` (
  `id` VARCHAR(191) NOT NULL,
  `batchNo` VARCHAR(24) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `year` SMALLINT NOT NULL,
  `month` TINYINT NOT NULL,
  `periodStart` DATE NOT NULL,
  `periodEnd` DATE NOT NULL,
  `totalCount` INTEGER NOT NULL,
  `insertedCount` INTEGER NOT NULL DEFAULT 0,
  `updatedCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `operatorUserId` VARCHAR(191) NULL,
  `operatorNameSnapshot` VARCHAR(50) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MonthlyPurchaseSalesImportBatch_batchNo_key` (`batchNo`),
  INDEX `MonthlyPurchaseSalesImportBatch_year_month_createdAt_idx` (`year`, `month`, `createdAt`),
  INDEX `MonthlyPurchaseSalesImportBatch_operatorUserId_createdAt_idx` (`operatorUserId`, `createdAt`),
  CONSTRAINT `MonthlyPurchaseSalesImportBatch_operatorUserId_fkey` FOREIGN KEY (`operatorUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MonthlyPurchaseSalesRatio` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `storeNameSnapshot` VARCHAR(100) NOT NULL,
  `aliasId` VARCHAR(191) NOT NULL,
  `meituanAliasSnapshot` VARCHAR(50) NOT NULL,
  `brandCode` VARCHAR(50) NOT NULL,
  `brandNameSnapshot` VARCHAR(100) NOT NULL,
  `year` SMALLINT NOT NULL,
  `month` TINYINT NOT NULL,
  `preDiscountSales` DECIMAL(18,2) NOT NULL,
  `postDiscountSales` DECIMAL(18,2) NULL,
  `purchaseAmount` DECIMAL(18,2) NOT NULL,
  `preDiscountPurchaseSalesRatio` DECIMAL(10,4) NOT NULL,
  `postDiscountPurchaseSalesRatio` DECIMAL(10,4) NULL,
  `remark` VARCHAR(200) NULL,
  `sourceType` ENUM('MANUAL', 'IMPORT') NOT NULL,
  `lastImportBatchId` VARCHAR(191) NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByUsername` VARCHAR(50) NOT NULL,
  `createdByNameSnapshot` VARCHAR(50) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `updatedByNameSnapshot` VARCHAR(50) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MonthlyPurchaseSalesRatio_recordNo_key` (`recordNo`),
  UNIQUE INDEX `MonthlyPurchaseSalesRatio_storeId_year_month_key` (`storeId`, `year`, `month`),
  INDEX `MonthlyPurchaseSalesRatio_year_month_storeNameSnapshot_idx` (`year`, `month`, `storeNameSnapshot`),
  INDEX `MonthlyPurchaseSalesRatio_brandCode_year_month_idx` (`brandCode`, `year`, `month`),
  INDEX `MonthlyPurchaseSalesRatio_lastImportBatchId_idx` (`lastImportBatchId`),
  CONSTRAINT `MonthlyPurchaseSalesRatio_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `MonthlyPurchaseSalesRatio_lastImportBatchId_fkey` FOREIGN KEY (`lastImportBatchId`) REFERENCES `MonthlyPurchaseSalesImportBatch` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `MonthlyPurchaseSalesRatio_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `MonthlyPurchaseSalesRatio_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MonthlyPurchaseSalesImportFailure` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `excelRowNo` INTEGER NOT NULL,
  `storeAlias` VARCHAR(100) NULL,
  `failureReason` VARCHAR(255) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `MonthlyPurchaseSalesImportFailure_batchId_excelRowNo_idx` (`batchId`, `excelRowNo`),
  CONSTRAINT `MonthlyPurchaseSalesImportFailure_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `MonthlyPurchaseSalesImportBatch` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
