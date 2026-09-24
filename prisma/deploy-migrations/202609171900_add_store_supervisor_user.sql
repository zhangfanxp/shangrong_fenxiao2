ALTER TABLE `Store`
  ADD COLUMN `supervisorUserId` VARCHAR(191) NULL AFTER `region`,
  ADD INDEX `Store_supervisorUserId_idx` (`supervisorUserId`);

UPDATE `Store` AS `storeRow`
SET `supervisorUserId` = (
  SELECT `userRow`.`id`
  FROM `User` AS `userRow`
  INNER JOIN `Role` AS `roleRow` ON `roleRow`.`id` = `userRow`.`roleId`
  WHERE `userRow`.`status` = 'ENABLED'
    AND `roleRow`.`status` = 'ENABLED'
    AND TRIM(`userRow`.`realName`) = TRIM(`storeRow`.`supervisorName`)
    AND (`roleRow`.`name` = '督导' OR `userRow`.`tags` LIKE '%督导%')
  ORDER BY
    CASE WHEN `roleRow`.`name` = '督导' THEN 0 ELSE 1 END,
    `userRow`.`createdAt` ASC,
    `userRow`.`id` ASC
  LIMIT 1
)
WHERE `storeRow`.`supervisorName` IS NOT NULL
  AND TRIM(`storeRow`.`supervisorName`) <> '';
