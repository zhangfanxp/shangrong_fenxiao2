ALTER TABLE `DailyAttendanceRecord`
  ADD COLUMN `partTimeLaborCostSnapshot` DECIMAL(12, 2) NULL AFTER `partTimeHours`,
  ADD COLUMN `partTimeActualLaborCost` DECIMAL(18, 2) NULL AFTER `partTimeLaborCostSnapshot`;
