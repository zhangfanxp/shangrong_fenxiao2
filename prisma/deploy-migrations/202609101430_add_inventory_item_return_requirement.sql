ALTER TABLE `InventoryItem`
  ADD COLUMN `requiresReturnOnResignation` BOOLEAN NOT NULL DEFAULT false AFTER `status`;
