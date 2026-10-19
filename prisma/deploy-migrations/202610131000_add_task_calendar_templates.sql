ALTER TABLE `Task`
  MODIFY COLUMN `type` ENUM('DAILY','WEEKLY','MONTHLY','TEMPORARY','CALENDAR') NOT NULL,
  ADD COLUMN `calendarTemplateId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Task_calendarTemplateId_key` (`calendarTemplateId`);

CREATE TABLE `TaskCalendarTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `remark` VARCHAR(300) NULL,
  `status` ENUM('ENABLED','DISABLED') NOT NULL DEFAULT 'ENABLED',
  `createdByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `TaskCalendarTemplate_name_idx` (`name`),
  INDEX `TaskCalendarTemplate_status_idx` (`status`),
  INDEX `TaskCalendarTemplate_createdAt_idx` (`createdAt`),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TaskCalendarTemplate_recordNo_key` (`recordNo`),
  CONSTRAINT `TaskCalendarTemplate_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TaskCalendarDate` (
  `id` VARCHAR(191) NOT NULL,
  `templateId` VARCHAR(191) NOT NULL,
  `calendarDate` DATE NOT NULL,
  `hasTask` BOOLEAN NOT NULL DEFAULT FALSE,
  `content` TEXT NULL,
  `remark` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TaskCalendarDate_templateId_calendarDate_key` (`templateId`, `calendarDate`),
  INDEX `TaskCalendarDate_calendarDate_idx` (`calendarDate`),
  CONSTRAINT `TaskCalendarDate_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `TaskCalendarTemplate` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Task`
  ADD CONSTRAINT `Task_calendarTemplateId_fkey` FOREIGN KEY (`calendarTemplateId`) REFERENCES `TaskCalendarTemplate` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
