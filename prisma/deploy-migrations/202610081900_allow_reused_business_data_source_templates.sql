ALTER TABLE `BusinessDataSource`
  DROP INDEX `BusinessDataSource_sourceType_templateId_key`,
  ADD INDEX `BusinessDataSource_sourceType_templateId_idx` (`sourceType`, `templateId`);
