CREATE TABLE `InventoryItemSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InventoryTransactionSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InventoryItem` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `duplicateKey` VARCHAR(64) NOT NULL,
  `itemName` VARCHAR(30) NOT NULL,
  `itemTypeCode` VARCHAR(100) NOT NULL,
  `itemTypeNameSnapshot` VARCHAR(100) NOT NULL,
  `specification` VARCHAR(50) NULL,
  `unit` VARCHAR(5) NOT NULL,
  `manageStock` ENUM('MANAGED', 'UNMANAGED') NOT NULL,
  `stockQuantity` BIGINT UNSIGNED NULL,
  `status` ENUM('ENABLED', 'DISABLED') NOT NULL DEFAULT 'ENABLED',
  `remark` VARCHAR(200) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByName` VARCHAR(50) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `InventoryItem_recordNo_key` (`recordNo`),
  UNIQUE INDEX `InventoryItem_duplicateKey_key` (`duplicateKey`),
  INDEX `InventoryItem_itemName_idx` (`itemName`),
  INDEX `InventoryItem_itemTypeCode_idx` (`itemTypeCode`),
  INDEX `InventoryItem_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `InventoryItem_createdByUserId_idx` (`createdByUserId`),
  INDEX `InventoryItem_updatedByUserId_idx` (`updatedByUserId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `InventoryItem_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `InventoryItem_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `InventoryItem_stock_mode_check` CHECK ((`manageStock` = 'MANAGED' AND `stockQuantity` IS NOT NULL) OR (`manageStock` = 'UNMANAGED' AND `stockQuantity` IS NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InventoryTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `transactionNo` VARCHAR(12) NOT NULL,
  `itemId` VARCHAR(191) NOT NULL,
  `itemRecordNoSnapshot` VARCHAR(12) NOT NULL,
  `itemNameSnapshot` VARCHAR(30) NOT NULL,
  `itemTypeCodeSnapshot` VARCHAR(100) NOT NULL,
  `itemTypeNameSnapshot` VARCHAR(100) NOT NULL,
  `specificationSnapshot` VARCHAR(50) NULL,
  `unitSnapshot` VARCHAR(5) NOT NULL,
  `businessType` ENUM('INITIAL_STOCK', 'PURCHASE_INBOUND', 'EMPLOYEE_REQUISITION', 'REQUISITION_RETURN', 'MANUAL_ADJUSTMENT') NOT NULL,
  `direction` ENUM('IN', 'OUT') NOT NULL,
  `quantity` BIGINT UNSIGNED NOT NULL,
  `stockBefore` BIGINT UNSIGNED NOT NULL,
  `stockAfter` BIGINT UNSIGNED NOT NULL,
  `relatedBusinessId` VARCHAR(191) NULL,
  `operatorUserId` VARCHAR(191) NULL,
  `operatorNameSnapshot` VARCHAR(50) NOT NULL,
  `operatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `InventoryTransaction_transactionNo_key` (`transactionNo`),
  INDEX `InventoryTransaction_itemId_operatedAt_idx` (`itemId`, `operatedAt`),
  INDEX `InventoryTransaction_businessType_operatedAt_idx` (`businessType`, `operatedAt`),
  INDEX `InventoryTransaction_direction_operatedAt_idx` (`direction`, `operatedAt`),
  INDEX `InventoryTransaction_operatorUserId_idx` (`operatorUserId`),
  INDEX `InventoryTransaction_relatedBusinessId_idx` (`relatedBusinessId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `InventoryTransaction_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `InventoryItem` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `InventoryTransaction_operatorUserId_fkey` FOREIGN KEY (`operatorUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `InventoryTransaction_quantity_check` CHECK (`quantity` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `DataDictionary` (`id`, `recordNo`, `name`, `code`, `fileName`, `remark`, `status`, `version`, `createdAt`, `updatedAt`)
VALUES ('system-item-requisition-type', '202609090001', '物品领用类型', 'item_requisition_type', 'item_requisition_type.json', '工装库存和领用管理使用的物品类型', 'ENABLED', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `fileName` = VALUES(`fileName`),
  `status` = 'ENABLED',
  `updatedAt` = CURRENT_TIMESTAMP(3);
