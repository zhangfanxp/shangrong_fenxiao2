CREATE TABLE `DailyAttendanceSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DailyAttendanceRecord` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `attendanceDate` DATE NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `storeNameSnapshot` VARCHAR(100) NOT NULL,
  `brandIdSnapshot` VARCHAR(191) NOT NULL,
  `brandNameSnapshot` VARCHAR(100) NOT NULL,
  `deadlineAt` DATETIME(0) NOT NULL,
  `partTimeHeadcount` INTEGER NULL,
  `partTimeHours` DECIMAL(6, 1) NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdByUsername` VARCHAR(100) NOT NULL,
  `createdByNameSnapshot` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `DailyAttendanceRecord_recordNo_key` (`recordNo`),
  UNIQUE INDEX `DailyAttendanceRecord_storeId_attendanceDate_key` (`storeId`, `attendanceDate`),
  INDEX `DailyAttendanceRecord_attendanceDate_storeId_idx` (`attendanceDate`, `storeId`),
  INDEX `DailyAttendanceRecord_createdByUserId_createdAt_idx` (`createdByUserId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `DailyAttendanceRecord_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DailyAttendanceRecord_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `DailyAttendanceRecord_part_time_check` CHECK (
    (`partTimeHeadcount` IS NULL AND `partTimeHours` IS NULL)
    OR (`partTimeHeadcount` = 0 AND `partTimeHours` IS NULL)
    OR (`partTimeHeadcount` > 0 AND `partTimeHours` > 0)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DailyAttendanceItem` (
  `id` VARCHAR(191) NOT NULL,
  `attendanceId` VARCHAR(191) NOT NULL,
  `personnelId` VARCHAR(191) NOT NULL,
  `personnelRecordNo` VARCHAR(12) NOT NULL,
  `personnelNameSnapshot` VARCHAR(50) NOT NULL,
  `positionLevelSnapshot` VARCHAR(50) NOT NULL,
  `attendanceType` ENUM('FULL_ATTENDANCE', 'REST', 'LEAVE_FULL_DAY', 'LEAVE_HOURS') NOT NULL,
  `leaveHours` DECIMAL(4, 1) NULL,
  `overtime` BOOLEAN NOT NULL DEFAULT false,
  `overtimeHours` DECIMAL(4, 1) NULL,
  `sortOrder` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DailyAttendanceItem_attendanceId_personnelId_key` (`attendanceId`, `personnelId`),
  INDEX `DailyAttendanceItem_personnelId_attendanceId_idx` (`personnelId`, `attendanceId`),
  INDEX `DailyAttendanceItem_attendanceType_idx` (`attendanceType`),
  PRIMARY KEY (`id`),
  CONSTRAINT `DailyAttendanceItem_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `DailyAttendanceRecord` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DailyAttendanceItem_personnelId_fkey` FOREIGN KEY (`personnelId`) REFERENCES `Personnel` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DailyAttendanceItem_leave_hours_check` CHECK (
    (`attendanceType` = 'LEAVE_HOURS' AND `leaveHours` > 0 AND `leaveHours` <= 24)
    OR (`attendanceType` <> 'LEAVE_HOURS' AND `leaveHours` IS NULL)
  ),
  CONSTRAINT `DailyAttendanceItem_overtime_hours_check` CHECK (
    (`overtime` = true AND `overtimeHours` > 0 AND `overtimeHours` <= 24)
    OR (`overtime` = false AND `overtimeHours` IS NULL)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
