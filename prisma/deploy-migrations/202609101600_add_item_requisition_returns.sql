CREATE TABLE `ItemRequisitionReturn` (
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(36) NOT NULL,
  `requisitionId` VARCHAR(191) NOT NULL,
  `quantity` INTEGER UNSIGNED NOT NULL,
  `operatorUserId` VARCHAR(191) NULL,
  `operatorUsernameSnapshot` VARCHAR(30) NOT NULL,
  `operatorNameSnapshot` VARCHAR(50) NOT NULL,
  `returnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ItemRequisitionReturn_requestId_key` (`requestId`),
  INDEX `ItemRequisitionReturn_requisitionId_returnedAt_idx` (`requisitionId`, `returnedAt`),
  INDEX `ItemRequisitionReturn_operatorUserId_idx` (`operatorUserId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ItemRequisitionReturn_requisitionId_fkey` FOREIGN KEY (`requisitionId`) REFERENCES `ItemRequisition` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ItemRequisitionReturn_operatorUserId_fkey` FOREIGN KEY (`operatorUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ItemRequisitionReturn_quantity_check` CHECK (`quantity` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
