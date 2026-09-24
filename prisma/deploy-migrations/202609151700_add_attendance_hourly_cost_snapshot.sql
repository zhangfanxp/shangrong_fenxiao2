ALTER TABLE `DailyAttendanceItem`
  ADD COLUMN `hourlyLaborCostSnapshot` DECIMAL(18, 2) NULL AFTER `laborCostSnapshot`;

UPDATE `DailyAttendanceItem` AS attendance_item
INNER JOIN `DailyAttendanceRecord` AS attendance_record
  ON attendance_record.`id` = attendance_item.`attendanceId`
INNER JOIN `Store` AS store_record
  ON store_record.`id` = attendance_record.`storeId`
SET attendance_item.`hourlyLaborCostSnapshot` = ROUND(
  attendance_item.`laborCostSnapshot` / store_record.`workdayHours`,
  2
)
WHERE attendance_item.`hourlyLaborCostSnapshot` IS NULL
  AND attendance_item.`laborCostSnapshot` IS NOT NULL
  AND store_record.`workdayHours` IS NOT NULL
  AND store_record.`workdayHours` > 0;
