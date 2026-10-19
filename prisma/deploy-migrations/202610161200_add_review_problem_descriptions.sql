ALTER TABLE `Assessment`
  ADD COLUMN `failRequiresProblemDescription` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `partialRequiresProblemDescription` BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE `LeadH5ReviewItem`
  ADD COLUMN `problemDescription` TEXT NULL;
