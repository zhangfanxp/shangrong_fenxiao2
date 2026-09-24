ALTER TABLE `Personnel`
  ADD COLUMN `birthdayCalendar` ENUM('LUNAR', 'SOLAR') NOT NULL DEFAULT 'LUNAR' AFTER `birthday`;
