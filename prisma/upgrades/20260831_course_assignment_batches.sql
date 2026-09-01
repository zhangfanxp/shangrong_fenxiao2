-- Apply once to the existing schema. Back up the database before deployment.
-- Preserve the course foreign-key index while replacing pair uniqueness.
CREATE INDEX `CourseAssignment_courseId_userId_idx` ON `CourseAssignment`(`courseId`, `userId`);
DROP INDEX `CourseAssignment_courseId_userId_key` ON `CourseAssignment`;

-- AlterTable
ALTER TABLE `CourseAssignment` ADD COLUMN `batchId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `CourseLearningProgress` ADD COLUMN `firstLearnedAt` DATETIME(3) NULL,
    ADD COLUMN `lastLearnedAt` DATETIME(3) NULL,
    ADD COLUMN `learnerRealNameSnapshot` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `CourseAssignmentBatch` (
    `id` VARCHAR(191) NOT NULL,
    `recordNo` VARCHAR(12) NOT NULL,
    `clientRequestId` VARCHAR(36) NULL,
    `courseCount` INTEGER NOT NULL,
    `userCount` INTEGER NOT NULL,
    `status` ENUM('ENABLED', 'DISABLED') NOT NULL DEFAULT 'ENABLED',
    `assignedByUserId` VARCHAR(191) NULL,
    `assignedByUsername` VARCHAR(100) NOT NULL,
    `assignedByName` VARCHAR(100) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `legacyImported` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CourseAssignmentBatch_recordNo_key`(`recordNo`),
    UNIQUE INDEX `CourseAssignmentBatch_clientRequestId_key`(`clientRequestId`),
    INDEX `CourseAssignmentBatch_assignedAt_id_idx`(`assignedAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseAssignmentCourse` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `courseRecordNoSnapshot` VARCHAR(12) NOT NULL,
    `courseNameSnapshot` VARCHAR(100) NOT NULL,
    `applicablePositionSnapshot` VARCHAR(100) NOT NULL,
    `coverR2StorageId` VARCHAR(191) NULL,
    `coverObjectKey` VARCHAR(1024) NULL,
    `coverOriginalName` VARCHAR(255) NULL,
    `coverMimeType` VARCHAR(100) NULL,
    `coverSizeBytes` INTEGER NULL,
    `coverDataUrl` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CourseAssignmentCourse_courseId_idx`(`courseId`),
    UNIQUE INDEX `CourseAssignmentCourse_batchId_courseId_key`(`batchId`, `courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseAssignmentUser` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `usernameSnapshot` VARCHAR(100) NOT NULL,
    `realNameSnapshot` VARCHAR(100) NOT NULL,
    `roleSnapshot` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CourseAssignmentUser_userId_idx`(`userId`),
    UNIQUE INDEX `CourseAssignmentUser_batchId_userId_key`(`batchId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseAssignmentUserScope` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentUserId` VARCHAR(191) NOT NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `brandName` VARCHAR(100) NOT NULL,
    `storeName` VARCHAR(100) NOT NULL,

    INDEX `CourseAssignmentUserScope_assignmentUserId_idx`(`assignmentUserId`),
    INDEX `CourseAssignmentUserScope_brandId_storeId_idx`(`brandId`, `storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseAssignmentSequence` (
    `dateKey` VARCHAR(8) NOT NULL,
    `nextValue` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `CourseAssignment_batchId_courseId_userId_key` ON `CourseAssignment`(`batchId`, `courseId`, `userId`);

-- AddForeignKey
ALTER TABLE `CourseAssignment` ADD CONSTRAINT `CourseAssignment_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `CourseAssignmentBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseAssignmentCourse` ADD CONSTRAINT `CourseAssignmentCourse_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `CourseAssignmentBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseAssignmentUser` ADD CONSTRAINT `CourseAssignmentUser_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `CourseAssignmentBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseAssignmentUserScope` ADD CONSTRAINT `CourseAssignmentUserScope_assignmentUserId_fkey` FOREIGN KEY (`assignmentUserId`) REFERENCES `CourseAssignmentUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
