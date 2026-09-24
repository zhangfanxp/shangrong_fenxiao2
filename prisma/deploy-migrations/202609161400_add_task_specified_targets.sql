ALTER TABLE `Task`
  ADD COLUMN `specifiedTargets` JSON NULL AFTER `targetType`;
