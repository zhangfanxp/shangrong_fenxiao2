UPDATE `TaskRecord` AS `record`
INNER JOIN `Task` AS `task` ON `task`.`id` = `record`.`taskId`
SET
  `record`.`taskNameSnapshot` = CONCAT(`task`.`title`, '_', `record`.`targetPersonnelNameSnapshot`),
  `record`.`configSnapshot` = CASE
    WHEN `record`.`configSnapshot` IS NOT NULL AND JSON_VALID(`record`.`configSnapshot`)
      THEN JSON_SET(`record`.`configSnapshot`, '$.taskName', CONCAT(`task`.`title`, '_', `record`.`targetPersonnelNameSnapshot`))
    ELSE `record`.`configSnapshot`
  END
WHERE `record`.`targetType` = 'STORE_EMPLOYEE'
  AND `record`.`targetPersonnelNameSnapshot` IS NOT NULL;

UPDATE `TaskSubmission` AS `submission`
INNER JOIN `TaskRecord` AS `record` ON `record`.`id` = `submission`.`taskRecordId`
SET `submission`.`taskNameSnapshot` = `record`.`taskNameSnapshot`
WHERE `record`.`targetType` = 'STORE_EMPLOYEE'
  AND `record`.`targetPersonnelNameSnapshot` IS NOT NULL;
