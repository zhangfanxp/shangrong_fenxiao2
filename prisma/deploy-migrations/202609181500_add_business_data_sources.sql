CREATE TABLE `BusinessDataSourceSequence` (
  `dateKey` VARCHAR(8) NOT NULL,
  `nextValue` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessDataSource` (
  `id` VARCHAR(191) NOT NULL,
  `recordNo` VARCHAR(12) NOT NULL,
  `businessName` VARCHAR(20) NOT NULL,
  `sourceType` ENUM('TASK_TEMPLATE', 'ASSESSMENT_TEMPLATE', 'RESEARCH_TEMPLATE') NOT NULL,
  `templateId` VARCHAR(191) NOT NULL,
  `templateRecordNoSnapshot` VARCHAR(24) NOT NULL,
  `templateNameSnapshot` VARCHAR(100) NOT NULL,
  `remark` VARCHAR(200) NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdByUsername` VARCHAR(50) NOT NULL,
  `createdByNameSnapshot` VARCHAR(50) NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `updatedByNameSnapshot` VARCHAR(50) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BusinessDataSource_recordNo_key` (`recordNo`),
  UNIQUE INDEX `BusinessDataSource_sourceType_templateId_key` (`sourceType`, `templateId`),
  INDEX `BusinessDataSource_businessName_idx` (`businessName`),
  INDEX `BusinessDataSource_templateRecordNoSnapshot_idx` (`templateRecordNoSnapshot`),
  INDEX `BusinessDataSource_createdAt_id_idx` (`createdAt`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessDataSourceField` (
  `id` VARCHAR(191) NOT NULL,
  `businessDataSourceId` VARCHAR(191) NOT NULL,
  `sourceFieldKey` VARCHAR(191) NOT NULL,
  `sourceFieldId` VARCHAR(191) NULL,
  `sourceFieldCode` VARCHAR(191) NULL,
  `fieldNameSnapshot` VARCHAR(200) NOT NULL,
  `sourceFieldType` VARCHAR(50) NULL,
  `sourceFieldConfig` JSON NULL,
  `fieldType` ENUM('INTEGER', 'DECIMAL', 'MONEY', 'PERCENTAGE') NOT NULL,
  `unit` VARCHAR(10) NULL,
  `remark` VARCHAR(200) NULL,
  `sortOrder` INTEGER NOT NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BusinessDSField_source_field_key` (`businessDataSourceId`, `sourceFieldKey`),
  UNIQUE INDEX `BusinessDSField_field_name_key` (`businessDataSourceId`, `fieldNameSnapshot`),
  INDEX `BusinessDSField_source_sort_idx` (`businessDataSourceId`, `sortOrder`),
  CONSTRAINT `BusinessDataSourceField_businessDataSourceId_fkey` FOREIGN KEY (`businessDataSourceId`) REFERENCES `BusinessDataSource` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
