ALTER TABLE `Store`
  ADD COLUMN `douyinLaikeName` VARCHAR(50) NULL AFTER `chefName`,
  ADD COLUMN `kuaishouName` VARCHAR(50) NULL AFTER `douyinLaikeName`,
  ADD COLUMN `meituanManagerName` VARCHAR(50) NULL AFTER `kuaishouName`,
  ADD COLUMN `meituanBusinessName` VARCHAR(50) NULL AFTER `meituanManagerName`;
