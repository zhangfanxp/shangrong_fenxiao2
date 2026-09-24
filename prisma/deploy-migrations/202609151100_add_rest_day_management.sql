CREATE TABLE `RestDaySequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RestDayYearLock` (
  `year` SMALLINT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RestDay` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `year` SMALLINT NOT NULL,
  `holidayType` ENUM(
    'NEW_YEAR_DAY',
    'SPRING_FESTIVAL',
    'QINGMING_FESTIVAL',
    'LABOR_DAY',
    'DRAGON_BOAT_FESTIVAL',
    'MID_AUTUMN_FESTIVAL',
    'NATIONAL_DAY',
    'OTHER'
  ) NOT NULL,
  `holidayNameSnapshot` VARCHAR(10) NOT NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `remark` VARCHAR(50) NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByUsername` VARCHAR(50) NOT NULL,
  `createdByNameSnapshot` VARCHAR(50) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `updatedByNameSnapshot` VARCHAR(50) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  CONSTRAINT `RestDay_year_range_check` CHECK (`year` BETWEEN 2026 AND 2096),
  CONSTRAINT `RestDay_date_order_check` CHECK (`startDate` <= `endDate`),
  CONSTRAINT `RestDay_start_year_check` CHECK (YEAR(`startDate`) = `year`),
  CONSTRAINT `RestDay_end_year_check` CHECK (YEAR(`endDate`) = `year`),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RestDay_recordNo_key` (`recordNo`),
  UNIQUE INDEX `RestDay_year_holidayType_startDate_endDate_key` (`year`, `holidayType`, `startDate`, `endDate`),
  INDEX `RestDay_year_startDate_idx` (`year`, `startDate`),
  INDEX `RestDay_startDate_endDate_idx` (`startDate`, `endDate`),
  INDEX `RestDay_createdByUserId_createdAt_idx` (`createdByUserId`, `createdAt`),
  INDEX `RestDay_updatedByUserId_updatedAt_idx` (`updatedByUserId`, `updatedAt`),
  CONSTRAINT `RestDay_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `RestDay_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
