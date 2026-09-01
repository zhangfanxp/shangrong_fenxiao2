-- Apply once AFTER 20260831_course_assignment_batches.sql; pause mobile writes.
-- No existing progress is removed or reset. Legacy rows explicitly lack exact times.
CREATE TABLE `CourseLessonVisit` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `courseId` VARCHAR(191) NOT NULL,
  `lessonId` VARCHAR(191) NULL,
  `channel` VARCHAR(20) NOT NULL,
  `courseRecordNoSnapshot` VARCHAR(12) NOT NULL,
  `courseNameSnapshot` VARCHAR(100) NOT NULL,
  `chapterNameSnapshot` VARCHAR(100) NOT NULL,
  `learnerRealNameSnapshot` VARCHAR(100) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  `startedAt` DATETIME(3) NULL,
  `lastActiveAt` DATETIME(3) NULL,
  `endedAt` DATETIME(3) NULL,
  `endReason` VARCHAR(30) NULL,
  `legacySourceKey` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CourseLessonVisit_legacySourceKey_key` (`legacySourceKey`),
  INDEX `CourseLessonVisit_courseId_userId_createdAt_id_idx` (`courseId`, `userId`, `createdAt`, `id`),
  INDEX `CourseLessonVisit_courseId_createdAt_id_idx` (`courseId`, `createdAt`, `id`),
  INDEX `CourseLessonVisit_lessonId_userId_idx` (`lessonId`, `userId`),
  INDEX `CourseLessonVisit_status_lastActiveAt_idx` (`status`, `lastActiveAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- One marked legacy aggregate per existing effective user/lesson progress.
-- It is NOT represented as an original entry, and no start/end is fabricated.
INSERT INTO `CourseLessonVisit`
(`id`, `userId`, `courseId`, `lessonId`, `channel`,
 `courseRecordNoSnapshot`, `courseNameSnapshot`, `chapterNameSnapshot`,
 `learnerRealNameSnapshot`, `status`, `legacySourceKey`, `createdAt`, `updatedAt`)
SELECT UUID(), lp.`userId`, c.`id`, l.`id`, 'legacy',
 c.`recordNo`, c.`courseName`, l.`chapterName`,
 COALESCE(cp.`learnerRealNameSnapshot`, u.`realName`, '历史姓名未采集'),
 'LEGACY', CONCAT('lesson:', lp.`id`), lp.`createdAt`, CURRENT_TIMESTAMP(3)
FROM `CourseLessonProgress` lp
JOIN `CourseLesson` l ON l.`id` = lp.`lessonId`
JOIN `Course` c ON c.`id` = l.`courseId`
LEFT JOIN `CourseLearningProgress` cp ON cp.`courseId` = c.`id` AND cp.`userId` = lp.`userId`
LEFT JOIN `User` u ON u.`id` = lp.`userId`
WHERE lp.`progressSeconds` > 0 OR lp.`completedAt` IS NOT NULL;

-- Preserve old course-only learning for which no chapter can be determined.
INSERT INTO `CourseLessonVisit`
(`id`, `userId`, `courseId`, `lessonId`, `channel`,
 `courseRecordNoSnapshot`, `courseNameSnapshot`, `chapterNameSnapshot`,
 `learnerRealNameSnapshot`, `status`, `legacySourceKey`, `createdAt`, `updatedAt`)
SELECT UUID(), cp.`userId`, c.`id`, NULL, 'legacy',
 c.`recordNo`, c.`courseName`, '历史数据未采集',
 COALESCE(cp.`learnerRealNameSnapshot`, u.`realName`, '历史姓名未采集'),
 'LEGACY', CONCAT('course:', cp.`id`), cp.`createdAt`, CURRENT_TIMESTAMP(3)
FROM `CourseLearningProgress` cp
JOIN `Course` c ON c.`id` = cp.`courseId`
LEFT JOIN `User` u ON u.`id` = cp.`userId`
WHERE (cp.`firstLearnedAt` IS NOT NULL OR cp.`progress` > 0 OR cp.`completedAt` IS NOT NULL)
AND NOT EXISTS (
  SELECT 1 FROM `CourseLessonProgress` lp JOIN `CourseLesson` l ON l.`id` = lp.`lessonId`
  WHERE l.`courseId` = c.`id` AND lp.`userId` = cp.`userId`
  AND (lp.`progressSeconds` > 0 OR lp.`completedAt` IS NOT NULL)
);
