CREATE TABLE `LaborCostPolicyVersion` (
  `effectiveMonth` CHAR(7) NOT NULL,
  `headquartersMonthlyRestRule` VARCHAR(30) NOT NULL,
  `headquartersFixedRestDays` TINYINT NOT NULL DEFAULT 2,
  `headquartersLegalHolidayRule` VARCHAR(30) NOT NULL,
  `storeMonthlyRestRule` VARCHAR(30) NOT NULL,
  `storeFixedRestDays` TINYINT NOT NULL DEFAULT 2,
  `storeLegalHolidayRule` VARCHAR(30) NOT NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByUsername` VARCHAR(50) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `updatedByUsername` VARCHAR(50) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `LaborCostPolicyVersion_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`effectiveMonth`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `LaborCostPolicyVersion` (
  `effectiveMonth`,
  `headquartersMonthlyRestRule`,
  `headquartersFixedRestDays`,
  `headquartersLegalHolidayRule`,
  `storeMonthlyRestRule`,
  `storeFixedRestDays`,
  `storeLegalHolidayRule`,
  `createdByUsername`,
  `updatedByUsername`
) VALUES (
  DATE_FORMAT(DATE_ADD(CURRENT_DATE(), INTERVAL 1 MONTH), '%Y-%m'),
  'SUNDAY',
  2,
  'ACTUAL_DATES',
  'SUNDAY',
  2,
  'ANY_HOLIDAY_ONE_DAY',
  '系统初始化',
  '系统初始化'
);
