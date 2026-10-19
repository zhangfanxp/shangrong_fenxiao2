ALTER TABLE `User` ADD COLUMN `isRegionManager` BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE `UserManagedRegion` (
  `userId` VARCHAR(191) NOT NULL,
  `region` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`, `region`),
  UNIQUE KEY `UserManagedRegion_region_key` (`region`),
  CONSTRAINT `UserManagedRegion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
