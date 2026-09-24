UPDATE `Store` AS store_record
INNER JOIN `Brand` AS brand_record ON brand_record.`id` = store_record.`brandId`
SET store_record.`workdayHours` = CASE brand_record.`name`
  WHEN '奋小二' THEN 10.00
  WHEN '蚝家伙' THEN 9.00
  WHEN '禾穆婆' THEN 10.00
  ELSE store_record.`workdayHours`
END
WHERE store_record.`workdayHours` IS NULL
  AND brand_record.`name` IN ('奋小二', '蚝家伙', '禾穆婆');
