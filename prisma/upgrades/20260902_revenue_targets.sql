ALTER TABLE `StoreMonthlyTarget`
  ADD COLUMN `recordNo` VARCHAR(12) NULL,
  ADD COLUMN `storeNameSnapshot` VARCHAR(100) NULL,
  ADD COLUMN `brandId` VARCHAR(191) NULL,
  ADD COLUMN `brandCode` VARCHAR(50) NULL,
  ADD COLUMN `brandNameSnapshot` VARCHAR(100) NULL,
  ADD COLUMN `regionNameSnapshot` VARCHAR(100) NULL,
  ADD COLUMN `previousActualMonth` VARCHAR(7) NULL,
  ADD COLUMN `previousActualRevenueSnapshot` DECIMAL(18, 2) NULL,
  ADD COLUMN `dailyTargetStatus` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `remark` VARCHAR(200) NULL,
  ADD COLUMN `sourceType` VARCHAR(30) NULL,
  ADD COLUMN `createdByUsername` VARCHAR(50) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL;

UPDATE `StoreMonthlyTarget` target
JOIN `ActualRevenueMonthly` actual ON actual.`id` = target.`sourceActualRevenueId`
JOIN `Store` store_row ON store_row.`id` = target.`storeId`
JOIN `Brand` brand ON brand.`id` = store_row.`brandId`
LEFT JOIN `User` creator ON creator.`id` = target.`createdByUserId`
SET
  target.`storeNameSnapshot` = actual.`storeNameSnapshot`,
  target.`brandId` = actual.`brandId`,
  target.`brandCode` = brand.`code`,
  target.`brandNameSnapshot` = actual.`brandNameSnapshot`,
  target.`regionNameSnapshot` = actual.`regionNameSnapshot`,
  target.`previousActualMonth` = actual.`statMonth`,
  target.`previousActualRevenueSnapshot` = actual.`monthlyRevenue`,
  target.`dailyTargetStatus` = IF(actual.`dailyTargetStatus` = 'GENERATED', 'GENERATED', 'PENDING'),
  target.`sourceType` = 'ACTUAL_REVENUE',
  target.`createdByUsername` = COALESCE(creator.`username`, 'system'),
  target.`updatedAt` = target.`createdAt`;

UPDATE `StoreMonthlyTarget` target
JOIN (
  SELECT numbered.`id`, CONCAT(numbered.`dateKey`, LPAD(numbered.`sequenceValue`, 4, '0')) AS `recordNo`
  FROM (
    SELECT `id`, DATE_FORMAT(`createdAt`, '%Y%m%d') AS `dateKey`, ROW_NUMBER() OVER (PARTITION BY DATE(`createdAt`) ORDER BY `createdAt`, `id`) AS `sequenceValue`
    FROM `StoreMonthlyTarget`
  ) numbered
) generated_rows ON generated_rows.`id` = target.`id`
SET target.`recordNo` = generated_rows.`recordNo`;

ALTER TABLE `StoreMonthlyTarget`
  MODIFY COLUMN `recordNo` VARCHAR(12) NOT NULL,
  MODIFY COLUMN `storeNameSnapshot` VARCHAR(100) NOT NULL,
  MODIFY COLUMN `brandId` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `brandCode` VARCHAR(50) NOT NULL,
  MODIFY COLUMN `brandNameSnapshot` VARCHAR(100) NOT NULL,
  MODIFY COLUMN `previousActualMonth` VARCHAR(7) NOT NULL,
  MODIFY COLUMN `previousActualRevenueSnapshot` DECIMAL(18, 2) NOT NULL,
  MODIFY COLUMN `sourceType` VARCHAR(30) NOT NULL,
  MODIFY COLUMN `createdByUsername` VARCHAR(50) NOT NULL,
  MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL,
  ADD UNIQUE INDEX `StoreMonthlyTarget_recordNo_key` (`recordNo`),
  DROP INDEX `StoreMonthlyTarget_targetMonth_idx`,
  ADD INDEX `StoreMonthlyTarget_targetMonth_storeNameSnapshot_idx` (`targetMonth`, `storeNameSnapshot`),
  ADD INDEX `StoreMonthlyTarget_brandId_targetMonth_idx` (`brandId`, `targetMonth`);

CREATE TABLE `StoreMonthlyTargetSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `StoreMonthlyTargetSequence` (`dateKey`, `nextValue`, `updatedAt`)
SELECT SUBSTRING(`recordNo`, 1, 8), MAX(CAST(SUBSTRING(`recordNo`, 9, 4) AS UNSIGNED)) + 1, CURRENT_TIMESTAMP(3)
FROM `StoreMonthlyTarget`
GROUP BY SUBSTRING(`recordNo`, 1, 8);
