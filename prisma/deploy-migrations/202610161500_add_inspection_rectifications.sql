-- AlterTable
ALTER TABLE `Notification` MODIFY `content` LONGTEXT NOT NULL;

-- CreateTable
CREATE TABLE `InspectionRectification` (
    `id` VARCHAR(191) NOT NULL,
    `recordNo` VARCHAR(20) NOT NULL,
    `reviewItemId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    `noActionReason` TEXT NULL,
    `noActionAt` DATETIME(3) NULL,
    `noActionByName` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InspectionRectification_recordNo_key`(`recordNo`),
    UNIQUE INDEX `InspectionRectification_reviewItemId_key`(`reviewItemId`),
    INDEX `InspectionRectification_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InspectionRectificationRound` (
    `id` VARCHAR(191) NOT NULL,
    `rectificationId` VARCHAR(191) NOT NULL,
    `roundNumber` INTEGER NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deadlineHours` INTEGER NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `responsibleUserId` VARCHAR(191) NOT NULL,
    `responsibleName` VARCHAR(100) NOT NULL,
    `requirement` VARCHAR(100) NOT NULL,
    `ccRecipients` JSON NOT NULL,
    `taskRecordId` VARCHAR(191) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `submissionDescription` TEXT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `acceptanceResult` VARCHAR(20) NULL,
    `acceptedByUserId` VARCHAR(191) NULL,
    `acceptedByName` VARCHAR(100) NULL,
    `rejectionReason` TEXT NULL,

    UNIQUE INDEX `InspectionRectificationRound_taskRecordId_key`(`taskRecordId`),
    INDEX `InspectionRectificationRound_responsibleUserId_idx`(`responsibleUserId`),
    INDEX `InspectionRectificationRound_submittedAt_dueAt_idx`(`submittedAt`, `dueAt`),
    UNIQUE INDEX `InspectionRectificationRound_rectificationId_roundNumber_key`(`rectificationId`, `roundNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InspectionRectification` ADD CONSTRAINT `InspectionRectification_reviewItemId_fkey` FOREIGN KEY (`reviewItemId`) REFERENCES `LeadH5ReviewItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionRectificationRound` ADD CONSTRAINT `InspectionRectificationRound_rectificationId_fkey` FOREIGN KEY (`rectificationId`) REFERENCES `InspectionRectification`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionRectificationRound` ADD CONSTRAINT `InspectionRectificationRound_taskRecordId_fkey` FOREIGN KEY (`taskRecordId`) REFERENCES `TaskRecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


UPDATE `Role`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'lead-h5:rectifications:view')
WHERE JSON_TYPE(`permissions`) = 'ARRAY'
  AND NOT JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:rectifications:view'))
  AND (JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:front-hall:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:back-kitchen:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:store-credit:submit')));

UPDATE `Role`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'lead-h5:rectifications:start')
WHERE JSON_TYPE(`permissions`) = 'ARRAY'
  AND NOT JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:rectifications:start'))
  AND (JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:front-hall:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:back-kitchen:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:store-credit:submit')));

UPDATE `Role`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'lead-h5:rectifications:no-action')
WHERE JSON_TYPE(`permissions`) = 'ARRAY'
  AND NOT JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:rectifications:no-action'))
  AND (JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:front-hall:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:back-kitchen:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:store-credit:submit')));

UPDATE `Role`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'lead-h5:rectifications:accept')
WHERE JSON_TYPE(`permissions`) = 'ARRAY'
  AND NOT JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:rectifications:accept'))
  AND (JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:front-hall:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:back-kitchen:submit'))
    OR JSON_CONTAINS(`permissions`, JSON_QUOTE('lead-h5:store-credit:submit')));
