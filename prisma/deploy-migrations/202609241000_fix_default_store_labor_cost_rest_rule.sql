-- Correct only untouched system-initialized policy rows. Manually configured
-- weekly-rest policies must remain unchanged.
UPDATE `LaborCostPolicyVersion`
SET
  `storeMonthlyRestRule` = 'FIXED_DAYS',
  `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `storeMonthlyRestRule` = 'SUNDAY'
  AND `storeFixedRestDays` = 2
  AND `storeLegalHolidayRule` = 'ANY_HOLIDAY_ONE_DAY'
  AND `createdByUsername` = '系统初始化'
  AND `updatedByUsername` = '系统初始化';
