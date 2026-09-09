ALTER TABLE `TaskSubmissionItem`
  ADD COLUMN `aiAnalysisTypeSnapshot` VARCHAR(200) NULL AFTER `r2StorageId`,
  ADD COLUMN `aiAnalysisPromptSnapshot` TEXT NULL AFTER `aiAnalysisTypeSnapshot`,
  ADD COLUMN `aiAnalysisStatus` VARCHAR(20) NULL AFTER `aiAnalysisPromptSnapshot`,
  ADD COLUMN `aiAnalysisResult` LONGTEXT NULL AFTER `aiAnalysisStatus`,
  ADD COLUMN `aiUnqualifiedReasonDescription` LONGTEXT NULL AFTER `aiAnalysisResult`,
  ADD COLUMN `aiAnalysisFailureReason` TEXT NULL AFTER `aiUnqualifiedReasonDescription`,
  ADD COLUMN `aiAnalyzedAt` DATETIME(3) NULL AFTER `aiAnalysisFailureReason`,
  ADD COLUMN `aiAnalyzedByUserId` VARCHAR(191) NULL AFTER `aiAnalyzedAt`,
  ADD COLUMN `aiAnalyzedByName` VARCHAR(50) NULL AFTER `aiAnalyzedByUserId`,
  ADD INDEX `TaskSubmissionItem_aiAnalysisStatus_aiAnalyzedAt_idx` (`aiAnalysisStatus`, `aiAnalyzedAt`);
