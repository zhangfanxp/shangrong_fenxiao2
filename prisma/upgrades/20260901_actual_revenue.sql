CREATE TABLE `ActualRevenueMonthly` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `statMonth` VARCHAR(7) NOT NULL,
  `brandId` VARCHAR(191) NOT NULL,
  `brandNameSnapshot` VARCHAR(100) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `storeNameSnapshot` VARCHAR(100) NOT NULL,
  `regionNameSnapshot` VARCHAR(100) NULL,
  `storeManagerNameSnapshot` VARCHAR(50) NULL,
  `supervisorNameSnapshot` VARCHAR(50) NULL,
  `cooperationTypeSnapshot` VARCHAR(30) NULL,
  `monthlyRevenue` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `dailyTargetStatus` VARCHAR(20) NOT NULL DEFAULT 'NOT_GENERATED',
  `createdByUserId` VARCHAR(191) NULL,
  `createdByName` VARCHAR(50) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ActualRevenueMonthly_recordNo_key` (`recordNo`),
  INDEX `ActualRevenueMonthly_statMonth_storeNameSnapshot_idx` (`statMonth`, `storeNameSnapshot`),
  INDEX `ActualRevenueMonthly_brandId_statMonth_idx` (`brandId`, `statMonth`),
  UNIQUE INDEX `ActualRevenueMonthly_storeId_statMonth_key` (`storeId`, `statMonth`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActualRevenueDaily` (
  `id` VARCHAR(191) NOT NULL,
  `monthlyRecordId` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `businessDate` DATE NOT NULL,
  `revenueAmount` DECIMAL(18, 2) NOT NULL,
  `discountAmount` DECIMAL(18, 2) NULL,
  `operatingIncome` DECIMAL(18, 2) NULL,
  `orderCount` INTEGER NULL,
  `dinerCount` INTEGER NULL,
  `tableCount` INTEGER NULL,
  `preDiscountPerCapita` DECIMAL(18, 2) NULL,
  `postDiscountPerCapita` DECIMAL(18, 2) NULL,
  `preDiscountAvgOrder` DECIMAL(18, 2) NULL,
  `postDiscountAvgOrder` DECIMAL(18, 2) NULL,
  `tableOpenRate` DECIMAL(10, 6) NULL,
  `tableTurnoverRate` DECIMAL(10, 6) NULL,
  `seatOccupancyRate` DECIMAL(10, 6) NULL,
  `avgDiningDurationMinutes` DECIMAL(10, 2) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ActualRevenueDaily_monthlyRecordId_businessDate_idx` (`monthlyRecordId`, `businessDate`),
  UNIQUE INDEX `ActualRevenueDaily_storeId_businessDate_key` (`storeId`, `businessDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActualRevenueSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StoreMonthlyTarget` (
  `id` VARCHAR(191) NOT NULL,
  `sourceActualRevenueId` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `targetMonth` VARCHAR(7) NOT NULL,
  `targetAmount` DECIMAL(18, 2) NOT NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByName` VARCHAR(50) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `StoreMonthlyTarget_sourceActualRevenueId_key` (`sourceActualRevenueId`),
  INDEX `StoreMonthlyTarget_targetMonth_idx` (`targetMonth`),
  UNIQUE INDEX `StoreMonthlyTarget_storeId_targetMonth_key` (`storeId`, `targetMonth`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StoreDailyTarget` (
  `id` VARCHAR(191) NOT NULL,
  `monthlyTargetId` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `targetDate` DATE NOT NULL,
  `targetAmount` DECIMAL(18, 2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `StoreDailyTarget_monthlyTargetId_targetDate_idx` (`monthlyTargetId`, `targetDate`),
  UNIQUE INDEX `StoreDailyTarget_storeId_targetDate_key` (`storeId`, `targetDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActualRevenueMonthly` ADD CONSTRAINT `ActualRevenueMonthly_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ActualRevenueMonthly` ADD CONSTRAINT `ActualRevenueMonthly_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ActualRevenueDaily` ADD CONSTRAINT `ActualRevenueDaily_monthlyRecordId_fkey` FOREIGN KEY (`monthlyRecordId`) REFERENCES `ActualRevenueMonthly` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ActualRevenueDaily` ADD CONSTRAINT `ActualRevenueDaily_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StoreMonthlyTarget` ADD CONSTRAINT `StoreMonthlyTarget_sourceActualRevenueId_fkey` FOREIGN KEY (`sourceActualRevenueId`) REFERENCES `ActualRevenueMonthly` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StoreMonthlyTarget` ADD CONSTRAINT `StoreMonthlyTarget_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StoreMonthlyTarget` ADD CONSTRAINT `StoreMonthlyTarget_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `StoreDailyTarget` ADD CONSTRAINT `StoreDailyTarget_monthlyTargetId_fkey` FOREIGN KEY (`monthlyTargetId`) REFERENCES `StoreMonthlyTarget` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StoreDailyTarget` ADD CONSTRAINT `StoreDailyTarget_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

