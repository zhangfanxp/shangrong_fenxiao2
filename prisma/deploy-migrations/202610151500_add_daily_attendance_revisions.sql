ALTER TABLE `DailyAttendanceRecord`
  ADD COLUMN `updatedByUserId` VARCHAR(191) NULL,
  ADD COLUMN `updatedByUsername` VARCHAR(100) NULL,
  ADD COLUMN `updatedByNameSnapshot` VARCHAR(100) NULL,
  ADD COLUMN `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1,
  ADD INDEX `DailyAttendanceRecord_updatedByUserId_updatedAt_idx` (`updatedByUserId`, `updatedAt`),
  ADD CONSTRAINT `DailyAttendanceRecord_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `DailyAttendanceRevision` (
  `id` VARCHAR(191) NOT NULL,
  `attendanceId` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL,
  `action` VARCHAR(20) NOT NULL,
  `modificationReason` VARCHAR(300) NULL,
  `snapshot` JSON NOT NULL,
  `changedByUserId` VARCHAR(191) NULL,
  `changedByUsername` VARCHAR(100) NOT NULL,
  `changedByNameSnapshot` VARCHAR(100) NOT NULL,
  `changedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `DailyAttendanceRevision_attendanceId_revision_key` (`attendanceId`, `revision`),
  INDEX `DailyAttendanceRevision_changedByUserId_changedAt_idx` (`changedByUserId`, `changedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `DailyAttendanceRevision_attendanceId_fkey`
    FOREIGN KEY (`attendanceId`) REFERENCES `DailyAttendanceRecord` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DailyAttendanceRevision_changedByUserId_fkey`
    FOREIGN KEY (`changedByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
