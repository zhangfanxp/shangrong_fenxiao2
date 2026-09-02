-- 门店信用得分：补齐评分发生时的负责人用户 ID 快照。
-- 这是不可重复执行的增量脚本；上线前请先备份并核对目标数据库。
ALTER TABLE `Store`
  ADD COLUMN `managerUserId` VARCHAR(191) NULL AFTER `formalOpenDate`;

ALTER TABLE `LeadH5Review`
  ADD COLUMN `brandCodeSnapshot` VARCHAR(50) NULL AFTER `brandId`,
  ADD COLUMN `responsiblePersonUserId` VARCHAR(191) NULL AFTER `brandNameSnapshot`;

UPDATE `LeadH5Review` AS review_record
INNER JOIN `Brand` AS brand ON brand.`id` = review_record.`brandId`
SET review_record.`brandCodeSnapshot` = brand.`code`
WHERE review_record.`brandCodeSnapshot` IS NULL;
