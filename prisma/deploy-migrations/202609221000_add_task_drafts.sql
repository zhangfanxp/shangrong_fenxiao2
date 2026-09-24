ALTER TABLE `TaskRecord`
  ADD COLUMN `draftValues` JSON NULL AFTER `submission`,
  ADD COLUMN `draftCaptureFallbacks` JSON NULL AFTER `draftValues`,
  ADD COLUMN `draftSavedAt` DATETIME(3) NULL AFTER `draftCaptureFallbacks`;
