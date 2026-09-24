CREATE TABLE `ProductCategorySalesSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductCategorySalesImportBatch` (
  `id` VARCHAR(191) NOT NULL,
  `batchNo` VARCHAR(24) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `periodStart` DATE NOT NULL,
  `periodEnd` DATE NOT NULL,
  `year` SMALLINT NOT NULL,
  `month` TINYINT NOT NULL,
  `rawRowCount` INTEGER NOT NULL,
  `storeCount` INTEGER NOT NULL,
  `insertedCount` INTEGER NOT NULL DEFAULT 0,
  `updatedCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `operatorUserId` VARCHAR(191) NULL,
  `operatorNameSnapshot` VARCHAR(50) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ProductCategorySalesImportBatch_batchNo_key` (`batchNo`),
  INDEX `ProductCategorySalesImportBatch_year_month_createdAt_idx` (`year`, `month`, `createdAt`),
  INDEX `ProductCategorySalesImportBatch_operatorUserId_createdAt_idx` (`operatorUserId`, `createdAt`),
  CONSTRAINT `ProductCategorySalesImportBatch_operatorUserId_fkey` FOREIGN KEY (`operatorUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductCategorySalesMonthly` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `year` SMALLINT NOT NULL,
  `month` TINYINT NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `storeNameSnapshot` VARCHAR(100) NOT NULL,
  `aliasId` VARCHAR(191) NOT NULL,
  `meituanAliasSnapshot` VARCHAR(100) NOT NULL,
  `brandCode` VARCHAR(50) NOT NULL,
  `brandNameSnapshot` VARCHAR(100) NOT NULL,
  `citySnapshot` VARCHAR(100) NOT NULL,
  `totalSalesQuantity` DECIMAL(18,2) NOT NULL,
  `totalSalesAmount` DECIMAL(18,2) NOT NULL,
  `lastImportBatchId` VARCHAR(191) NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByUsername` VARCHAR(50) NOT NULL,
  `createdByNameSnapshot` VARCHAR(50) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `updatedByNameSnapshot` VARCHAR(50) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ProductCategorySalesMonthly_recordNo_key` (`recordNo`),
  UNIQUE INDEX `ProductCategorySalesMonthly_storeId_year_month_key` (`storeId`, `year`, `month`),
  INDEX `ProductCategorySalesMonthly_year_month_storeNameSnapshot_idx` (`year`, `month`, `storeNameSnapshot`),
  INDEX `ProductCategorySalesMonthly_brandCode_year_month_idx` (`brandCode`, `year`, `month`),
  INDEX `ProductCategorySalesMonthly_lastImportBatchId_idx` (`lastImportBatchId`),
  CONSTRAINT `ProductCategorySalesMonthly_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ProductCategorySalesMonthly_lastImportBatchId_fkey` FOREIGN KEY (`lastImportBatchId`) REFERENCES `ProductCategorySalesImportBatch` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ProductCategorySalesMonthly_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ProductCategorySalesMonthly_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductCategorySalesDetail` (
  `id` VARCHAR(191) NOT NULL,
  `monthlyRecordId` VARCHAR(191) NOT NULL,
  `categoryName` VARCHAR(100) NOT NULL,
  `salesQuantity` DECIMAL(18,2) NOT NULL,
  `salesQuantityRatio` DECIMAL(10,4) NULL,
  `salesAmount` DECIMAL(18,2) NOT NULL,
  `salesAmountRatio` DECIMAL(10,4) NULL,
  `dishIncome` DECIMAL(18,2) NOT NULL,
  `dishIncomeRatio` DECIMAL(10,4) NULL,
  `dishDiscount` DECIMAL(18,2) NOT NULL,
  `dishDiscountRatio` DECIMAL(10,4) NULL,
  `sortOrder` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ProductCategorySalesDetail_monthlyRecordId_categoryName_key` (`monthlyRecordId`, `categoryName`),
  INDEX `ProductCategorySalesDetail_monthlyRecordId_sortOrder_idx` (`monthlyRecordId`, `sortOrder`),
  CONSTRAINT `ProductCategorySalesDetail_monthlyRecordId_fkey` FOREIGN KEY (`monthlyRecordId`) REFERENCES `ProductCategorySalesMonthly` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductCategorySalesImportFailure` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `storeAlias` VARCHAR(100) NULL,
  `failureReason` VARCHAR(255) NOT NULL,
  `excelRows` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ProductCategorySalesImportFailure_batchId_createdAt_idx` (`batchId`, `createdAt`),
  CONSTRAINT `ProductCategorySalesImportFailure_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `ProductCategorySalesImportBatch` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
