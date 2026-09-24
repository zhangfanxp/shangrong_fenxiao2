ALTER TABLE `DailyAttendanceRecord`
  ADD COLUMN `cooperationTypeSnapshot` VARCHAR(30) NULL AFTER `brandNameSnapshot`;

UPDATE `DailyAttendanceRecord` AS attendance
INNER JOIN `Store` AS store_record ON store_record.`id` = attendance.`storeId`
SET attendance.`cooperationTypeSnapshot` = store_record.`cooperationType`
WHERE attendance.`cooperationTypeSnapshot` IS NULL;

ALTER TABLE `DailyAttendanceRecord`
  MODIFY COLUMN `cooperationTypeSnapshot` VARCHAR(30) NOT NULL;

ALTER TABLE `DailyAttendanceItem`
  ADD COLUMN `laborCostSnapshot` DECIMAL(18, 2) NULL AFTER `overtimeHours`,
  ADD COLUMN `laborCostUnitSnapshot` VARCHAR(20) NULL AFTER `laborCostSnapshot`;
