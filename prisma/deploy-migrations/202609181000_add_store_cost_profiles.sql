CREATE TABLE `StoreCost` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `storeRent` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `employeeWages` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `dormitoryRent` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `propertyFee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `utilitiesFee` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `otherCost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `ratioCoefficient` DECIMAL(10, 4) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `StoreCost_storeId_key` (`storeId`),
  CONSTRAINT `StoreCost_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StoreCost_nonnegative_check` CHECK (
    `storeRent` >= 0 AND
    `employeeWages` >= 0 AND
    `dormitoryRent` >= 0 AND
    `propertyFee` >= 0 AND
    `utilitiesFee` >= 0 AND
    `otherCost` >= 0 AND
    `ratioCoefficient` >= 0
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
