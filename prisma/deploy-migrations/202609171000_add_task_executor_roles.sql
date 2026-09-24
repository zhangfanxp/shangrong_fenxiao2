CREATE TABLE `TaskExecutorRole` (
  `taskId` VARCHAR(191) NOT NULL,
  `roleId` VARCHAR(191) NOT NULL,
  INDEX `TaskExecutorRole_roleId_idx` (`roleId`),
  PRIMARY KEY (`taskId`, `roleId`),
  CONSTRAINT `TaskExecutorRole_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `TaskExecutorRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `TaskExecutorRole` (`taskId`, `roleId`)
SELECT `id`, `executorRoleId`
FROM `Task`
WHERE `executorRoleId` IS NOT NULL;
