# 数据库数据字典

> 数据源：当前项目所连接的 MySQL 数据库；生成时间（Asia/Shanghai）：2026-09-24 17:36:28。
> 页面会直接读取本文件。后续数据库结构变化时，只需按现有章节和六列表格格式更新本文件，无需修改页面代码。

## ActualRevenueDaily | 每日实际营业额

> 作用：存储月度营业额记录下每天的实际营业额。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| monthlyRecordId | 月度记录ID | varchar(191) NOT NULL | 关联记录的月度记录ID。 | 否 | 普通：ActualRevenueDaily_monthlyRecordId_businessDate_idx |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：ActualRevenueDaily_storeId_businessDate_key |
| businessDate | 营业日期 | date NOT NULL | 营业日期对应的业务日期。 | 否 | 普通：ActualRevenueDaily_monthlyRecordId_businessDate_idx（第2列）；唯一：ActualRevenueDaily_storeId_businessDate_key（第2列） |
| revenueAmount | 营业额 | decimal(18,2) NOT NULL | 每日实际营业额记录中的营业额。 | 否 | — |
| discountAmount | 优惠金额 | decimal(18,2) NULL | 每日实际营业额记录中的优惠金额。 | 否 | — |
| operatingIncome | 营业收入 | decimal(18,2) NULL | 每日实际营业额记录中的营业收入。 | 否 | — |
| orderCount | 订单数 | int NULL | 每日实际营业额记录中的订单数。 | 否 | — |
| dinerCount | 就餐人数 | int NULL | 每日实际营业额记录中的就餐人数。 | 否 | — |
| tableCount | 开台数 | int NULL | 每日实际营业额记录中的开台数。 | 否 | — |
| preDiscountPerCapita | 折前人均消费 | decimal(18,2) NULL | 每日实际营业额记录中的折前人均消费。 | 否 | — |
| postDiscountPerCapita | 折后人均消费 | decimal(18,2) NULL | 每日实际营业额记录中的折后人均消费。 | 否 | — |
| preDiscountAvgOrder | 折前订单均价 | decimal(18,2) NULL | 每日实际营业额记录中的折前订单均价。 | 否 | — |
| postDiscountAvgOrder | 折后订单均价 | decimal(18,2) NULL | 每日实际营业额记录中的折后订单均价。 | 否 | — |
| tableOpenRate | 开台率 | decimal(10,6) NULL | 每日实际营业额记录中的开台率。 | 否 | — |
| tableTurnoverRate | 翻台率 | decimal(10,6) NULL | 每日实际营业额记录中的翻台率。 | 否 | — |
| seatOccupancyRate | 上座率 | decimal(10,6) NULL | 每日实际营业额记录中的上座率。 | 否 | — |
| avgDiningDurationMinutes | 平均用餐时长（分钟） | decimal(10,2) NULL | 每日实际营业额记录中的平均用餐时长（分钟）。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## ActualRevenueMonthly | 月度实际营业额

> 作用：存储门店月度实际营业额汇总、目标和完成情况。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 月度实际营业额记录中的记录编号。 | 否 | 唯一：ActualRevenueMonthly_recordNo_key |
| statMonth | 统计月份 | varchar(7) NOT NULL | 月度实际营业额记录中的统计月份。 | 否 | 普通：ActualRevenueMonthly_brandId_statMonth_idx（第2列）；普通：ActualRevenueMonthly_statMonth_storeNameSnapshot_idx；唯一：ActualRevenueMonthly_storeId_statMonth_key（第2列） |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 否 | 普通：ActualRevenueMonthly_brandId_statMonth_idx |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：ActualRevenueMonthly_storeId_statMonth_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | 普通：ActualRevenueMonthly_statMonth_storeNameSnapshot_idx（第2列） |
| regionNameSnapshot | 区域名称快照 | varchar(100) NULL | 业务发生时固化的区域名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| storeManagerNameSnapshot | 门店负责人名称快照 | varchar(50) NULL | 业务发生时固化的门店负责人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| supervisorNameSnapshot | 督导名称快照 | varchar(50) NULL | 业务发生时固化的督导名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| cooperationTypeSnapshot | 合作类型快照 | varchar(30) NULL | 业务发生时固化的合作类型快照，避免源数据后续变化影响历史记录。 | 否 | — |
| monthlyRevenue | 月度营业额 | decimal(18,2) NOT NULL | 月度实际营业额记录中的月度营业额。 | 否 | — |
| dailyTargetStatus | 每日目标状态 | varchar(20) NOT NULL | 月度实际营业额记录中的每日目标状态。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：ActualRevenueMonthly_createdByUserId_fkey |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 月度实际营业额记录中的创建人姓名。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## ActualRevenueSequence | 实际营业额编号序列

> 作用：维护实际营业额记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 实际营业额编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 实际营业额编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Assessment | 考核表配置

> 作用：存储巡店、督导等考核表的基础配置、评分模式和版本信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(191) NOT NULL | 考核表配置记录中的记录编号。 | 否 | 唯一：Assessment_recordNo_key |
| name | 名称 | varchar(191) NOT NULL | 考核表配置记录中的名称。 | 否 | — |
| scoreMode | 得分模式 | enum('BINARY','CUSTOM_SCORE') NOT NULL | 考核表配置记录中的得分模式。 | 否 | — |
| configFileName | 配置文件名 | varchar(191) NOT NULL | 考核表配置记录中的配置文件名。 | 否 | 唯一：Assessment_configFileName_key |
| detailText | 明细文本 | longtext NOT NULL | 考核表配置记录中的明细文本。 | 否 | — |
| sectionCount | 章节数量 | int NOT NULL | 考核表配置记录中的章节数量。 | 否 | — |
| subsectionCount | 子章节数量 | int NOT NULL | 考核表配置记录中的子章节数量。 | 否 | — |
| itemCount | 项目数量 | int NOT NULL | 考核表配置记录中的项目数量。 | 否 | — |
| totalScore | 总分 | decimal(10,1) NOT NULL | 考核表配置记录中的总分。 | 否 | — |
| remark | 备注 | varchar(50) NULL | 考核表配置记录中的备注。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 考核表配置记录中的状态。 | 否 | 普通：Assessment_status_idx |
| configVersion | 配置版本 | int NOT NULL | 考核表配置记录中的配置版本。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：Assessment_createdByUserId_fkey |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：Assessment_createdAt_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| applicableBrands | 适用品牌集合 | json NULL | 以 JSON 结构保存的适用品牌集合。 | 否 | — |
| photoAttachmentLimit | 照片附件上限 | int NOT NULL | 考核表配置记录中的照片附件上限。 | 否 | — |
| r2StorageId | R2存储配置ID | varchar(191) NOT NULL | 关联记录的R2存储配置ID。 | 否 | 普通：Assessment_r2StorageId_idx |

## AssessmentBrandScope | 考核表品牌范围

> 作用：存储考核表适用的品牌及考核类型范围。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| assessmentId | 考核表ID | varchar(191) NOT NULL | 关联记录的考核表ID。 | 否 | 唯一：AssessmentBrandScope_assessmentId_brandValue_key |
| brandValue | 品牌值 | varchar(100) NOT NULL | 考核表品牌范围记录中的品牌值。 | 否 | 唯一：AssessmentBrandScope_assessmentId_brandValue_key（第2列）；普通：AssessmentBrandScope_brandValue_assessmentType_idx |
| assessmentType | 考核类型 | varchar(100) NOT NULL | 考核表品牌范围记录中的考核类型。 | 否 | 普通：AssessmentBrandScope_brandValue_assessmentType_idx（第2列） |
| activeKey | 有效记录键 | varchar(64) NULL | 考核表品牌范围记录中的有效记录键。 | 否 | 唯一：AssessmentBrandScope_activeKey_key |

## AssessmentRecord | 考核记录

> 作用：存储按考核表产生的配置快照、评分结果和实际总分。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| assessmentId | 考核表ID | varchar(191) NOT NULL | 关联记录的考核表ID。 | 否 | 普通：AssessmentRecord_assessmentId_idx |
| configVersion | 配置版本 | int NOT NULL | 考核记录记录中的配置版本。 | 否 | — |
| configSnapshot | 配置快照 | json NOT NULL | 业务发生时固化的配置 JSON，避免后续配置变化影响历史记录。 | 否 | — |
| scoreSnapshot | 得分快照 | json NULL | 业务发生时固化的得分快照，避免源数据后续变化影响历史记录。 | 否 | — |
| actualTotalScore | 实际总分 | decimal(10,1) NULL | 考核记录记录中的实际总分。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## Brand | 品牌

> 作用：存储餐饮品牌的编码、名称和启停状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| code | 编码 | varchar(191) NOT NULL | 品牌记录中的编码。 | 否 | 唯一：Brand_code_key |
| name | 名称 | varchar(191) NOT NULL | 品牌记录中的名称。 | 否 | 唯一：Brand_name_key |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 品牌记录中的状态。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## BusinessDataSource | 业务数据源

> 作用：存储可配置业务数据源的名称、编码、展示与权限设置。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 普通：BusinessDataSource_createdAt_id_idx（第2列）；主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 业务数据源记录中的记录编号。 | 否 | 唯一：BusinessDataSource_recordNo_key |
| businessName | 业务名称 | varchar(20) NOT NULL | 业务数据源记录中的业务名称。 | 否 | 普通：BusinessDataSource_businessName_idx |
| sourceType | 来源类型 | enum('TASK_TEMPLATE','ASSESSMENT_TEMPLATE','RESEARCH_TEMPLATE') NOT NULL | 业务数据源记录中的来源类型。 | 否 | 唯一：BusinessDataSource_sourceType_templateId_key |
| templateId | 模板ID | varchar(191) NOT NULL | 关联记录的模板ID。 | 否 | 唯一：BusinessDataSource_sourceType_templateId_key（第2列） |
| templateRecordNoSnapshot | 模板记录编号快照 | varchar(24) NOT NULL | 业务发生时固化的模板记录编号快照，避免源数据后续变化影响历史记录。 | 否 | 普通：BusinessDataSource_templateRecordNoSnapshot_idx |
| templateNameSnapshot | 模板名称快照 | varchar(100) NOT NULL | 业务发生时固化的模板名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| remark | 备注 | varchar(200) NULL | 业务数据源记录中的备注。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NOT NULL | 关联记录的创建人用户ID。 | 否 | — |
| createdByUsername | 创建人用户名 | varchar(50) NOT NULL | 业务数据源记录中的创建人用户名。 | 否 | — |
| createdByNameSnapshot | 创建人名称快照 | varchar(50) NOT NULL | 业务发生时固化的创建人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | — |
| updatedByNameSnapshot | 更新人名称快照 | varchar(50) NULL | 业务发生时固化的更新人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| version | 版本号 | int NOT NULL | 业务数据源记录中的版本号。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：BusinessDataSource_createdAt_id_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## BusinessDataSourceField | 业务数据源字段

> 作用：存储业务数据源中每个字段的类型、角色、校验和展示配置。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| businessDataSourceId | 业务数据来源ID | varchar(191) NOT NULL | 关联记录的业务数据来源ID。 | 否 | 唯一：BusinessDSField_field_name_key；唯一：BusinessDSField_source_field_key；普通：BusinessDSField_source_sort_idx |
| sourceFieldKey | 来源字段键 | varchar(191) NOT NULL | 业务数据源字段记录中的来源字段键。 | 否 | 唯一：BusinessDSField_source_field_key（第2列） |
| sourceFieldId | 来源字段ID | varchar(191) NULL | 关联记录的来源字段ID。 | 否 | — |
| sourceFieldCode | 来源字段编码 | varchar(191) NULL | 业务数据源字段记录中的来源字段编码。 | 否 | — |
| fieldNameSnapshot | 字段名称快照 | varchar(200) NOT NULL | 业务发生时固化的字段名称快照，避免源数据后续变化影响历史记录。 | 否 | 唯一：BusinessDSField_field_name_key（第2列） |
| sourceFieldType | 来源字段类型 | varchar(50) NULL | 业务数据源字段记录中的来源字段类型。 | 否 | — |
| sourceFieldConfig | 来源字段配置 | json NULL | 以 JSON 结构保存的来源字段配置。 | 否 | — |
| fieldRole | 字段角色 | enum('DIMENSION','METRIC') NOT NULL | 业务数据源字段记录中的字段角色。 | 否 | — |
| fieldType | 字段类型 | enum('INTEGER','DECIMAL','MONEY','PERCENTAGE','TEXT','DATE','DATETIME') NOT NULL | 业务数据源字段记录中的字段类型。 | 否 | — |
| unit | 单位 | varchar(10) NULL | 业务数据源字段记录中的单位。 | 否 | — |
| remark | 备注 | varchar(200) NULL | 业务数据源字段记录中的备注。 | 否 | — |
| sortOrder | 排序序号 | int NOT NULL | 业务数据源字段记录中的排序序号。 | 否 | 普通：BusinessDSField_source_sort_idx（第2列） |
| createdByUserId | 创建人用户ID | varchar(191) NOT NULL | 关联记录的创建人用户ID。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## BusinessDataSourceSequence | 业务数据源编号序列

> 作用：维护业务数据源记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 业务数据源编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 业务数据源编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Contract | 合同

> 作用：存储门店合作合同、期限、费用、合作方式和附件信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(191) NOT NULL | 合同记录中的记录编号。 | 否 | 唯一：Contract_recordNo_key |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 否 | 普通：Contract_brandId_fkey |
| storeName | 门店名称 | varchar(191) NOT NULL | 合同记录中的门店名称。 | 否 | — |
| status | 状态 | enum('PENDING','ACTIVE','EXPIRING','TERMINATED','EXPIRED') NOT NULL | 合同记录中的状态。 | 否 | 普通：Contract_status_endDate_idx |
| archiveBox | 归档箱 | varchar(191) NULL | 合同记录中的归档箱。 | 否 | — |
| trialOpenDate | 试营业开台日期 | datetime(3) NULL | 试营业开台日期对应的业务日期。 | 否 | — |
| cooperationType | 合作类型 | enum('DIRECT','FRANCHISE') NOT NULL | 合同记录中的合作类型。 | 否 | — |
| contactName | 联系人名称 | varchar(191) NULL | 合同记录中的联系人名称。 | 否 | — |
| contactPhone | 联系人手机 | varchar(191) NULL | 合同记录中的联系人手机。 | 否 | — |
| ownerName | 业主名称 | varchar(191) NOT NULL | 合同记录中的业主名称。 | 否 | — |
| ownerPhone | 业主手机 | varchar(191) NULL | 合同记录中的业主手机。 | 否 | — |
| ownerIdNumber | 业主ID号码 | varchar(191) NULL | 合同记录中的业主ID号码。 | 否 | — |
| address | 地址 | varchar(191) NULL | 合同记录中的地址。 | 否 | — |
| cooperationFee | 合作费用 | decimal(12,2) NOT NULL | 合同记录中的合作费用。 | 否 | — |
| brandFee | 品牌费用 | decimal(12,2) NOT NULL | 合同记录中的品牌费用。 | 否 | — |
| financeServiceFee | 财务服务费用 | decimal(12,2) NOT NULL | 合同记录中的财务服务费用。 | 否 | — |
| designFee | 设计费用 | decimal(12,2) NOT NULL | 合同记录中的设计费用。 | 否 | — |
| deposit | 押金 | decimal(12,2) NOT NULL | 合同记录中的押金。 | 否 | — |
| depositRecipient | 押金接收人 | varchar(191) NULL | 合同记录中的押金接收人。 | 否 | — |
| refundedDeposit | 已退押金 | decimal(12,2) NOT NULL | 合同记录中的已退押金。 | 否 | — |
| rebateType | 返利类型 | varchar(191) NULL | 合同记录中的返利类型。 | 否 | — |
| rebatePerson | 返利人员 | varchar(191) NULL | 合同记录中的返利人员。 | 否 | — |
| rebateAmount | 返利金额 | decimal(12,2) NOT NULL | 合同记录中的返利金额。 | 否 | — |
| startDate | 开始日期 | datetime(3) NOT NULL | 开始日期对应的业务日期。 | 否 | — |
| endDate | 结束日期 | datetime(3) NOT NULL | 结束日期对应的业务日期。 | 否 | 普通：Contract_status_endDate_idx（第2列） |
| remark | 备注 | text NULL | 合同记录中的备注。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| city | 城市 | varchar(191) NULL | 合同记录中的城市。 | 否 | — |
| district | 区县 | varchar(191) NULL | 合同记录中的区县。 | 否 | — |
| province | 省份 | varchar(191) NULL | 合同记录中的省份。 | 否 | — |

## ContractRebate | 合同返利

> 作用：存储合同约定的返利年度、比例和金额。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| contractId | 合同ID | varchar(191) NOT NULL | 关联记录的合同ID。 | 否 | 普通：ContractRebate_contractId_idx |
| type | 类型 | varchar(191) NOT NULL | 合同返利记录中的类型。 | 否 | — |
| person | 人员 | varchar(191) NOT NULL | 合同返利记录中的人员。 | 否 | — |
| amount | 金额 | decimal(12,2) NOT NULL | 合同返利记录中的金额。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Course | 在线课程

> 作用：存储已发布课程的基础信息、封面、状态和版本。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 在线课程记录中的记录编号。 | 否 | 唯一：Course_recordNo_key |
| courseName | 课程名称 | varchar(30) NOT NULL | 在线课程记录中的课程名称。 | 否 | 普通：Course_courseName_deletedAt_idx |
| courseDescription | 课程说明 | varchar(200) NULL | 在线课程记录中的课程说明。 | 否 | — |
| coverR2StorageId | 封面R2存储ID | varchar(191) NULL | 关联记录的封面R2存储ID。 | 否 | — |
| coverObjectKey | 封面对象键 | varchar(1024) NULL | 在线课程记录中的封面对象键。 | 否 | — |
| coverOriginalName | 封面原始名称 | varchar(255) NULL | 在线课程记录中的封面原始名称。 | 否 | — |
| coverMimeType | 封面媒体类型 | varchar(100) NULL | 在线课程记录中的封面媒体类型。 | 否 | — |
| coverSizeBytes | 封面大小字节 | int NULL | 在线课程记录中的封面大小字节。 | 否 | — |
| coverDataUrl | 封面数据链接 | longtext NULL | 在线课程记录中的封面数据链接。 | 否 | — |
| applicablePosition | 适用岗位 | varchar(30) NOT NULL | 在线课程记录中的适用岗位。 | 否 | 普通：Course_applicablePosition_deletedAt_idx |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 在线课程记录中的状态。 | 否 | 普通：Course_status_deletedAt_idx |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | — |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 在线课程记录中的创建人姓名。 | 否 | — |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | 普通：Course_applicablePosition_deletedAt_idx（第2列）；普通：Course_courseName_deletedAt_idx（第2列）；普通：Course_status_deletedAt_idx（第2列） |
| version | 版本号 | int NOT NULL | 在线课程记录中的版本号。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：Course_createdAt_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseAssignment | 课程分配

> 作用：存储课程学习任务的分配方式、期限和状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| courseId | 课程ID | varchar(191) NOT NULL | 关联记录的课程ID。 | 否 | 唯一：CourseAssignment_batchId_courseId_userId_key（第2列）；普通：CourseAssignment_courseId_userId_idx |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 唯一：CourseAssignment_batchId_courseId_userId_key（第3列）；普通：CourseAssignment_courseId_userId_idx（第2列）；普通：CourseAssignment_userId_createdAt_idx |
| assignedByUserId | 指派人用户ID | varchar(191) NULL | 关联记录的指派人用户ID。 | 否 | 普通：CourseAssignment_assignedByUserId_createdAt_idx |
| assignedByName | 指派人名称 | varchar(50) NOT NULL | 课程分配记录中的指派人名称。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：CourseAssignment_assignedByUserId_createdAt_idx（第2列）；普通：CourseAssignment_userId_createdAt_idx（第2列） |
| batchId | 批次ID | varchar(191) NULL | 关联记录的批次ID。 | 否 | 唯一：CourseAssignment_batchId_courseId_userId_key |

## CourseAssignmentBatch | 课程分配批次

> 作用：存储一次课程分配操作的批次信息和处理结果。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 普通：CourseAssignmentBatch_assignedAt_id_idx（第2列）；主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 课程分配批次记录中的记录编号。 | 否 | 唯一：CourseAssignmentBatch_recordNo_key |
| clientRequestId | 客户端请求ID | varchar(36) NULL | 关联记录的客户端请求ID。 | 否 | 唯一：CourseAssignmentBatch_clientRequestId_key |
| courseCount | 课程数量 | int NOT NULL | 课程分配批次记录中的课程数量。 | 否 | — |
| userCount | 用户数量 | int NOT NULL | 课程分配批次记录中的用户数量。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 课程分配批次记录中的状态。 | 否 | — |
| assignedByUserId | 指派人用户ID | varchar(191) NULL | 关联记录的指派人用户ID。 | 否 | — |
| assignedByUsername | 指派人用户名 | varchar(100) NOT NULL | 课程分配批次记录中的指派人用户名。 | 否 | — |
| assignedByName | 指派人名称 | varchar(100) NOT NULL | 课程分配批次记录中的指派人名称。 | 否 | — |
| assignedAt | 指派时间 | datetime(3) NOT NULL | 指派时间对应的时间点。 | 否 | 普通：CourseAssignmentBatch_assignedAt_id_idx |
| legacyImported | 历史已导入 | tinyint(1) NOT NULL | 课程分配批次记录中的历史已导入。 | 否 | — |
| version | 版本号 | int NOT NULL | 课程分配批次记录中的版本号。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseAssignmentCourse | 分配批次课程

> 作用：存储课程分配批次所包含的课程及快照。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| batchId | 批次ID | varchar(191) NOT NULL | 关联记录的批次ID。 | 否 | 唯一：CourseAssignmentCourse_batchId_courseId_key |
| courseId | 课程ID | varchar(191) NOT NULL | 关联记录的课程ID。 | 否 | 唯一：CourseAssignmentCourse_batchId_courseId_key（第2列）；普通：CourseAssignmentCourse_courseId_idx |
| courseRecordNoSnapshot | 课程记录编号快照 | varchar(12) NOT NULL | 业务发生时固化的课程记录编号快照，避免源数据后续变化影响历史记录。 | 否 | — |
| courseNameSnapshot | 课程名称快照 | varchar(100) NOT NULL | 业务发生时固化的课程名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| applicablePositionSnapshot | 适用岗位快照 | varchar(100) NOT NULL | 业务发生时固化的适用岗位快照，避免源数据后续变化影响历史记录。 | 否 | — |
| coverR2StorageId | 封面R2存储ID | varchar(191) NULL | 关联记录的封面R2存储ID。 | 否 | — |
| coverObjectKey | 封面对象键 | varchar(1024) NULL | 分配批次课程记录中的封面对象键。 | 否 | — |
| coverOriginalName | 封面原始名称 | varchar(255) NULL | 分配批次课程记录中的封面原始名称。 | 否 | — |
| coverMimeType | 封面媒体类型 | varchar(100) NULL | 分配批次课程记录中的封面媒体类型。 | 否 | — |
| coverSizeBytes | 封面大小字节 | int NULL | 分配批次课程记录中的封面大小字节。 | 否 | — |
| coverDataUrl | 封面数据链接 | longtext NULL | 分配批次课程记录中的封面数据链接。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## CourseAssignmentSequence | 课程分配编号序列

> 作用：维护课程分配记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 课程分配编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 课程分配编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseAssignmentUser | 课程分配用户

> 作用：存储课程分配与具体学习用户之间的关联。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| batchId | 批次ID | varchar(191) NOT NULL | 关联记录的批次ID。 | 否 | 唯一：CourseAssignmentUser_batchId_userId_key |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 唯一：CourseAssignmentUser_batchId_userId_key（第2列）；普通：CourseAssignmentUser_userId_idx |
| usernameSnapshot | 用户名快照 | varchar(100) NOT NULL | 业务发生时固化的用户名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| realNameSnapshot | 真实名称快照 | varchar(100) NOT NULL | 业务发生时固化的真实名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| roleSnapshot | 角色快照 | varchar(100) NOT NULL | 业务发生时固化的角色快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## CourseAssignmentUserScope | 课程分配用户范围

> 作用：存储分配用户对应的品牌、门店等适用范围快照。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| assignmentUserId | 分配用户ID | varchar(191) NOT NULL | 关联记录的分配用户ID。 | 否 | 普通：CourseAssignmentUserScope_assignmentUserId_idx |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 否 | 普通：CourseAssignmentUserScope_brandId_storeId_idx |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 普通：CourseAssignmentUserScope_brandId_storeId_idx（第2列） |
| brandName | 品牌名称 | varchar(100) NOT NULL | 课程分配用户范围记录中的品牌名称。 | 否 | — |
| storeName | 门店名称 | varchar(100) NOT NULL | 课程分配用户范围记录中的门店名称。 | 否 | — |

## CourseBrand | 课程适用品牌

> 作用：存储课程与适用品牌之间的关联关系。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| courseId | 课程ID | varchar(191) NOT NULL | 关联记录的课程ID。 | 否 | 普通：CourseBrand_brandCode_courseId_idx（第2列）；唯一：CourseBrand_courseId_brandCode_key |
| brandCode | 品牌编码 | varchar(100) NOT NULL | 课程适用品牌记录中的品牌编码。 | 否 | 普通：CourseBrand_brandCode_courseId_idx；唯一：CourseBrand_courseId_brandCode_key（第2列） |
| brandLabel | 品牌标签 | varchar(100) NOT NULL | 课程适用品牌记录中的品牌标签。 | 否 | — |

## CourseDraft | 课程草稿

> 作用：存储尚未发布课程的名称、简介和编辑状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(36) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| createdByUserId | 创建人用户ID | varchar(191) NOT NULL | 关联记录的创建人用户ID。 | 否 | 普通：CourseDraft_createdByUserId_expiresAt_idx |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 课程草稿记录中的创建人姓名。 | 否 | — |
| expiresAt | 过期时间 | datetime(3) NOT NULL | 过期时间对应的时间点。 | 否 | 普通：CourseDraft_createdByUserId_expiresAt_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseLearningProgress | 课程学习进度

> 作用：存储用户对整门课程的总体学习进度和完成状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| courseId | 课程ID | varchar(191) NOT NULL | 关联记录的课程ID。 | 否 | 唯一：CourseLearningProgress_courseId_userId_key |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 唯一：CourseLearningProgress_courseId_userId_key（第2列）；普通：CourseLearningProgress_userId_createdAt_idx |
| progress | 进度 | int NOT NULL | 课程学习进度记录中的进度。 | 否 | — |
| completedAt | 完成时间 | datetime(3) NULL | 完成时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：CourseLearningProgress_userId_createdAt_idx（第2列） |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| firstLearnedAt | 首次学习时间 | datetime(3) NULL | 首次学习时间对应的时间点。 | 否 | — |
| lastLearnedAt | 最近学习时间 | datetime(3) NULL | 最近学习时间对应的时间点。 | 否 | — |
| learnerRealNameSnapshot | 学员真实名称快照 | varchar(100) NULL | 业务发生时固化的学员真实名称快照，避免源数据后续变化影响历史记录。 | 否 | — |

## CourseLesson | 课程课节

> 作用：存储课程中的视频、音频或文档课节及 R2 文件信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 课程课节记录中的记录编号。 | 否 | 唯一：CourseLesson_recordNo_key |
| courseId | 课程ID | varchar(191) NULL | 关联记录的课程ID。 | 否 | 普通：CourseLesson_courseId_deletedAt_sortOrder_idx；唯一：CourseLesson_courseId_sortOrder_key |
| courseDraftId | 课程草稿ID | varchar(36) NULL | 关联记录的课程草稿ID。 | 否 | 普通：CourseLesson_courseDraftId_deletedAt_sortOrder_idx；唯一：CourseLesson_courseDraftId_sortOrder_key |
| chapterName | 章节名称 | varchar(30) NOT NULL | 课程课节记录中的章节名称。 | 否 | — |
| chapterDescription | 章节说明 | varchar(200) NULL | 课程课节记录中的章节说明。 | 否 | — |
| coverR2StorageId | 封面R2存储ID | varchar(191) NULL | 关联记录的封面R2存储ID。 | 否 | — |
| coverObjectKey | 封面对象键 | varchar(1024) NULL | 课程课节记录中的封面对象键。 | 否 | — |
| coverOriginalName | 封面原始名称 | varchar(255) NULL | 课程课节记录中的封面原始名称。 | 否 | — |
| coverMimeType | 封面媒体类型 | varchar(100) NULL | 课程课节记录中的封面媒体类型。 | 否 | — |
| coverSizeBytes | 封面大小字节 | int NULL | 课程课节记录中的封面大小字节。 | 否 | — |
| coverDataUrl | 封面数据链接 | longtext NULL | 课程课节记录中的封面数据链接。 | 否 | — |
| coursewareType | 课件类型 | enum('VIDEO','AUDIO','PDF','PPT') NOT NULL | 课程课节记录中的课件类型。 | 否 | — |
| fileR2StorageId | 文件R2存储ID | varchar(191) NOT NULL | 关联记录的文件R2存储ID。 | 否 | — |
| originalFileName | 原始文件名称 | varchar(255) NOT NULL | 课程课节记录中的原始文件名称。 | 否 | — |
| fileObjectKey | 文件对象键 | varchar(1024) NOT NULL | 课程课节记录中的文件对象键。 | 否 | — |
| fileSizeBytes | 文件大小字节 | int NOT NULL | 课程课节记录中的文件大小字节。 | 否 | — |
| mimeType | 文件媒体类型 | varchar(100) NOT NULL | 课程课节记录中的文件媒体类型。 | 否 | — |
| remark | 备注 | varchar(200) NULL | 课程课节记录中的备注。 | 否 | — |
| sortOrder | 排序序号 | int NOT NULL | 课程课节记录中的排序序号。 | 否 | 普通：CourseLesson_courseDraftId_deletedAt_sortOrder_idx（第3列）；唯一：CourseLesson_courseDraftId_sortOrder_key（第2列）；普通：CourseLesson_courseId_deletedAt_sortOrder_idx（第3列）；唯一：CourseLesson_courseId_sortOrder_key（第2列） |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | — |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 课程课节记录中的创建人姓名。 | 否 | — |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | 普通：CourseLesson_courseDraftId_deletedAt_sortOrder_idx（第2列）；普通：CourseLesson_courseId_deletedAt_sortOrder_idx（第2列） |
| version | 版本号 | int NOT NULL | 课程课节记录中的版本号。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseLessonProgress | 课节学习进度

> 作用：存储用户对单个课节的播放位置、进度和完成状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| lessonId | 课节ID | varchar(191) NOT NULL | 关联记录的课节ID。 | 否 | 唯一：CourseLessonProgress_lessonId_userId_key |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 唯一：CourseLessonProgress_lessonId_userId_key（第2列）；普通：CourseLessonProgress_userId_createdAt_idx |
| progressSeconds | 进度秒 | int NOT NULL | 课节学习进度记录中的进度秒。 | 否 | — |
| completedAt | 完成时间 | datetime(3) NULL | 完成时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：CourseLessonProgress_userId_createdAt_idx（第2列） |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseLessonSequence | 课节编号序列

> 作用：维护课程课节记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 课节编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 课节编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseLessonVisit | 课节访问记录

> 作用：存储用户每次进入课程课节的访问会话和停留信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(36) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 普通：CourseLessonVisit_courseId_createdAt_id_idx（第3列）；普通：CourseLessonVisit_courseId_userId_createdAt_id_idx（第4列）；主键：PRIMARY |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 普通：CourseLessonVisit_courseId_userId_createdAt_id_idx（第2列）；普通：CourseLessonVisit_lessonId_userId_idx（第2列） |
| courseId | 课程ID | varchar(191) NOT NULL | 关联记录的课程ID。 | 否 | 普通：CourseLessonVisit_courseId_createdAt_id_idx；普通：CourseLessonVisit_courseId_userId_createdAt_id_idx |
| lessonId | 课节ID | varchar(191) NULL | 关联记录的课节ID。 | 否 | 普通：CourseLessonVisit_lessonId_userId_idx |
| channel | 渠道 | varchar(20) NOT NULL | 课节访问记录记录中的渠道。 | 否 | — |
| courseRecordNoSnapshot | 课程记录编号快照 | varchar(12) NOT NULL | 业务发生时固化的课程记录编号快照，避免源数据后续变化影响历史记录。 | 否 | — |
| courseNameSnapshot | 课程名称快照 | varchar(100) NOT NULL | 业务发生时固化的课程名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| chapterNameSnapshot | 章节名称快照 | varchar(100) NOT NULL | 业务发生时固化的章节名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| learnerRealNameSnapshot | 学员真实名称快照 | varchar(100) NOT NULL | 业务发生时固化的学员真实名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| status | 状态 | varchar(20) NOT NULL | 课节访问记录记录中的状态。 | 否 | 普通：CourseLessonVisit_status_lastActiveAt_idx |
| startedAt | 开始时间 | datetime(3) NULL | 开始时间对应的时间点。 | 否 | — |
| lastActiveAt | 最近有效时间 | datetime(3) NULL | 最近有效时间对应的时间点。 | 否 | 普通：CourseLessonVisit_status_lastActiveAt_idx（第2列） |
| endedAt | 结束时间 | datetime(3) NULL | 结束时间对应的时间点。 | 否 | — |
| endReason | 结束原因 | varchar(30) NULL | 课节访问记录记录中的结束原因。 | 否 | — |
| legacySourceKey | 历史来源键 | varchar(191) NULL | 课节访问记录记录中的历史来源键。 | 否 | 唯一：CourseLessonVisit_legacySourceKey_key |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：CourseLessonVisit_courseId_createdAt_id_idx（第2列）；普通：CourseLessonVisit_courseId_userId_createdAt_id_idx（第3列） |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## CourseSequence | 课程编号序列

> 作用：维护课程记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 课程编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 课程编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## DailyAttendanceItem | 每日考勤明细

> 作用：存储考勤单内每位员工的考勤类型、工时和备注。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| attendanceId | 考勤ID | varchar(191) NOT NULL | 关联记录的考勤ID。 | 否 | 唯一：DailyAttendanceItem_attendanceId_personnelId_key；普通：DailyAttendanceItem_personnelId_attendanceId_idx（第2列） |
| personnelId | 人员ID | varchar(191) NOT NULL | 关联记录的人员ID。 | 否 | 唯一：DailyAttendanceItem_attendanceId_personnelId_key（第2列）；普通：DailyAttendanceItem_personnelId_attendanceId_idx |
| personnelRecordNo | 人员记录编号 | varchar(12) NOT NULL | 每日考勤明细记录中的人员记录编号。 | 否 | — |
| personnelNameSnapshot | 人员名称快照 | varchar(50) NOT NULL | 业务发生时固化的人员名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| positionLevelSnapshot | 岗位级别快照 | varchar(50) NOT NULL | 业务发生时固化的岗位级别快照，避免源数据后续变化影响历史记录。 | 否 | — |
| attendanceType | 考勤类型 | enum('FULL_ATTENDANCE','REST','LEAVE_FULL_DAY','LEAVE_HOURS') NOT NULL | 每日考勤明细记录中的考勤类型。 | 否 | 普通：DailyAttendanceItem_attendanceType_idx |
| leaveHours | 请假小时 | decimal(4,1) NULL | 每日考勤明细记录中的请假小时。 | 否 | — |
| overtime | 加班 | tinyint(1) NOT NULL | 每日考勤明细记录中的加班。 | 否 | — |
| overtimeHours | 加班小时 | decimal(4,1) NULL | 每日考勤明细记录中的加班小时。 | 否 | — |
| laborCostSnapshot | 人工成本快照 | decimal(18,2) NULL | 业务发生时固化的人工成本快照，避免源数据后续变化影响历史记录。 | 否 | — |
| hourlyLaborCostSnapshot | 小时人工成本快照 | decimal(18,2) NULL | 业务发生时固化的小时人工成本快照，避免源数据后续变化影响历史记录。 | 否 | — |
| laborCostUnitSnapshot | 人工成本单位快照 | varchar(20) NULL | 业务发生时固化的人工成本单位快照，避免源数据后续变化影响历史记录。 | 否 | — |
| sortOrder | 排序序号 | int NOT NULL | 每日考勤明细记录中的排序序号。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## DailyAttendanceRecord | 每日考勤记录

> 作用：存储门店每日考勤提交单、汇总工时和提交状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 每日考勤记录记录中的记录编号。 | 否 | 唯一：DailyAttendanceRecord_recordNo_key |
| attendanceDate | 考勤日期 | date NOT NULL | 考勤日期对应的业务日期。 | 否 | 普通：DailyAttendanceRecord_attendanceDate_storeId_idx；唯一：DailyAttendanceRecord_storeId_attendanceDate_key（第2列） |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 普通：DailyAttendanceRecord_attendanceDate_storeId_idx（第2列）；唯一：DailyAttendanceRecord_storeId_attendanceDate_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandIdSnapshot | 品牌ID快照 | varchar(191) NOT NULL | 业务发生时固化的品牌ID快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| cooperationTypeSnapshot | 合作类型快照 | varchar(30) NOT NULL | 业务发生时固化的合作类型快照，避免源数据后续变化影响历史记录。 | 否 | — |
| deadlineAt | 截止时间 | datetime NOT NULL | 截止时间对应的时间点。 | 否 | — |
| partTimeHeadcount | 兼职时间人数 | int NULL | 每日考勤记录记录中的兼职时间人数。 | 否 | — |
| partTimeHours | 兼职时间小时 | decimal(6,1) NULL | 每日考勤记录记录中的兼职时间小时。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：DailyAttendanceRecord_createdByUserId_createdAt_idx |
| createdByUsername | 创建人用户名 | varchar(100) NOT NULL | 每日考勤记录记录中的创建人用户名。 | 否 | — |
| createdByNameSnapshot | 创建人名称快照 | varchar(100) NOT NULL | 业务发生时固化的创建人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime NOT NULL | 创建时间对应的时间点。 | 否 | 普通：DailyAttendanceRecord_createdByUserId_createdAt_idx（第2列） |

## DailyAttendanceSequence | 考勤记录编号序列

> 作用：维护每日考勤记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 考勤记录编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 考勤记录编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## DailyLearningAssignee | 每日学习指派

> 作用：存储学习计划与指定学习人员的关联关系。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| planId | 计划ID | varchar(191) NOT NULL | 关联记录的计划ID。 | 否 | 唯一：DailyLearningAssignee_planId_userId_key；普通：DailyLearningAssignee_userId_planId_idx（第2列） |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 唯一：DailyLearningAssignee_planId_userId_key（第2列）；普通：DailyLearningAssignee_userId_planId_idx |
| usernameSnapshot | 用户名快照 | varchar(50) NOT NULL | 业务发生时固化的用户名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| realNameSnapshot | 真实名称快照 | varchar(50) NOT NULL | 业务发生时固化的真实名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| labelSnapshot | 标签快照 | varchar(200) NOT NULL | 业务发生时固化的标签快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## DailyLearningPlan | 每日学习计划

> 作用：存储每日学习任务的主题、内容、适用范围和发布时间。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 每日学习计划记录中的记录编号。 | 否 | 唯一：DailyLearningPlan_recordNo_key |
| isoYear | ISO年份 | int NOT NULL | 标识ISO年份。 | 否 | 普通：DailyLearningPlan_isoYear_isoWeek_deletedAt_idx |
| isoWeek | ISO周 | int NOT NULL | 标识ISO周。 | 否 | 普通：DailyLearningPlan_isoYear_isoWeek_deletedAt_idx（第2列） |
| studentTag | 学员标签 | varchar(100) NOT NULL | 每日学习计划记录中的学员标签。 | 否 | 普通：DailyLearningPlan_studentTag_deletedAt_idx |
| activeKey | 有效记录键 | varchar(220) NULL | 每日学习计划记录中的有效记录键。 | 否 | 唯一：DailyLearningPlan_activeKey_key |
| weekStartAt | 周开始时间 | datetime(3) NOT NULL | 周开始时间对应的时间点。 | 否 | — |
| mondayContent | 周一内容 | text NULL | 每日学习计划记录中的周一内容。 | 否 | — |
| tuesdayContent | 周二内容 | text NULL | 每日学习计划记录中的周二内容。 | 否 | — |
| wednesdayContent | 周三内容 | text NULL | 每日学习计划记录中的周三内容。 | 否 | — |
| thursdayContent | 周四内容 | text NULL | 每日学习计划记录中的周四内容。 | 否 | — |
| fridayContent | 周五内容 | text NULL | 每日学习计划记录中的周五内容。 | 否 | — |
| saturdayContent | 周六内容 | text NULL | 每日学习计划记录中的周六内容。 | 否 | — |
| sundayContent | 周日内容 | text NULL | 每日学习计划记录中的周日内容。 | 否 | — |
| learningDays | 学习天数 | int NOT NULL | 每日学习计划记录中的学习天数。 | 否 | — |
| remark | 备注 | varchar(100) NULL | 每日学习计划记录中的备注。 | 否 | — |
| version | 版本号 | int NOT NULL | 每日学习计划记录中的版本号。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：DailyLearningPlan_createdByUserId_fkey |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 每日学习计划记录中的创建人姓名。 | 否 | — |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | 普通：DailyLearningPlan_isoYear_isoWeek_deletedAt_idx（第3列）；普通：DailyLearningPlan_studentTag_deletedAt_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：DailyLearningPlan_createdAt_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## DailyLearningProgress | 每日学习进度

> 作用：存储用户对每日学习计划的完成、录音和确认信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| planId | 计划ID | varchar(191) NOT NULL | 关联记录的计划ID。 | 否 | 普通：DailyLearningProgress_planId_userId_idx；唯一：DailyLearningProgress_planId_userId_weekDay_key |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 普通：DailyLearningProgress_planId_userId_idx（第2列）；唯一：DailyLearningProgress_planId_userId_weekDay_key（第2列）；普通：DailyLearningProgress_userId_learningDate_idx |
| learningDate | 学习日期 | date NOT NULL | 学习日期对应的业务日期。 | 否 | 普通：DailyLearningProgress_userId_learningDate_idx（第2列） |
| weekDay | 周日期 | int NOT NULL | 每日学习进度记录中的周日期。 | 否 | 唯一：DailyLearningProgress_planId_userId_weekDay_key（第3列） |
| status | 状态 | varchar(20) NOT NULL | 每日学习进度记录中的状态。 | 否 | — |
| contentSnapshot | 内容快照 | text NOT NULL | 业务发生时固化的内容快照，避免源数据后续变化影响历史记录。 | 否 | — |
| completedAt | 完成时间 | datetime(3) NOT NULL | 完成时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| recordingDurationSeconds | 录音耗时秒 | int NULL | 每日学习进度记录中的录音耗时秒。 | 否 | — |
| recordingMimeType | 录音媒体类型 | varchar(100) NULL | 每日学习进度记录中的录音媒体类型。 | 否 | — |
| recordingObjectKey | 录音对象键 | varchar(1024) NULL | 每日学习进度记录中的录音对象键。 | 否 | — |
| recordingOriginalName | 录音原始名称 | varchar(255) NULL | 每日学习进度记录中的录音原始名称。 | 否 | — |
| recordingR2StorageId | 录音R2存储ID | varchar(191) NULL | 关联记录的录音R2存储ID。 | 否 | 普通：DailyLearningProgress_recordingR2StorageId_idx |
| recordingSize | 录音大小 | int NULL | 每日学习进度记录中的录音大小。 | 否 | — |

## DailyLearningSequence | 每日学习编号序列

> 作用：维护每日学习计划记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 每日学习编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 每日学习编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## DatabaseBackupFile | 数据库备份文件

> 作用：存储每次全量数据库备份的 R2 文件、校验值和执行状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| fileName | 文件名称 | varchar(255) NOT NULL | 数据库备份文件记录中的文件名称。 | 否 | 唯一：DatabaseBackupFile_fileName_key |
| r2StorageId | R2存储配置ID | varchar(191) NOT NULL | 关联记录的R2存储配置ID。 | 否 | 普通：DatabaseBackupFile_r2StorageId_idx |
| r2StorageNameSnapshot | R2配置名称快照 | varchar(50) NOT NULL | 业务发生时固化的R2配置名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| bucketNameSnapshot | 存储桶名称快照 | varchar(63) NOT NULL | 业务发生时固化的存储桶名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| objectKey | 对象存储键 | varchar(500) NOT NULL | 文件在 R2 存储桶中的唯一对象路径。 | 否 | 唯一：DatabaseBackupFile_objectKey_key |
| backupType | 备份类型 | varchar(20) NOT NULL | 数据库备份文件记录中的备份类型。 | 否 | 普通：DatabaseBackupFile_backupType_startedAt_idx |
| status | 状态 | varchar(20) NOT NULL | 数据库备份文件记录中的状态。 | 否 | 普通：DatabaseBackupFile_status_startedAt_idx |
| sizeBytes | 文件大小（字节） | bigint NOT NULL | 数据库备份文件记录中的文件大小（字节）。 | 否 | — |
| checksumSha256 | SHA-256校验值 | varchar(64) NULL | 备份文件内容的 SHA-256 完整性校验值。 | 否 | — |
| durationSeconds | 执行耗时（秒） | int NULL | 数据库备份文件记录中的执行耗时（秒）。 | 否 | — |
| scheduleKey | 调度唯一键 | varchar(20) NULL | 用于防止同一个定时时点被重复执行的唯一标识。 | 否 | 唯一：DatabaseBackupFile_scheduleKey_key |
| activeLockKey | 运行锁键 | varchar(32) NULL | 用于限制同一时刻只能运行一个数据库备份任务的唯一锁。 | 否 | 唯一：DatabaseBackupFile_activeLockKey_key |
| errorMessage | 错误信息 | text NULL | 数据库备份文件记录中的错误信息。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | — |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 数据库备份文件记录中的创建人姓名。 | 否 | — |
| startedAt | 开始时间 | datetime(3) NOT NULL | 开始时间对应的时间点。 | 否 | 普通：DatabaseBackupFile_backupType_startedAt_idx（第2列）；普通：DatabaseBackupFile_status_startedAt_idx（第2列） |
| completedAt | 完成时间 | datetime(3) NULL | 完成时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## DatabaseBackupSetting | 数据库备份设置

> 作用：存储数据库定时备份开关、频率、时间和目标 R2 存储桶。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(32) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| r2StorageId | R2存储配置ID | varchar(191) NOT NULL | 关联记录的R2存储配置ID。 | 否 | 普通：DatabaseBackupSetting_r2StorageId_idx |
| enabled | 是否启用 | tinyint(1) NOT NULL | 标识是否启用。 | 否 | — |
| frequency | 执行频率 | varchar(10) NOT NULL | 数据库备份设置记录中的执行频率。 | 否 | — |
| weekdays | 执行星期集合 | json NULL | 以 JSON 数组保存每周需要执行的星期序号（1至7）。 | 否 | — |
| executionTimes | 执行时间集合 | json NOT NULL | 以 JSON 数组保存每天需要触发备份的 HH:mm 时间。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | — |
| updatedByName | 更新人姓名 | varchar(50) NULL | 数据库备份设置记录中的更新人姓名。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## DataDictionary | 数据字典配置

> 作用：存储可维护数据字典文件的名称、编码和版本。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 数据字典配置记录中的记录编号。 | 否 | 唯一：DataDictionary_recordNo_key |
| name | 名称 | varchar(10) NOT NULL | 数据字典配置记录中的名称。 | 否 | 唯一：DataDictionary_name_key |
| code | 编码 | varchar(30) NOT NULL | 数据字典配置记录中的编码。 | 否 | 唯一：DataDictionary_code_key |
| fileName | 文件名称 | varchar(35) NOT NULL | 数据字典配置记录中的文件名称。 | 否 | 唯一：DataDictionary_fileName_key |
| remark | 备注 | varchar(200) NULL | 数据字典配置记录中的备注。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 数据字典配置记录中的状态。 | 否 | 普通：DataDictionary_status_idx |
| version | 版本号 | int NOT NULL | 数据字典配置记录中的版本号。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：DataDictionary_createdAt_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## DeploymentMigration | 部署迁移记录

> 作用：存储部署过程中一次性数据库变更的版本、校验值和执行结果。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(100) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| checksum | 校验值 | varchar(64) NOT NULL | 部署迁移记录记录中的校验值。 | 否 | — |
| appVersion | 应用版本 | varchar(30) NOT NULL | 部署迁移记录记录中的应用版本。 | 否 | — |
| description | 说明 | varchar(200) NULL | 部署迁移记录记录中的说明。 | 否 | — |
| status | 状态 | varchar(20) NOT NULL | 部署迁移记录记录中的状态。 | 否 | 普通：DeploymentMigration_status_startedAt_idx |
| startedAt | 开始时间 | datetime(3) NOT NULL | 开始时间对应的时间点。 | 否 | 普通：DeploymentMigration_status_startedAt_idx（第2列） |
| appliedAt | 应用时间 | datetime(3) NULL | 应用时间对应的时间点。 | 否 | — |
| error | 错误信息 | text NULL | 部署迁移记录记录中的错误信息。 | 否 | — |

## DictionaryItem | 基础字典项

> 作用：存储系统内通用下拉字典的标签、值和排序。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| type | 类型 | varchar(191) NOT NULL | 基础字典项记录中的类型。 | 否 | 唯一：DictionaryItem_type_value_key |
| label | 显示标签 | varchar(191) NOT NULL | 基础字典项记录中的显示标签。 | 否 | — |
| value | 数据值 | varchar(191) NOT NULL | 基础字典项记录中的数据值。 | 否 | 唯一：DictionaryItem_type_value_key（第2列） |
| sort | 排序序号 | int NOT NULL | 基础字典项记录中的排序序号。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 基础字典项记录中的状态。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## InventoryItem | 库存物品

> 作用：存储工服等物品档案、库存数量、预警值和启停状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 库存物品记录中的记录编号。 | 否 | 唯一：InventoryItem_recordNo_key |
| duplicateKey | 重复键 | varchar(64) NOT NULL | 库存物品记录中的重复键。 | 否 | 唯一：InventoryItem_duplicateKey_key |
| itemName | 项目名称 | varchar(30) NOT NULL | 库存物品记录中的项目名称。 | 否 | 普通：InventoryItem_itemName_idx |
| itemTypeCode | 项目类型编码 | varchar(100) NOT NULL | 库存物品记录中的项目类型编码。 | 否 | 普通：InventoryItem_itemTypeCode_idx |
| itemTypeNameSnapshot | 项目类型名称快照 | varchar(100) NOT NULL | 业务发生时固化的项目类型名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| specification | 规格 | varchar(50) NULL | 库存物品记录中的规格。 | 否 | — |
| unit | 单位 | varchar(5) NOT NULL | 库存物品记录中的单位。 | 否 | — |
| manageStock | 管理库存 | enum('MANAGED','UNMANAGED') NOT NULL | 库存物品记录中的管理库存。 | 否 | — |
| stockQuantity | 库存数量 | bigint unsigned NULL | 库存物品记录中的库存数量。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 库存物品记录中的状态。 | 否 | 普通：InventoryItem_status_createdAt_idx |
| requiresReturnOnResignation | 是否需要归还时离职 | tinyint(1) NOT NULL | 库存物品记录中的是否需要归还时离职。 | 否 | — |
| remark | 备注 | varchar(200) NULL | 库存物品记录中的备注。 | 否 | — |
| version | 版本号 | int NOT NULL | 库存物品记录中的版本号。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：InventoryItem_createdByUserId_idx |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 库存物品记录中的创建人姓名。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | 普通：InventoryItem_updatedByUserId_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：InventoryItem_status_createdAt_idx（第2列） |

## InventoryItemSequence | 物品编号序列

> 作用：维护库存物品记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 物品编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 物品编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## InventoryTransaction | 库存流水

> 作用：存储物品入库、领用、归还和调整产生的库存变动流水。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| transactionNo | 流水编号 | varchar(12) NOT NULL | 库存流水记录中的流水编号。 | 否 | 唯一：InventoryTransaction_transactionNo_key |
| itemId | 项目ID | varchar(191) NOT NULL | 关联记录的项目ID。 | 否 | 普通：InventoryTransaction_itemId_operatedAt_idx |
| itemRecordNoSnapshot | 项目记录编号快照 | varchar(12) NOT NULL | 业务发生时固化的项目记录编号快照，避免源数据后续变化影响历史记录。 | 否 | — |
| itemNameSnapshot | 项目名称快照 | varchar(30) NOT NULL | 业务发生时固化的项目名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| itemTypeCodeSnapshot | 项目类型编码快照 | varchar(100) NOT NULL | 业务发生时固化的项目类型编码快照，避免源数据后续变化影响历史记录。 | 否 | — |
| itemTypeNameSnapshot | 项目类型名称快照 | varchar(100) NOT NULL | 业务发生时固化的项目类型名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| specificationSnapshot | 规格快照 | varchar(50) NULL | 业务发生时固化的规格快照，避免源数据后续变化影响历史记录。 | 否 | — |
| unitSnapshot | 单位快照 | varchar(5) NOT NULL | 业务发生时固化的单位快照，避免源数据后续变化影响历史记录。 | 否 | — |
| businessType | 业务类型 | enum('INITIAL_STOCK','PURCHASE_INBOUND','EMPLOYEE_REQUISITION','REQUISITION_RETURN','MANUAL_ADJUSTMENT') NOT NULL | 库存流水记录中的业务类型。 | 否 | 普通：InventoryTransaction_businessType_operatedAt_idx |
| direction | 方向 | enum('IN','OUT') NOT NULL | 库存流水记录中的方向。 | 否 | 普通：InventoryTransaction_direction_operatedAt_idx |
| quantity | 数量 | bigint unsigned NOT NULL | 库存流水记录中的数量。 | 否 | — |
| stockBefore | 库存前 | bigint unsigned NOT NULL | 库存流水记录中的库存前。 | 否 | — |
| stockAfter | 库存后 | bigint unsigned NOT NULL | 库存流水记录中的库存后。 | 否 | — |
| relatedBusinessId | 关联业务ID | varchar(191) NULL | 关联记录的关联业务ID。 | 否 | 普通：InventoryTransaction_relatedBusinessId_idx |
| operatorUserId | 操作人用户ID | varchar(191) NULL | 关联记录的操作人用户ID。 | 否 | 普通：InventoryTransaction_operatorUserId_idx |
| operatorNameSnapshot | 操作人名称快照 | varchar(50) NOT NULL | 业务发生时固化的操作人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| operatedAt | 操作时间 | datetime(3) NOT NULL | 操作时间对应的时间点。 | 否 | 普通：InventoryTransaction_businessType_operatedAt_idx（第2列）；普通：InventoryTransaction_direction_operatedAt_idx（第2列）；普通：InventoryTransaction_itemId_operatedAt_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## InventoryTransactionSequence | 库存流水编号序列

> 作用：维护库存出入库流水编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 库存流水编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 库存流水编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## ItemRequisition | 物品领用单

> 作用：存储人员领用物品的数量、状态和经办信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 普通：ItemRequisition_requisitionedAt_id_idx（第2列）；主键：PRIMARY |
| requisitionNo | 领用编号 | varchar(12) NOT NULL | 物品领用单记录中的领用编号。 | 否 | 唯一：ItemRequisition_requisitionNo_key |
| requestId | 请求ID | varchar(36) NOT NULL | 关联记录的请求ID。 | 否 | 唯一：ItemRequisition_requestId_key |
| requisitionedAt | 领用时间 | datetime(3) NOT NULL | 领用时间对应的时间点。 | 否 | 普通：ItemRequisition_itemId_requisitionedAt_idx（第2列）；普通：ItemRequisition_personnelId_requisitionedAt_idx（第2列）；普通：ItemRequisition_requisitionedAt_id_idx |
| personnelId | 人员ID | varchar(191) NOT NULL | 关联记录的人员ID。 | 否 | 普通：ItemRequisition_personnelId_requisitionedAt_idx |
| personnelNameSnapshot | 人员名称快照 | varchar(50) NOT NULL | 业务发生时固化的人员名称快照，避免源数据后续变化影响历史记录。 | 否 | 普通：ItemRequisition_personnelNameSnapshot_idx |
| personnelBelongingSnapshot | 人员归属快照 | varchar(50) NOT NULL | 业务发生时固化的人员归属快照，避免源数据后续变化影响历史记录。 | 否 | — |
| departmentStoreSnapshot | 部门门店快照 | varchar(100) NULL | 业务发生时固化的部门门店快照，避免源数据后续变化影响历史记录。 | 否 | — |
| itemId | 项目ID | varchar(191) NOT NULL | 关联记录的项目ID。 | 否 | 普通：ItemRequisition_itemId_requisitionedAt_idx |
| itemRecordNoSnapshot | 项目记录编号快照 | varchar(12) NOT NULL | 业务发生时固化的项目记录编号快照，避免源数据后续变化影响历史记录。 | 否 | — |
| itemNameSnapshot | 项目名称快照 | varchar(30) NOT NULL | 业务发生时固化的项目名称快照，避免源数据后续变化影响历史记录。 | 否 | 普通：ItemRequisition_itemNameSnapshot_idx |
| itemTypeCodeSnapshot | 项目类型编码快照 | varchar(100) NOT NULL | 业务发生时固化的项目类型编码快照，避免源数据后续变化影响历史记录。 | 否 | — |
| itemTypeNameSnapshot | 项目类型名称快照 | varchar(100) NOT NULL | 业务发生时固化的项目类型名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| specificationSnapshot | 规格快照 | varchar(50) NULL | 业务发生时固化的规格快照，避免源数据后续变化影响历史记录。 | 否 | — |
| unitSnapshot | 单位快照 | varchar(5) NOT NULL | 业务发生时固化的单位快照，避免源数据后续变化影响历史记录。 | 否 | — |
| manageStockSnapshot | 管理库存快照 | enum('MANAGED','UNMANAGED') NOT NULL | 业务发生时固化的管理库存快照，避免源数据后续变化影响历史记录。 | 否 | — |
| quantity | 数量 | int unsigned NOT NULL | 物品领用单记录中的数量。 | 否 | — |
| remark | 备注 | varchar(100) NULL | 物品领用单记录中的备注。 | 否 | — |
| status | 状态 | enum('NORMAL','REVOKED') NOT NULL | 物品领用单记录中的状态。 | 否 | — |
| version | 版本号 | int NOT NULL | 物品领用单记录中的版本号。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：ItemRequisition_createdByUserId_idx |
| createdByUsername | 创建人用户名 | varchar(30) NOT NULL | 物品领用单记录中的创建人用户名。 | 否 | — |
| createdByNameSnapshot | 创建人名称快照 | varchar(50) NOT NULL | 业务发生时固化的创建人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | 普通：ItemRequisition_updatedByUserId_idx |
| updatedByNameSnapshot | 更新人名称快照 | varchar(50) NULL | 业务发生时固化的更新人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## ItemRequisitionReturn | 物品归还记录

> 作用：存储领用物品的归还数量、时间和经办人。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| requestId | 请求ID | varchar(36) NOT NULL | 关联记录的请求ID。 | 否 | 唯一：ItemRequisitionReturn_requestId_key |
| requisitionId | 领用ID | varchar(191) NOT NULL | 关联记录的领用ID。 | 否 | 普通：ItemRequisitionReturn_requisitionId_returnedAt_idx |
| quantity | 数量 | int unsigned NOT NULL | 物品归还记录记录中的数量。 | 否 | — |
| operatorUserId | 操作人用户ID | varchar(191) NULL | 关联记录的操作人用户ID。 | 否 | 普通：ItemRequisitionReturn_operatorUserId_idx |
| operatorUsernameSnapshot | 操作人用户名快照 | varchar(30) NOT NULL | 业务发生时固化的操作人用户名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| operatorNameSnapshot | 操作人名称快照 | varchar(50) NOT NULL | 业务发生时固化的操作人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| returnedAt | 归还时间 | datetime(3) NOT NULL | 归还时间对应的时间点。 | 否 | 普通：ItemRequisitionReturn_requisitionId_returnedAt_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## ItemRequisitionSequence | 领用单编号序列

> 作用：维护物品领用单记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 领用单编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 领用单编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## LaborCostPolicyVersion | 人工成本政策版本

> 作用：存储人工成本核算政策的版本、配置和生效范围。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| effectiveMonth | 生效月份 | char(7) NOT NULL | 人工成本政策版本记录中的生效月份。 | 是 | 主键：PRIMARY |
| headquartersMonthlyRestRule | 总部月度休息规则 | varchar(30) NOT NULL | 人工成本政策版本记录中的总部月度休息规则。 | 否 | — |
| headquartersFixedRestDays | 总部固定休息天数 | tinyint NOT NULL | 人工成本政策版本记录中的总部固定休息天数。 | 否 | — |
| headquartersLegalHolidayRule | 总部法定节假日规则 | varchar(30) NOT NULL | 人工成本政策版本记录中的总部法定节假日规则。 | 否 | — |
| storeMonthlyRestRule | 门店月度休息规则 | varchar(30) NOT NULL | 人工成本政策版本记录中的门店月度休息规则。 | 否 | — |
| storeFixedRestDays | 门店固定休息天数 | tinyint NOT NULL | 人工成本政策版本记录中的门店固定休息天数。 | 否 | — |
| storeLegalHolidayRule | 门店法定节假日规则 | varchar(30) NOT NULL | 人工成本政策版本记录中的门店法定节假日规则。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | — |
| createdByUsername | 创建人用户名 | varchar(50) NOT NULL | 人工成本政策版本记录中的创建人用户名。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | — |
| updatedByUsername | 更新人用户名 | varchar(50) NOT NULL | 人工成本政策版本记录中的更新人用户名。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | 普通：LaborCostPolicyVersion_updatedAt_idx |

## LeadH5ResearchSequence | 运营端调研编号序列

> 作用：维护运营 H5 调研提交记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 运营端调研编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 运营端调研编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## LeadH5Review | 运营端巡店评分

> 作用：存储运营人员对门店前厅、后厨或信用等考核的提交结果。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 运营端巡店评分记录中的记录编号。 | 否 | 唯一：LeadH5Review_recordNo_key |
| reviewType | 评分类型 | varchar(50) NOT NULL | 运营端巡店评分记录中的评分类型。 | 否 | 普通：LeadH5Review_reviewMonth_reviewType_idx（第2列）；唯一：LeadH5Review_storeId_reviewMonth_reviewType_key（第3列） |
| reviewMonth | 评分月份 | varchar(7) NOT NULL | 运营端巡店评分记录中的评分月份。 | 否 | 普通：LeadH5Review_reviewMonth_reviewType_idx；唯一：LeadH5Review_storeId_reviewMonth_reviewType_key（第2列） |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：LeadH5Review_storeId_reviewMonth_reviewType_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 否 | — |
| brandCodeSnapshot | 品牌编码快照 | varchar(50) NULL | 业务发生时固化的品牌编码快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| responsiblePersonUserId | 负责人人员用户ID | varchar(191) NULL | 关联记录的负责人人员用户ID。 | 否 | — |
| reviewerUserId | 评分人用户ID | varchar(191) NOT NULL | 关联记录的评分人用户ID。 | 否 | 普通：LeadH5Review_reviewerUserId_idx |
| reviewerUsername | 评分人用户名 | varchar(50) NOT NULL | 运营端巡店评分记录中的评分人用户名。 | 否 | — |
| reviewerRealName | 评分人真实名称 | varchar(50) NOT NULL | 运营端巡店评分记录中的评分人真实名称。 | 否 | — |
| assessmentId | 考核表ID | varchar(191) NOT NULL | 关联记录的考核表ID。 | 否 | 普通：LeadH5Review_assessmentId_idx |
| assessmentName | 考核名称 | varchar(100) NOT NULL | 运营端巡店评分记录中的考核名称。 | 否 | — |
| assessmentVersion | 考核版本 | int NOT NULL | 运营端巡店评分记录中的考核版本。 | 否 | — |
| configSnapshot | 配置快照 | json NOT NULL | 业务发生时固化的配置 JSON，避免后续配置变化影响历史记录。 | 否 | — |
| maxScore | 最高得分 | decimal(10,1) NOT NULL | 运营端巡店评分记录中的最高得分。 | 否 | — |
| actualScore | 实际得分 | decimal(10,1) NOT NULL | 运营端巡店评分记录中的实际得分。 | 否 | — |
| submittedAt | 提交时间 | datetime(3) NOT NULL | 提交时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| assessmentDate | 考核日期 | datetime NOT NULL | 考核日期对应的业务日期。 | 否 | — |
| assessmentSupervisor | 考核督导 | varchar(50) NOT NULL | 运营端巡店评分记录中的考核督导。 | 否 | — |
| responsiblePersonNameSnapshot | 负责人人员名称快照 | varchar(50) NULL | 业务发生时固化的负责人人员名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| responsiblePersonType | 负责人人员类型 | varchar(20) NULL | 运营端巡店评分记录中的负责人人员类型。 | 否 | — |

## LeadH5ReviewItem | 巡店评分明细

> 作用：存储巡店评分中每个检查项的得分、问题和备注。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| reviewId | 评分ID | varchar(191) NOT NULL | 关联记录的评分ID。 | 否 | 唯一：LeadH5ReviewItem_reviewId_itemKey_key；普通：LeadH5ReviewItem_reviewId_sortOrder_idx |
| itemKey | 项目键 | varchar(100) NOT NULL | 巡店评分明细记录中的项目键。 | 否 | 唯一：LeadH5ReviewItem_reviewId_itemKey_key（第2列） |
| sectionName | 章节名称 | varchar(100) NOT NULL | 巡店评分明细记录中的章节名称。 | 否 | — |
| subsectionName | 子章节名称 | varchar(100) NOT NULL | 巡店评分明细记录中的子章节名称。 | 否 | — |
| itemDescription | 项目说明 | text NOT NULL | 巡店评分明细记录中的项目说明。 | 否 | — |
| maxScore | 最高得分 | decimal(10,1) NOT NULL | 巡店评分明细记录中的最高得分。 | 否 | — |
| result | 执行结果 | varchar(20) NOT NULL | 巡店评分明细记录中的执行结果。 | 否 | — |
| actualScore | 实际得分 | decimal(10,1) NOT NULL | 巡店评分明细记录中的实际得分。 | 否 | — |
| sortOrder | 排序序号 | int NOT NULL | 巡店评分明细记录中的排序序号。 | 否 | 普通：LeadH5ReviewItem_reviewId_sortOrder_idx（第2列） |

## LeadH5ReviewPhoto | 巡店评分照片

> 作用：存储巡店评分所上传照片的 R2 对象信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| reviewItemId | 评分项目ID | varchar(191) NULL | 关联记录的评分项目ID。 | 否 | 普通：LeadH5ReviewPhoto_reviewItemId_idx |
| uploaderUserId | 上传人用户ID | varchar(191) NOT NULL | 关联记录的上传人用户ID。 | 否 | 普通：LeadH5ReviewPhoto_uploaderUserId_storeId_reviewMonth_reviewT_idx |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 普通：LeadH5ReviewPhoto_uploaderUserId_storeId_reviewMonth_reviewT_idx（第2列） |
| reviewMonth | 评分月份 | varchar(7) NOT NULL | 巡店评分照片记录中的评分月份。 | 否 | 普通：LeadH5ReviewPhoto_uploaderUserId_storeId_reviewMonth_reviewT_idx（第3列） |
| reviewType | 评分类型 | varchar(50) NOT NULL | 巡店评分照片记录中的评分类型。 | 否 | 普通：LeadH5ReviewPhoto_uploaderUserId_storeId_reviewMonth_reviewT_idx（第4列） |
| assessmentId | 考核表ID | varchar(191) NOT NULL | 关联记录的考核表ID。 | 否 | 普通：LeadH5ReviewPhoto_uploaderUserId_storeId_reviewMonth_reviewT_idx（第5列） |
| assessmentVersion | 考核版本 | int NOT NULL | 巡店评分照片记录中的考核版本。 | 否 | 普通：LeadH5ReviewPhoto_uploaderUserId_storeId_reviewMonth_reviewT_idx（第6列） |
| itemKey | 项目键 | varchar(100) NOT NULL | 巡店评分照片记录中的项目键。 | 否 | 普通：LeadH5ReviewPhoto_uploaderUserId_storeId_reviewMonth_reviewT_idx（第7列） |
| r2StorageId | R2存储配置ID | varchar(191) NOT NULL | 关联记录的R2存储配置ID。 | 否 | — |
| objectKey | 对象存储键 | varchar(500) NOT NULL | 文件在 R2 存储桶中的唯一对象路径。 | 否 | 唯一：LeadH5ReviewPhoto_objectKey_key |
| originalName | 原始文件名 | varchar(255) NOT NULL | 巡店评分照片记录中的原始文件名。 | 否 | — |
| mimeType | 文件媒体类型 | varchar(100) NOT NULL | 巡店评分照片记录中的文件媒体类型。 | 否 | — |
| size | 文件大小 | int NOT NULL | 巡店评分照片记录中的文件大小。 | 否 | — |
| consumedAt | 使用时间 | datetime(3) NULL | 使用时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：LeadH5ReviewPhoto_createdAt_idx |

## LeadH5ReviewSequence | 巡店评分编号序列

> 作用：维护巡店评分记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 巡店评分编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 巡店评分编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Meeting | 会议

> 作用：存储线上或线下会议的主题、时间、地点和参与范围。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 会议记录中的记录编号。 | 否 | 唯一：Meeting_recordNo_key |
| type | 类型 | enum('MID_MONTH_OFFLINE','MONTHLY_ONLINE','QUARTERLY_OFFLINE') NOT NULL | 会议记录中的类型。 | 否 | 普通：Meeting_type_attendanceStatus_idx；普通：Meeting_type_meetingMonth_idx |
| meetingMonth | 会议月份 | date NOT NULL | 会议记录中的会议月份。 | 否 | 普通：Meeting_type_meetingMonth_idx（第2列） |
| notificationId | 通知ID | varchar(191) NOT NULL | 关联记录的通知ID。 | 否 | 唯一：Meeting_notificationId_key |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：Meeting_createdByUserId_createdAt_idx |
| createdByName | 创建人姓名 | varchar(30) NOT NULL | 会议记录中的创建人姓名。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：Meeting_createdByUserId_createdAt_idx（第2列） |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| attendanceStatus | 考勤状态 | enum('UNSIGNED','SIGNED') NOT NULL | 会议记录中的考勤状态。 | 否 | 普通：Meeting_type_attendanceStatus_idx（第2列） |
| attendanceVersion | 考勤版本 | int NOT NULL | 会议记录中的考勤版本。 | 否 | — |
| checkedInAt | 已签到时间 | datetime(3) NULL | 已签到时间对应的时间点。 | 否 | — |
| checkedInByName | 已签到人名称 | varchar(30) NULL | 会议记录中的已签到人名称。 | 否 | — |
| checkedInByUserId | 已签到人用户ID | varchar(191) NULL | 关联记录的已签到人用户ID。 | 否 | — |
| notificationContentSnapshot | 通知内容快照 | varchar(500) NULL | 业务发生时固化的通知内容快照，避免源数据后续变化影响历史记录。 | 否 | — |
| notificationReleaseDate | 通知发布日期日期 | date NULL | 通知发布日期日期对应的业务日期。 | 否 | — |
| publisherNameSnapshot | 发布人名称快照 | varchar(10) NULL | 业务发生时固化的发布人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |

## MeetingParticipant | 会议参与人

> 作用：存储会议参与人员及签到、出席状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| meetingId | 会议ID | varchar(191) NOT NULL | 关联记录的会议ID。 | 否 | 普通：MeetingParticipant_meetingId_attendedAt_idx；唯一：MeetingParticipant_meetingId_userId_key；普通：MeetingParticipant_userId_meetingId_idx（第2列） |
| userId | 用户ID | varchar(191) NULL | 关联记录的用户ID。 | 否 | 唯一：MeetingParticipant_meetingId_userId_key（第2列）；普通：MeetingParticipant_userId_meetingId_idx |
| usernameSnapshot | 用户名快照 | varchar(30) NOT NULL | 业务发生时固化的用户名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| realNameSnapshot | 真实名称快照 | varchar(30) NOT NULL | 业务发生时固化的真实名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| roleSnapshot | 角色快照 | varchar(50) NOT NULL | 业务发生时固化的角色快照，避免源数据后续变化影响历史记录。 | 否 | — |
| attendedAt | 出席时间 | datetime(3) NULL | 出席时间对应的时间点。 | 否 | 普通：MeetingParticipant_meetingId_attendedAt_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## MonthlyPurchaseSalesImportBatch | 月度采销比导入批次

> 作用：存储月度采销比批量导入任务及处理统计。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| batchNo | 批次编号 | varchar(24) NOT NULL | 月度采销比导入批次记录中的批次编号。 | 否 | 唯一：MonthlyPurchaseSalesImportBatch_batchNo_key |
| fileName | 文件名称 | varchar(255) NOT NULL | 月度采销比导入批次记录中的文件名称。 | 否 | — |
| year | 年份 | smallint NOT NULL | 月度采销比导入批次记录中的年份。 | 否 | 普通：MonthlyPurchaseSalesImportBatch_year_month_createdAt_idx |
| month | 月份 | tinyint NOT NULL | 月度采销比导入批次记录中的月份。 | 否 | 普通：MonthlyPurchaseSalesImportBatch_year_month_createdAt_idx（第2列） |
| periodStart | 周期开始 | date NOT NULL | 月度采销比导入批次记录中的周期开始。 | 否 | — |
| periodEnd | 周期结束 | date NOT NULL | 月度采销比导入批次记录中的周期结束。 | 否 | — |
| totalCount | 总数量 | int NOT NULL | 月度采销比导入批次记录中的总数量。 | 否 | — |
| insertedCount | 新增数量 | int NOT NULL | 月度采销比导入批次记录中的新增数量。 | 否 | — |
| updatedCount | 更新数量 | int NOT NULL | 月度采销比导入批次记录中的更新数量。 | 否 | — |
| skippedCount | 跳过数量 | int NOT NULL | 月度采销比导入批次记录中的跳过数量。 | 否 | — |
| failedCount | 失败数量 | int NOT NULL | 月度采销比导入批次记录中的失败数量。 | 否 | — |
| operatorUserId | 操作人用户ID | varchar(191) NULL | 关联记录的操作人用户ID。 | 否 | 普通：MonthlyPurchaseSalesImportBatch_operatorUserId_createdAt_idx |
| operatorNameSnapshot | 操作人名称快照 | varchar(50) NOT NULL | 业务发生时固化的操作人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：MonthlyPurchaseSalesImportBatch_operatorUserId_createdAt_idx（第2列）；普通：MonthlyPurchaseSalesImportBatch_year_month_createdAt_idx（第3列） |

## MonthlyPurchaseSalesImportFailure | 月度采销比导入失败明细

> 作用：存储月度采销比导入失败的行号、原始数据和失败原因。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| batchId | 批次ID | varchar(191) NOT NULL | 关联记录的批次ID。 | 否 | 普通：MonthlyPurchaseSalesImportFailure_batchId_excelRowNo_idx |
| excelRowNo | Excel行编号 | int NOT NULL | 月度采销比导入失败明细记录中的Excel行编号。 | 否 | 普通：MonthlyPurchaseSalesImportFailure_batchId_excelRowNo_idx（第2列） |
| storeAlias | 门店别名 | varchar(100) NULL | 月度采销比导入失败明细记录中的门店别名。 | 否 | — |
| failureReason | 失败原因 | varchar(255) NOT NULL | 月度采销比导入失败明细记录中的失败原因。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## MonthlyPurchaseSalesRatio | 月度采销比

> 作用：存储门店每月进货、销售和采销比数据。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 月度采销比记录中的记录编号。 | 否 | 唯一：MonthlyPurchaseSalesRatio_recordNo_key |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：MonthlyPurchaseSalesRatio_storeId_year_month_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | 普通：MonthlyPurchaseSalesRatio_year_month_storeNameSnapshot_idx（第3列） |
| aliasId | 别名ID | varchar(191) NOT NULL | 关联记录的别名ID。 | 否 | — |
| meituanAliasSnapshot | 美团别名快照 | varchar(50) NOT NULL | 业务发生时固化的美团别名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandCode | 品牌编码 | varchar(50) NOT NULL | 月度采销比记录中的品牌编码。 | 否 | 普通：MonthlyPurchaseSalesRatio_brandCode_year_month_idx |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| year | 年份 | smallint NOT NULL | 月度采销比记录中的年份。 | 否 | 普通：MonthlyPurchaseSalesRatio_brandCode_year_month_idx（第2列）；唯一：MonthlyPurchaseSalesRatio_storeId_year_month_key（第2列）；普通：MonthlyPurchaseSalesRatio_year_month_storeNameSnapshot_idx |
| month | 月份 | tinyint NOT NULL | 月度采销比记录中的月份。 | 否 | 普通：MonthlyPurchaseSalesRatio_brandCode_year_month_idx（第3列）；唯一：MonthlyPurchaseSalesRatio_storeId_year_month_key（第3列）；普通：MonthlyPurchaseSalesRatio_year_month_storeNameSnapshot_idx（第2列） |
| preDiscountSales | 折前折扣销售 | decimal(18,2) NOT NULL | 月度采销比记录中的折前折扣销售。 | 否 | — |
| postDiscountSales | 折后折扣销售 | decimal(18,2) NULL | 月度采销比记录中的折后折扣销售。 | 否 | — |
| purchaseAmount | 采购金额 | decimal(18,2) NOT NULL | 月度采销比记录中的采购金额。 | 否 | — |
| preDiscountPurchaseSalesRatio | 折前折扣采购销售比例 | decimal(10,4) NOT NULL | 月度采销比记录中的折前折扣采购销售比例。 | 否 | — |
| postDiscountPurchaseSalesRatio | 折后折扣采购销售比例 | decimal(10,4) NULL | 月度采销比记录中的折后折扣采购销售比例。 | 否 | — |
| remark | 备注 | varchar(200) NULL | 月度采销比记录中的备注。 | 否 | — |
| sourceType | 来源类型 | enum('MANUAL','IMPORT') NOT NULL | 月度采销比记录中的来源类型。 | 否 | — |
| lastImportBatchId | 最近导入批次ID | varchar(191) NULL | 关联记录的最近导入批次ID。 | 否 | 普通：MonthlyPurchaseSalesRatio_lastImportBatchId_idx |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：MonthlyPurchaseSalesRatio_createdByUserId_fkey |
| createdByUsername | 创建人用户名 | varchar(50) NOT NULL | 月度采销比记录中的创建人用户名。 | 否 | — |
| createdByNameSnapshot | 创建人名称快照 | varchar(50) NOT NULL | 业务发生时固化的创建人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | 普通：MonthlyPurchaseSalesRatio_updatedByUserId_fkey |
| updatedByNameSnapshot | 更新人名称快照 | varchar(50) NULL | 业务发生时固化的更新人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## MonthlyPurchaseSalesSequence | 月度采销比编号序列

> 作用：维护月度采销比记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 月度采销比编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 月度采销比编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Notification | 通知

> 作用：存储系统通知内容、发布模式、时间和状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 通知记录中的记录编号。 | 否 | 唯一：Notification_recordNo_key |
| clientRequestId | 客户端请求ID | varchar(64) NOT NULL | 关联记录的客户端请求ID。 | 否 | 唯一：Notification_clientRequestId_key |
| title | 标题 | varchar(30) NOT NULL | 通知记录中的标题。 | 否 | — |
| content | 内容 | varchar(500) NOT NULL | 通知记录中的内容。 | 否 | — |
| releaseDate | 发布日期日期 | date NOT NULL | 发布日期日期对应的业务日期。 | 否 | — |
| releaseAt | 发布日期时间 | datetime(3) NOT NULL | 发布日期时间对应的时间点。 | 否 | 普通：Notification_status_releaseAt_idx（第2列） |
| publisherName | 发布人名称 | varchar(10) NOT NULL | 通知记录中的发布人名称。 | 否 | — |
| status | 状态 | enum('PENDING','PUBLISHED','STOPPED','FAILED') NOT NULL | 通知记录中的状态。 | 否 | 普通：Notification_status_releaseAt_idx |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：Notification_createdByUserId_createdAt_idx |
| createdByName | 创建人姓名 | varchar(30) NOT NULL | 通知记录中的创建人姓名。 | 否 | — |
| publishedAt | 发布时间 | datetime(3) NULL | 发布时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：Notification_createdByUserId_createdAt_idx（第2列） |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| showAfterLogin | 显示后登录 | tinyint(1) NOT NULL | 通知记录中的显示后登录。 | 否 | — |
| stoppedAt | 停止时间 | datetime(3) NULL | 停止时间对应的时间点。 | 否 | — |
| stoppedByName | 停止人名称 | varchar(30) NULL | 通知记录中的停止人名称。 | 否 | — |
| stoppedByUserId | 停止人用户ID | varchar(191) NULL | 关联记录的停止人用户ID。 | 否 | — |
| type | 类型 | enum('GENERAL','MID_MONTH_OFFLINE_MEETING','MONTHLY_ONLINE_MEETING','QUARTERLY_OFFLINE_MEETING') NOT NULL | 通知记录中的类型。 | 否 | — |
| publishMode | 发布模式 | enum('SCHEDULED','IMMEDIATE') NOT NULL | 通知记录中的发布模式。 | 否 | — |

## NotificationRecipient | 通知接收人

> 作用：存储通知与接收用户之间的关联及阅读确认状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| notificationId | 通知ID | varchar(191) NOT NULL | 关联记录的通知ID。 | 否 | 普通：NotificationRecipient_notificationId_readAt_idx；唯一：NotificationRecipient_notificationId_userId_key；普通：NotificationRecipient_userId_notificationId_idx（第2列） |
| userId | 用户ID | varchar(191) NULL | 关联记录的用户ID。 | 否 | 唯一：NotificationRecipient_notificationId_userId_key（第2列）；普通：NotificationRecipient_userId_acknowledgedAt_idx；普通：NotificationRecipient_userId_notificationId_idx |
| usernameSnapshot | 用户名快照 | varchar(30) NOT NULL | 业务发生时固化的用户名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| realNameSnapshot | 真实名称快照 | varchar(30) NOT NULL | 业务发生时固化的真实名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| roleSnapshot | 角色快照 | varchar(50) NOT NULL | 业务发生时固化的角色快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| acknowledgedAt | 确认时间 | datetime(3) NULL | 确认时间对应的时间点。 | 否 | 普通：NotificationRecipient_userId_acknowledgedAt_idx（第2列） |
| readAt | 阅读时间 | datetime(3) NULL | 阅读时间对应的时间点。 | 否 | 普通：NotificationRecipient_notificationId_readAt_idx（第2列） |

## NotificationSequence | 通知编号序列

> 作用：维护通知记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 通知编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 通知编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## OperationLog | 操作日志

> 作用：存储用户在系统中的页面操作、结果、明细和客户端信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| userId | 用户ID | varchar(191) NULL | 关联记录的用户ID。 | 否 | 普通：OperationLog_userId_fkey |
| page | 页面 | varchar(191) NOT NULL | 操作日志记录中的页面。 | 否 | 普通：OperationLog_page_idx |
| action | 操作动作 | varchar(191) NOT NULL | 操作日志记录中的操作动作。 | 否 | 普通：OperationLog_action_idx |
| result | 执行结果 | varchar(191) NOT NULL | 操作日志记录中的执行结果。 | 否 | 普通：OperationLog_result_idx |
| detail | 详细信息 | text NULL | 操作日志记录中的详细信息。 | 否 | — |
| ip | IP地址 | varchar(45) NULL | 操作日志记录中的IP地址。 | 否 | 普通：OperationLog_ip_idx |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：OperationLog_createdAt_idx |
| client | 客户端 | varchar(30) NULL | 操作日志记录中的客户端。 | 否 | 普通：OperationLog_client_idx |
| operationDate | 操作日期 | varchar(10) NULL | 操作日期对应的业务日期。 | 否 | 普通：OperationLog_operationDate_operationTime_idx |
| operationTime | 操作时间 | varchar(8) NULL | 操作日志记录中的操作时间。 | 否 | 普通：OperationLog_operationDate_operationTime_idx（第2列） |
| recordNo | 记录编号 | varchar(14) NULL | 操作日志记录中的记录编号。 | 否 | 唯一：OperationLog_recordNo_key |
| username | 登录账号 | varchar(50) NULL | 操作日志记录中的登录账号。 | 否 | 普通：OperationLog_username_idx |

## OperationLogSequence | 操作日志编号序列

> 作用：维护操作日志记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 操作日志编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 操作日志编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Personnel | 人员档案

> 作用：存储员工基础信息、岗位、薪资、社保及任职状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 人员档案记录中的记录编号。 | 否 | 唯一：Personnel_recordNo_key |
| name | 名称 | varchar(8) NOT NULL | 人员档案记录中的名称。 | 否 | — |
| phone | 手机号码 | varchar(11) NOT NULL | 人员档案记录中的手机号码。 | 否 | — |
| idNumber | ID号码 | varchar(18) NOT NULL | 人员档案记录中的ID号码。 | 否 | 唯一：Personnel_idNumber_key |
| birthday | 出生日期 | varchar(5) NULL | 人员档案记录中的出生日期。 | 否 | — |
| birthdayCalendar | 生日日历 | enum('LUNAR','SOLAR') NOT NULL | 人员档案记录中的生日日历。 | 否 | — |
| status | 状态 | enum('ACTIVE','RESIGNED') NOT NULL | 人员档案记录中的状态。 | 否 | 普通：Personnel_status_deletedAt_idx |
| hireDate | 入职日期 | datetime(3) NOT NULL | 入职日期对应的业务日期。 | 否 | 普通：Personnel_hireDate_idx |
| positionLevel | 岗位级别 | varchar(50) NOT NULL | 人员档案记录中的岗位级别。 | 否 | — |
| organization | 组织 | varchar(30) NOT NULL | 人员档案记录中的组织。 | 否 | 普通：Personnel_organization_idx |
| department | 部门 | varchar(50) NULL | 人员档案记录中的部门。 | 否 | — |
| storeId | 门店ID | varchar(191) NULL | 关联记录的门店ID。 | 否 | 普通：Personnel_storeId_idx |
| resignationDate | 离职日期 | datetime(3) NULL | 离职日期对应的业务日期。 | 否 | — |
| resignationReason | 离职原因 | varchar(200) NULL | 人员档案记录中的离职原因。 | 否 | — |
| contractSignDate | 合同签约日期 | datetime(3) NOT NULL | 合同签约日期对应的业务日期。 | 否 | — |
| contractYears | 合同年数 | int NULL | 人员档案记录中的合同年数。 | 否 | — |
| contractExpiryDate | 合同到期日期 | datetime(3) NOT NULL | 合同到期日期对应的业务日期。 | 否 | — |
| homeAddress | 家庭地址 | varchar(50) NOT NULL | 人员档案记录中的家庭地址。 | 否 | — |
| currentAddress | 当前地址 | varchar(50) NOT NULL | 人员档案记录中的当前地址。 | 否 | — |
| supplementaryMaterial | 补充材料 | varchar(50) NULL | 人员档案记录中的补充材料。 | 否 | — |
| baseSalary | 基础薪资 | decimal(12,2) NOT NULL | 人员档案记录中的基础薪资。 | 否 | — |
| socialSecurity | 社会社保 | enum('INSURED','AGREEMENT') NOT NULL | 人员档案记录中的社会社保。 | 否 | — |
| platformAccess | 平台权限 | enum('YES','NO') NULL | 人员档案记录中的平台权限。 | 否 | — |
| platformUserId | 平台用户ID | varchar(191) NULL | 关联记录的平台用户ID。 | 否 | 唯一：Personnel_platformUserId_key |
| remark | 备注 | varchar(50) NULL | 人员档案记录中的备注。 | 否 | — |
| version | 版本号 | int NOT NULL | 人员档案记录中的版本号。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：Personnel_createdByUserId_fkey |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | 普通：Personnel_status_deletedAt_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| laborCost | 人工成本 | decimal(12,2) NOT NULL | 人员档案记录中的人工成本。 | 否 | — |
| workdayHours | 工作日小时 | decimal(5,2) NULL | 人员档案记录中的工作日小时。 | 否 | — |

## PersonnelSequence | 人员档案编号序列

> 作用：维护人员档案记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 人员档案编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 人员档案编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## PositionHistory | 岗位调动历史

> 作用：存储人员岗位、门店或品牌调动的前后信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| personnelId | 人员ID | varchar(191) NOT NULL | 关联记录的人员ID。 | 否 | 普通：PositionHistory_personnelId_effectiveDate_idx |
| oldOrganization | 原组织 | varchar(30) NOT NULL | 岗位调动历史记录中的原组织。 | 否 | — |
| newOrganization | 新组织 | varchar(30) NOT NULL | 岗位调动历史记录中的新组织。 | 否 | — |
| oldStoreName | 原门店名称 | varchar(60) NOT NULL | 岗位调动历史记录中的原门店名称。 | 否 | — |
| newStoreName | 新门店名称 | varchar(60) NOT NULL | 岗位调动历史记录中的新门店名称。 | 否 | — |
| oldPositionLevel | 原岗位级别 | varchar(50) NOT NULL | 岗位调动历史记录中的原岗位级别。 | 否 | — |
| newPositionLevel | 新岗位级别 | varchar(50) NOT NULL | 岗位调动历史记录中的新岗位级别。 | 否 | — |
| effectiveDate | 生效日期 | datetime(3) NOT NULL | 生效日期对应的业务日期。 | 否 | 普通：PositionHistory_personnelId_effectiveDate_idx（第2列） |
| reason | 原因 | varchar(200) NOT NULL | 岗位调动历史记录中的原因。 | 否 | — |
| operatorId | 操作人ID | varchar(191) NULL | 关联记录的操作人ID。 | 否 | 普通：PositionHistory_operatorId_fkey |
| operatorName | 操作人名称 | varchar(30) NOT NULL | 岗位调动历史记录中的操作人名称。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## ProductCategorySalesDetail | 品类销售明细

> 作用：存储月度品类销售中各品类的销售额、占比和排序。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| monthlyRecordId | 月度记录ID | varchar(191) NOT NULL | 关联记录的月度记录ID。 | 否 | 唯一：ProductCategorySalesDetail_monthlyRecordId_categoryName_key；普通：ProductCategorySalesDetail_monthlyRecordId_sortOrder_idx |
| categoryName | 品类名称 | varchar(100) NOT NULL | 品类销售明细记录中的品类名称。 | 否 | 唯一：ProductCategorySalesDetail_monthlyRecordId_categoryName_key（第2列） |
| salesQuantity | 销售数量 | decimal(18,2) NOT NULL | 品类销售明细记录中的销售数量。 | 否 | — |
| salesQuantityRatio | 销售数量比例 | decimal(10,4) NULL | 品类销售明细记录中的销售数量比例。 | 否 | — |
| salesAmount | 销售金额 | decimal(18,2) NOT NULL | 品类销售明细记录中的销售金额。 | 否 | — |
| salesAmountRatio | 销售金额比例 | decimal(10,4) NULL | 品类销售明细记录中的销售金额比例。 | 否 | — |
| dishIncome | 菜品收入 | decimal(18,2) NOT NULL | 品类销售明细记录中的菜品收入。 | 否 | — |
| dishIncomeRatio | 菜品收入比例 | decimal(10,4) NULL | 品类销售明细记录中的菜品收入比例。 | 否 | — |
| dishDiscount | 菜品折扣 | decimal(18,2) NOT NULL | 品类销售明细记录中的菜品折扣。 | 否 | — |
| dishDiscountRatio | 菜品折扣比例 | decimal(10,4) NULL | 品类销售明细记录中的菜品折扣比例。 | 否 | — |
| sortOrder | 排序序号 | int NOT NULL | 品类销售明细记录中的排序序号。 | 否 | 普通：ProductCategorySalesDetail_monthlyRecordId_sortOrder_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## ProductCategorySalesImportBatch | 品类销售导入批次

> 作用：存储品类销售批量导入任务及处理统计。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| batchNo | 批次编号 | varchar(24) NOT NULL | 品类销售导入批次记录中的批次编号。 | 否 | 唯一：ProductCategorySalesImportBatch_batchNo_key |
| fileName | 文件名称 | varchar(255) NOT NULL | 品类销售导入批次记录中的文件名称。 | 否 | — |
| periodStart | 周期开始 | date NOT NULL | 品类销售导入批次记录中的周期开始。 | 否 | — |
| periodEnd | 周期结束 | date NOT NULL | 品类销售导入批次记录中的周期结束。 | 否 | — |
| year | 年份 | smallint NOT NULL | 品类销售导入批次记录中的年份。 | 否 | 普通：ProductCategorySalesImportBatch_year_month_createdAt_idx |
| month | 月份 | tinyint NOT NULL | 品类销售导入批次记录中的月份。 | 否 | 普通：ProductCategorySalesImportBatch_year_month_createdAt_idx（第2列） |
| rawRowCount | 原始行数量 | int NOT NULL | 品类销售导入批次记录中的原始行数量。 | 否 | — |
| storeCount | 门店数量 | int NOT NULL | 品类销售导入批次记录中的门店数量。 | 否 | — |
| insertedCount | 新增数量 | int NOT NULL | 品类销售导入批次记录中的新增数量。 | 否 | — |
| updatedCount | 更新数量 | int NOT NULL | 品类销售导入批次记录中的更新数量。 | 否 | — |
| skippedCount | 跳过数量 | int NOT NULL | 品类销售导入批次记录中的跳过数量。 | 否 | — |
| failedCount | 失败数量 | int NOT NULL | 品类销售导入批次记录中的失败数量。 | 否 | — |
| operatorUserId | 操作人用户ID | varchar(191) NULL | 关联记录的操作人用户ID。 | 否 | 普通：ProductCategorySalesImportBatch_operatorUserId_createdAt_idx |
| operatorNameSnapshot | 操作人名称快照 | varchar(50) NOT NULL | 业务发生时固化的操作人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：ProductCategorySalesImportBatch_operatorUserId_createdAt_idx（第2列）；普通：ProductCategorySalesImportBatch_year_month_createdAt_idx（第3列） |

## ProductCategorySalesImportFailure | 品类销售导入失败明细

> 作用：存储品类销售导入失败的行号、原始数据和失败原因。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| batchId | 批次ID | varchar(191) NOT NULL | 关联记录的批次ID。 | 否 | 普通：ProductCategorySalesImportFailure_batchId_createdAt_idx |
| storeAlias | 门店别名 | varchar(100) NULL | 品类销售导入失败明细记录中的门店别名。 | 否 | — |
| failureReason | 失败原因 | varchar(255) NOT NULL | 品类销售导入失败明细记录中的失败原因。 | 否 | — |
| excelRows | Excel行集合 | json NOT NULL | 以 JSON 结构保存的Excel行集合。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：ProductCategorySalesImportFailure_batchId_createdAt_idx（第2列） |

## ProductCategorySalesMonthly | 品类月度销售

> 作用：存储门店月度品类销售汇总及来源信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 品类月度销售记录中的记录编号。 | 否 | 唯一：ProductCategorySalesMonthly_recordNo_key |
| year | 年份 | smallint NOT NULL | 品类月度销售记录中的年份。 | 否 | 普通：ProductCategorySalesMonthly_brandCode_year_month_idx（第2列）；唯一：ProductCategorySalesMonthly_storeId_year_month_key（第2列）；普通：ProductCategorySalesMonthly_year_month_storeNameSnapshot_idx |
| month | 月份 | tinyint NOT NULL | 品类月度销售记录中的月份。 | 否 | 普通：ProductCategorySalesMonthly_brandCode_year_month_idx（第3列）；唯一：ProductCategorySalesMonthly_storeId_year_month_key（第3列）；普通：ProductCategorySalesMonthly_year_month_storeNameSnapshot_idx（第2列） |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：ProductCategorySalesMonthly_storeId_year_month_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | 普通：ProductCategorySalesMonthly_year_month_storeNameSnapshot_idx（第3列） |
| aliasId | 别名ID | varchar(191) NOT NULL | 关联记录的别名ID。 | 否 | — |
| meituanAliasSnapshot | 美团别名快照 | varchar(100) NOT NULL | 业务发生时固化的美团别名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandCode | 品牌编码 | varchar(50) NOT NULL | 品类月度销售记录中的品牌编码。 | 否 | 普通：ProductCategorySalesMonthly_brandCode_year_month_idx |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| citySnapshot | 城市快照 | varchar(100) NOT NULL | 业务发生时固化的城市快照，避免源数据后续变化影响历史记录。 | 否 | — |
| totalSalesQuantity | 总计销售数量 | decimal(18,2) NOT NULL | 品类月度销售记录中的总计销售数量。 | 否 | — |
| totalSalesAmount | 总计销售金额 | decimal(18,2) NOT NULL | 品类月度销售记录中的总计销售金额。 | 否 | — |
| lastImportBatchId | 最近导入批次ID | varchar(191) NULL | 关联记录的最近导入批次ID。 | 否 | 普通：ProductCategorySalesMonthly_lastImportBatchId_idx |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：ProductCategorySalesMonthly_createdByUserId_fkey |
| createdByUsername | 创建人用户名 | varchar(50) NOT NULL | 品类月度销售记录中的创建人用户名。 | 否 | — |
| createdByNameSnapshot | 创建人名称快照 | varchar(50) NOT NULL | 业务发生时固化的创建人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | 普通：ProductCategorySalesMonthly_updatedByUserId_fkey |
| updatedByNameSnapshot | 更新人名称快照 | varchar(50) NULL | 业务发生时固化的更新人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## ProductCategorySalesSequence | 品类销售编号序列

> 作用：维护品类月度销售记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 品类销售编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 品类销售编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## R2StorageConfig | R2存储空间配置

> 作用：存储 Cloudflare R2 存储桶连接参数、加密凭证和状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | R2存储空间配置记录中的记录编号。 | 否 | 唯一：R2StorageConfig_recordNo_key |
| name | 名称 | varchar(20) NOT NULL | R2存储空间配置记录中的名称。 | 否 | — |
| accountId | Cloudflare账户ID | varchar(50) NOT NULL | 关联记录的Cloudflare账户ID。 | 否 | 普通：R2StorageConfig_accountId_bucketName_idx |
| accessKeyIdEncrypted | 加密访问密钥ID | text NOT NULL | 加密保存的 R2 API Access Key ID。 | 否 | — |
| secretAccessKeyEncrypted | 加密访问密钥 | text NOT NULL | 加密保存的 R2 API Secret Access Key。 | 否 | — |
| bucketName | 存储桶名称 | varchar(50) NOT NULL | R2存储空间配置记录中的存储桶名称。 | 否 | 普通：R2StorageConfig_accountId_bucketName_idx（第2列） |
| endpoint | 访问端点 | varchar(150) NOT NULL | R2存储空间配置记录中的访问端点。 | 否 | — |
| signedUrlExpireSeconds | 签名链接有效秒数 | int NOT NULL | R2存储空间配置记录中的签名链接有效秒数。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | R2存储空间配置记录中的状态。 | 否 | 普通：R2StorageConfig_status_idx |
| version | 版本号 | int NOT NULL | R2存储空间配置记录中的版本号。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：R2StorageConfig_createdByUserId_fkey |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：R2StorageConfig_createdAt_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## R2StorageReference | R2存储空间引用

> 作用：存储业务模块对 R2 存储配置的占用关系，防止误删。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| r2ConfigId | R2存储配置ID | varchar(191) NOT NULL | 关联记录的R2存储配置ID。 | 否 | 普通：R2StorageReference_r2ConfigId_idx |
| businessType | 业务类型 | varchar(50) NOT NULL | R2存储空间引用记录中的业务类型。 | 否 | 唯一：R2StorageReference_businessType_businessId_key |
| businessId | 业务记录ID | varchar(100) NOT NULL | 关联记录的业务记录ID。 | 否 | 唯一：R2StorageReference_businessType_businessId_key（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## R2StorageTest | R2连接测试

> 作用：存储 R2 存储桶连接测试文件及测试结果。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| r2ConfigId | R2存储配置ID | varchar(191) NOT NULL | 关联记录的R2存储配置ID。 | 否 | 唯一：R2StorageTest_r2ConfigId_fileName_key |
| fileName | 文件名称 | varchar(15) NOT NULL | R2连接测试记录中的文件名称。 | 否 | 唯一：R2StorageTest_r2ConfigId_fileName_key（第2列） |
| status | 状态 | enum('PENDING','SUCCESS','FAILED') NOT NULL | R2连接测试记录中的状态。 | 否 | — |
| errorCode | 错误编码 | varchar(50) NULL | R2连接测试记录中的错误编码。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：R2StorageTest_createdByUserId_fkey |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：R2StorageTest_createdAt_idx |
| completedAt | 完成时间 | datetime(3) NULL | 完成时间对应的时间点。 | 否 | — |

## ResearchTemplate | 调研模板

> 作用：存储门店调研、竞品调研等模板配置及版本信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 调研模板记录中的记录编号。 | 否 | 唯一：ResearchTemplate_recordNo_key |
| templateType | 模板类型 | varchar(100) NOT NULL | 调研模板记录中的模板类型。 | 否 | 普通：ResearchTemplate_templateType_idx |
| configFileName | 配置文件名 | varchar(25) NOT NULL | 调研模板记录中的配置文件名。 | 否 | 唯一：ResearchTemplate_configFileName_key |
| detailText | 明细文本 | longtext NOT NULL | 调研模板记录中的明细文本。 | 否 | — |
| itemCount | 项目数量 | int NOT NULL | 调研模板记录中的项目数量。 | 否 | — |
| remark | 备注 | varchar(50) NULL | 调研模板记录中的备注。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 调研模板记录中的状态。 | 否 | 普通：ResearchTemplate_status_idx |
| configVersion | 配置版本 | int NOT NULL | 调研模板记录中的配置版本。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：ResearchTemplate_createdByUserId_fkey |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 调研模板记录中的创建人姓名。 | 否 | — |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：ResearchTemplate_createdAt_idx |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## ResearchTemplateBrand | 调研模板品牌

> 作用：存储调研模板与适用品牌之间的关联关系。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| researchTemplateId | 调研模板ID | varchar(191) NOT NULL | 关联记录的调研模板ID。 | 否 | 唯一：ResearchTemplateBrand_researchTemplateId_brandValue_key |
| brandValue | 品牌值 | varchar(100) NOT NULL | 调研模板品牌记录中的品牌值。 | 否 | 普通：ResearchTemplateBrand_brandValue_idx；唯一：ResearchTemplateBrand_researchTemplateId_brandValue_key（第2列） |

## ResearchTemplateRecord | 调研提交记录

> 作用：存储用户按调研模板提交的门店调研内容和模板快照。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| researchTemplateId | 调研模板ID | varchar(191) NOT NULL | 关联记录的调研模板ID。 | 否 | 普通：ResearchTemplateRecord_researchTemplateId_idx |
| configVersion | 配置版本 | int NOT NULL | 调研提交记录记录中的配置版本。 | 否 | — |
| configSnapshot | 配置快照 | json NOT NULL | 业务发生时固化的配置 JSON，避免后续配置变化影响历史记录。 | 否 | — |
| resultSnapshot | 结果快照 | json NOT NULL | 业务发生时固化的结果快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 否 | — |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| recordNo | 记录编号 | varchar(12) NOT NULL | 调研提交记录记录中的记录编号。 | 否 | 唯一：ResearchTemplateRecord_recordNo_key |
| researchMonth | 调研月份 | varchar(7) NOT NULL | 调研提交记录记录中的调研月份。 | 否 | 普通：ResearchTemplateRecord_researchMonth_templateType_idx；唯一：ResearchTemplateRecord_storeId_researchMonth_templateType_key（第2列） |
| researchTemplateRecordNo | 调研模板记录编号 | varchar(12) NOT NULL | 调研提交记录记录中的调研模板记录编号。 | 否 | — |
| status | 状态 | varchar(20) NOT NULL | 调研提交记录记录中的状态。 | 否 | — |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：ResearchTemplateRecord_storeId_researchMonth_templateType_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| submittedAt | 提交时间 | datetime NOT NULL | 提交时间对应的时间点。 | 否 | — |
| submittedByUserId | 提交人用户ID | varchar(191) NOT NULL | 关联记录的提交人用户ID。 | 否 | 普通：ResearchTemplateRecord_submittedByUserId_idx |
| submittedUsername | 提交用户名 | varchar(50) NOT NULL | 调研提交记录记录中的提交用户名。 | 否 | — |
| supervisorRealName | 督导真实名称 | varchar(50) NOT NULL | 调研提交记录记录中的督导真实名称。 | 否 | — |
| templateType | 模板类型 | varchar(100) NOT NULL | 调研提交记录记录中的模板类型。 | 否 | 普通：ResearchTemplateRecord_researchMonth_templateType_idx（第2列）；唯一：ResearchTemplateRecord_storeId_researchMonth_templateType_key（第3列） |
| storeManagerNameSnapshot | 门店负责人名称快照 | varchar(50) NULL | 业务发生时固化的门店负责人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |

## RestDay | 休息日

> 作用：存储品牌或门店年度休息日、节假日类型和备注。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(12) NOT NULL | 休息日记录中的记录编号。 | 否 | 唯一：RestDay_recordNo_key |
| year | 年份 | smallint NOT NULL | 休息日记录中的年份。 | 否 | 唯一：RestDay_year_holidayType_startDate_endDate_key；普通：RestDay_year_startDate_idx |
| holidayType | 节假日类型 | enum('NEW_YEAR_DAY','SPRING_FESTIVAL','QINGMING_FESTIVAL','LABOR_DAY','DRAGON_BOAT_FESTIVAL','MID_AUTUMN_FESTIVAL','NATIONAL_DAY','OTHER') NOT NULL | 休息日记录中的节假日类型。 | 否 | 唯一：RestDay_year_holidayType_startDate_endDate_key（第2列） |
| holidayNameSnapshot | 节假日名称快照 | varchar(10) NOT NULL | 业务发生时固化的节假日名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| startDate | 开始日期 | date NOT NULL | 开始日期对应的业务日期。 | 否 | 普通：RestDay_startDate_endDate_idx；唯一：RestDay_year_holidayType_startDate_endDate_key（第3列）；普通：RestDay_year_startDate_idx（第2列） |
| endDate | 结束日期 | date NOT NULL | 结束日期对应的业务日期。 | 否 | 普通：RestDay_startDate_endDate_idx（第2列）；唯一：RestDay_year_holidayType_startDate_endDate_key（第4列） |
| remark | 备注 | varchar(50) NULL | 休息日记录中的备注。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：RestDay_createdByUserId_createdAt_idx |
| createdByUsername | 创建人用户名 | varchar(50) NOT NULL | 休息日记录中的创建人用户名。 | 否 | — |
| createdByNameSnapshot | 创建人名称快照 | varchar(50) NOT NULL | 业务发生时固化的创建人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| updatedByUserId | 更新人用户ID | varchar(191) NULL | 关联记录的更新人用户ID。 | 否 | 普通：RestDay_updatedByUserId_updatedAt_idx |
| updatedByNameSnapshot | 更新人名称快照 | varchar(50) NULL | 业务发生时固化的更新人名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| version | 版本号 | int NOT NULL | 休息日记录中的版本号。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：RestDay_createdByUserId_createdAt_idx（第2列） |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | 普通：RestDay_updatedByUserId_updatedAt_idx（第2列） |

## RestDaySequence | 休息日编号序列

> 作用：维护休息日记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 休息日编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 休息日编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## RestDayYearLock | 休息日年度锁

> 作用：存储年度休息日生成或维护时使用的并发锁。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| year | 年份 | smallint NOT NULL | 休息日年度锁记录中的年份。 | 是 | 主键：PRIMARY |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Role | 角色

> 作用：存储平台角色、角色类型、启停状态及功能权限集合。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| code | 编码 | varchar(191) NOT NULL | 角色记录中的编码。 | 否 | 唯一：Role_code_key |
| name | 名称 | varchar(191) NOT NULL | 角色记录中的名称。 | 否 | 唯一：Role_name_key |
| type | 类型 | varchar(191) NOT NULL | 角色记录中的类型。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 角色记录中的状态。 | 否 | — |
| permissions | 权限集合 | json NOT NULL | 以 JSON 数组保存角色拥有的页面和操作权限标识。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## SalaryHistory | 薪资调整历史

> 作用：存储人员工资调整前后数值、生效日期和操作人。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| personnelId | 人员ID | varchar(191) NOT NULL | 关联记录的人员ID。 | 否 | 普通：SalaryHistory_personnelId_effectiveDate_idx |
| oldSalary | 原薪资 | decimal(12,2) NOT NULL | 薪资调整历史记录中的原薪资。 | 否 | — |
| newSalary | 新薪资 | decimal(12,2) NOT NULL | 薪资调整历史记录中的新薪资。 | 否 | — |
| effectiveDate | 生效日期 | datetime(3) NOT NULL | 生效日期对应的业务日期。 | 否 | 普通：SalaryHistory_personnelId_effectiveDate_idx（第2列） |
| reason | 原因 | varchar(200) NOT NULL | 薪资调整历史记录中的原因。 | 否 | — |
| operatorId | 操作人ID | varchar(191) NULL | 关联记录的操作人ID。 | 否 | 普通：SalaryHistory_operatorId_fkey |
| operatorName | 操作人名称 | varchar(30) NOT NULL | 薪资调整历史记录中的操作人名称。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## ScheduledJobRun | 通用定时任务运行记录

> 作用：存储各类定时作业每日执行状态、结果和错误信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| jobType | 作业类型 | varchar(50) NOT NULL | 通用定时任务运行记录记录中的作业类型。 | 否 | 唯一：ScheduledJobRun_jobType_executionDate_key |
| executionDate | 执行日期 | date NOT NULL | 执行日期对应的业务日期。 | 否 | 唯一：ScheduledJobRun_jobType_executionDate_key（第2列） |
| scheduledTime | 计划执行时间 | varchar(5) NOT NULL | 通用定时任务运行记录记录中的计划执行时间。 | 否 | — |
| status | 状态 | varchar(20) NOT NULL | 通用定时任务运行记录记录中的状态。 | 否 | 普通：ScheduledJobRun_status_startedAt_idx |
| startedAt | 开始时间 | datetime(3) NOT NULL | 开始时间对应的时间点。 | 否 | 普通：ScheduledJobRun_status_startedAt_idx（第2列） |
| completedAt | 完成时间 | datetime(3) NULL | 完成时间对应的时间点。 | 否 | — |
| result | 执行结果 | json NULL | 以 JSON 结构保存的执行结果。 | 否 | — |
| error | 错误信息 | text NULL | 通用定时任务运行记录记录中的错误信息。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Store | 门店

> 作用：存储门店档案、所属品牌、经营状态、地址及人员配置。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| recordNo | 记录编号 | varchar(191) NOT NULL | 门店记录中的记录编号。 | 否 | 唯一：Store_recordNo_key |
| contractId | 合同ID | varchar(191) NULL | 关联记录的合同ID。 | 否 | 唯一：Store_contractId_key |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 否 | 普通：Store_brandId_fkey |
| name | 名称 | varchar(191) NOT NULL | 门店记录中的名称。 | 否 | — |
| operationStatus | 操作状态 | enum('PREPARING','TRIAL','OPENING','TERMINATING','SUSPENDED','CLOSED') NOT NULL | 门店记录中的操作状态。 | 否 | — |
| region | 区域 | varchar(191) NULL | 门店记录中的区域。 | 否 | — |
| supervisorUserId | 督导用户ID | varchar(191) NULL | 关联记录的督导用户ID。 | 否 | 普通：Store_supervisorUserId_idx |
| supervisorName | 督导名称 | varchar(191) NULL | 门店记录中的督导名称。 | 否 | — |
| province | 省份 | varchar(191) NULL | 门店记录中的省份。 | 否 | — |
| city | 城市 | varchar(191) NULL | 门店记录中的城市。 | 否 | — |
| district | 区县 | varchar(191) NULL | 门店记录中的区县。 | 否 | — |
| address | 地址 | varchar(191) NULL | 门店记录中的地址。 | 否 | — |
| cooperationType | 合作类型 | enum('DIRECT','FRANCHISE') NOT NULL | 门店记录中的合作类型。 | 否 | — |
| startDate | 开始日期 | datetime(3) NULL | 开始日期对应的业务日期。 | 否 | — |
| endDate | 结束日期 | datetime(3) NULL | 结束日期对应的业务日期。 | 否 | — |
| businessDistrict | 业务区县 | varchar(191) NULL | 门店记录中的业务区县。 | 否 | — |
| locationType | 地点类型 | varchar(191) NULL | 门店记录中的地点类型。 | 否 | — |
| trialOpenDate | 试营业开台日期 | datetime(3) NULL | 试营业开台日期对应的业务日期。 | 否 | — |
| formalOpenDate | 正式开台日期 | datetime(3) NULL | 正式开台日期对应的业务日期。 | 否 | — |
| workdayHours | 工作日小时 | decimal(5,2) NULL | 门店记录中的工作日小时。 | 否 | — |
| managerUserId | 负责人用户ID | varchar(191) NULL | 关联记录的负责人用户ID。 | 否 | — |
| managerName | 负责人名称 | varchar(191) NULL | 门店记录中的负责人名称。 | 否 | — |
| chefUserId | 厨师长用户ID | varchar(191) NULL | 关联记录的厨师长用户ID。 | 否 | — |
| chefName | 厨师长名称 | varchar(191) NULL | 门店记录中的厨师长名称。 | 否 | — |
| douyinLaikeName | 抖音来客名称 | varchar(50) NULL | 门店记录中的抖音来客名称。 | 否 | — |
| kuaishouName | 快手名称 | varchar(50) NULL | 门店记录中的快手名称。 | 否 | — |
| meituanManagerName | 美团负责人名称 | varchar(50) NULL | 门店记录中的美团负责人名称。 | 否 | — |
| meituanBusinessName | 美团业务名称 | varchar(50) NULL | 门店记录中的美团业务名称。 | 否 | — |
| ownerName | 业主名称 | varchar(191) NULL | 门店记录中的业主名称。 | 否 | — |
| ownerPhone | 业主手机 | varchar(191) NULL | 门店记录中的业主手机。 | 否 | — |
| ownerIdNumber | 业主ID号码 | varchar(191) NULL | 门店记录中的业主ID号码。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## StoreCost | 门店成本

> 作用：存储门店月度固定成本、变动成本和成本备注。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：StoreCost_storeId_key |
| storeRent | 门店租金 | decimal(18,2) NOT NULL | 门店成本记录中的门店租金。 | 否 | — |
| employeeWages | 员工工资 | decimal(18,2) NOT NULL | 门店成本记录中的员工工资。 | 否 | — |
| dormitoryRent | 宿舍租金 | decimal(18,2) NOT NULL | 门店成本记录中的宿舍租金。 | 否 | — |
| propertyFee | 物业费用 | decimal(18,2) NOT NULL | 门店成本记录中的物业费用。 | 否 | — |
| utilitiesFee | 水电费用 | decimal(18,2) NOT NULL | 门店成本记录中的水电费用。 | 否 | — |
| otherCost | 其他成本 | decimal(18,2) NOT NULL | 门店成本记录中的其他成本。 | 否 | — |
| ratioCoefficient | 比例系数 | decimal(10,4) NOT NULL | 门店成本记录中的比例系数。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## StoreDailyTarget | 门店每日目标

> 作用：存储月度目标拆分到每天的营业额目标。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| monthlyTargetId | 月度目标ID | varchar(191) NOT NULL | 关联记录的月度目标ID。 | 否 | 普通：StoreDailyTarget_monthlyTargetId_targetDate_idx |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：StoreDailyTarget_storeId_targetDate_key |
| targetDate | 目标日期 | date NOT NULL | 目标日期对应的业务日期。 | 否 | 普通：StoreDailyTarget_monthlyTargetId_targetDate_idx（第2列）；唯一：StoreDailyTarget_storeId_targetDate_key（第2列） |
| targetAmount | 目标金额 | decimal(18,2) NOT NULL | 门店每日目标记录中的目标金额。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## StoreMonthlyTarget | 门店月度目标

> 作用：存储门店月度营业目标、计算参数和目标状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| sourceActualRevenueId | 来源实际营业额ID | varchar(191) NOT NULL | 关联记录的来源实际营业额ID。 | 否 | 唯一：StoreMonthlyTarget_sourceActualRevenueId_key |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 唯一：StoreMonthlyTarget_storeId_targetMonth_key |
| targetMonth | 目标月份 | varchar(7) NOT NULL | 门店月度目标记录中的目标月份。 | 否 | 普通：StoreMonthlyTarget_brandId_targetMonth_idx（第2列）；唯一：StoreMonthlyTarget_storeId_targetMonth_key（第2列）；普通：StoreMonthlyTarget_targetMonth_storeNameSnapshot_idx |
| targetAmount | 目标金额 | decimal(18,2) NOT NULL | 门店月度目标记录中的目标金额。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：StoreMonthlyTarget_createdByUserId_fkey |
| createdByName | 创建人姓名 | varchar(50) NOT NULL | 门店月度目标记录中的创建人姓名。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| recordNo | 记录编号 | varchar(12) NOT NULL | 门店月度目标记录中的记录编号。 | 否 | 唯一：StoreMonthlyTarget_recordNo_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | 普通：StoreMonthlyTarget_targetMonth_storeNameSnapshot_idx（第2列） |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 否 | 普通：StoreMonthlyTarget_brandId_targetMonth_idx |
| brandCode | 品牌编码 | varchar(50) NOT NULL | 门店月度目标记录中的品牌编码。 | 否 | — |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| regionNameSnapshot | 区域名称快照 | varchar(100) NULL | 业务发生时固化的区域名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| previousActualMonth | 上期实际月份 | varchar(7) NOT NULL | 门店月度目标记录中的上期实际月份。 | 否 | — |
| previousActualRevenueSnapshot | 上期实际营业额快照 | decimal(18,2) NOT NULL | 业务发生时固化的上期实际营业额快照，避免源数据后续变化影响历史记录。 | 否 | — |
| dailyTargetStatus | 每日目标状态 | varchar(20) NOT NULL | 门店月度目标记录中的每日目标状态。 | 否 | — |
| remark | 备注 | varchar(200) NULL | 门店月度目标记录中的备注。 | 否 | — |
| sourceType | 来源类型 | varchar(30) NOT NULL | 门店月度目标记录中的来源类型。 | 否 | — |
| createdByUsername | 创建人用户名 | varchar(50) NOT NULL | 门店月度目标记录中的创建人用户名。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## StoreMonthlyTargetSequence | 月度目标编号序列

> 作用：维护门店月度目标记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 月度目标编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 月度目标编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## Task | 任务设置

> 作用：存储周期或临时任务的执行规则、表单配置和适用范围。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| title | 标题 | varchar(191) NOT NULL | 任务设置记录中的标题。 | 否 | — |
| type | 类型 | enum('DAILY','WEEKLY','MONTHLY','TEMPORARY') NOT NULL | 任务设置记录中的类型。 | 否 | — |
| targetType | 目标类型 | enum('STORE','STORE_EMPLOYEE') NOT NULL | 任务设置记录中的目标类型。 | 否 | — |
| specifiedTargets | 指定目标集合 | json NULL | 以 JSON 结构保存的指定目标集合。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 任务设置记录中的状态。 | 否 | — |
| description | 说明 | text NULL | 任务设置记录中的说明。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | 普通：Task_createdAt_idx |
| configFileName | 配置文件名 | varchar(191) NULL | 任务设置记录中的配置文件名。 | 否 | 唯一：Task_configFileName_key |
| configVersion | 配置版本 | int NOT NULL | 任务设置记录中的配置版本。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：Task_createdByUserId_fkey |
| deletedAt | 删除时间 | datetime(3) NULL | 删除时间对应的时间点。 | 否 | — |
| executionDays | 执行天数 | json NULL | 以 JSON 结构保存的执行天数。 | 否 | — |
| executorRoleId | 执行人角色ID | varchar(191) NULL | 关联记录的执行人角色ID。 | 否 | 普通：Task_executorRoleId_idx |
| includeCompletionRate | 是否计入完成率 | tinyint(1) NOT NULL | 标识是否计入完成率。 | 否 | — |
| recordNo | 记录编号 | varchar(191) NULL | 任务设置记录中的记录编号。 | 否 | 唯一：Task_recordNo_key |
| submitItems | 提交项目集合 | json NULL | 以 JSON 结构保存的提交项目集合。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| r2StorageId | R2存储配置ID | varchar(191) NULL | 关联记录的R2存储配置ID。 | 否 | 普通：Task_r2StorageId_idx |
| deadlineDayOffset | 截止日期偏移 | int NOT NULL | 任务设置记录中的截止日期偏移。 | 否 | — |
| deadlineTime | 截止时间 | varchar(5) NOT NULL | 任务设置记录中的截止时间。 | 否 | — |
| monthlyExecutionDay | 月度执行日期 | varchar(10) NULL | 任务设置记录中的月度执行日期。 | 否 | — |
| weeklyExecutionDay | 每周执行日期 | varchar(3) NULL | 任务设置记录中的每周执行日期。 | 否 | — |

## TaskAiAnalysis | 任务智能分析

> 作用：存储任务提交的 AI 分析汇总、结论和人工复核信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY；普通：TaskAiAnalysis_analyzedAt_id_idx（第2列） |
| recordNo | 记录编号 | varchar(12) NOT NULL | 任务智能分析记录中的记录编号。 | 否 | 唯一：TaskAiAnalysis_recordNo_key |
| taskRecordId | 任务实例ID | varchar(191) NOT NULL | 关联记录的任务实例ID。 | 否 | 唯一：TaskAiAnalysis_taskRecordId_key |
| taskRecordNo | 任务记录编号 | varchar(14) NOT NULL | 任务智能分析记录中的任务记录编号。 | 否 | — |
| taskSettingId | 任务设置ID | varchar(191) NOT NULL | 关联记录的任务设置ID。 | 否 | 普通：TaskAiAnalysis_taskSettingId_idx |
| taskNameSnapshot | 任务名称快照 | varchar(100) NOT NULL | 业务发生时固化的任务名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandIdSnapshot | 品牌ID快照 | varchar(191) NULL | 业务发生时固化的品牌ID快照，避免源数据后续变化影响历史记录。 | 否 | 普通：TaskAiAnalysis_brandIdSnapshot_storeIdSnapshot_idx |
| brandCodeSnapshot | 品牌编码快照 | varchar(50) NULL | 业务发生时固化的品牌编码快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| storeIdSnapshot | 门店ID快照 | varchar(191) NOT NULL | 业务发生时固化的门店ID快照，避免源数据后续变化影响历史记录。 | 否 | 普通：TaskAiAnalysis_brandIdSnapshot_storeIdSnapshot_idx（第2列） |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| executorUserIdSnapshot | 执行人用户ID快照 | varchar(191) NULL | 业务发生时固化的执行人用户ID快照，避免源数据后续变化影响历史记录。 | 否 | — |
| executorUsernameSnapshot | 执行人用户名快照 | varchar(50) NULL | 业务发生时固化的执行人用户名快照，避免源数据后续变化影响历史记录。 | 否 | — |
| executorNameSnapshot | 执行人名称快照 | varchar(50) NOT NULL | 业务发生时固化的执行人名称快照，避免源数据后续变化影响历史记录。 | 否 | 普通：TaskAiAnalysis_executorNameSnapshot_idx |
| executorRoleSnapshot | 执行人角色快照 | varchar(50) NULL | 业务发生时固化的执行人角色快照，避免源数据后续变化影响历史记录。 | 否 | — |
| taskExecutionDate | 任务执行日期 | date NOT NULL | 任务执行日期对应的业务日期。 | 否 | 普通：TaskAiAnalysis_taskExecutionDate_idx |
| taskSubmittedAt | 任务提交时间 | datetime(3) NOT NULL | 任务提交时间对应的时间点。 | 否 | — |
| taskItemCount | 任务项目数量 | int NOT NULL | 任务智能分析记录中的任务项目数量。 | 否 | — |
| analysisTypeSummary | 分析类型汇总 | varchar(500) NOT NULL | 任务智能分析记录中的分析类型汇总。 | 否 | — |
| analysisResultSummary | 分析结果汇总 | longtext NOT NULL | 任务智能分析记录中的分析结果汇总。 | 否 | — |
| analyzedByUserId | 分析人用户ID | varchar(191) NULL | 关联记录的分析人用户ID。 | 否 | 普通：TaskAiAnalysis_analyzedByUserId_idx |
| analyzedByName | 分析人名称 | varchar(50) NOT NULL | 任务智能分析记录中的分析人名称。 | 否 | — |
| analyzedAt | 分析时间 | datetime(3) NOT NULL | 分析时间对应的时间点。 | 否 | 普通：TaskAiAnalysis_analyzedAt_id_idx |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## TaskAiAnalysisItem | 任务智能分析明细

> 作用：存储任务中每个分析项的输入、输出和合格判断。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| analysisId | 分析ID | varchar(191) NOT NULL | 关联记录的分析ID。 | 否 | 普通：TaskAiAnalysisItem_analysisId_idx；唯一：TaskAiAnalysisItem_analysisId_sortOrder_key |
| taskItemIdSnapshot | 任务项目ID快照 | varchar(191) NOT NULL | 业务发生时固化的任务项目ID快照，避免源数据后续变化影响历史记录。 | 否 | — |
| taskItemNameSnapshot | 任务项目名称快照 | varchar(100) NOT NULL | 业务发生时固化的任务项目名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| hintSnapshot | 提示快照 | text NULL | 业务发生时固化的提示快照，避免源数据后续变化影响历史记录。 | 否 | — |
| analysisTypeCodeSnapshot | 分析类型编码快照 | varchar(200) NOT NULL | 业务发生时固化的分析类型编码快照，避免源数据后续变化影响历史记录。 | 否 | — |
| analysisTypeNameSnapshot | 分析类型名称快照 | varchar(200) NOT NULL | 业务发生时固化的分析类型名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| analysisPromptSnapshot | 分析提示词快照 | text NOT NULL | 业务发生时固化的分析提示词快照，避免源数据后续变化影响历史记录。 | 否 | — |
| analysisResult | 分析结果 | longtext NOT NULL | 任务智能分析明细记录中的分析结果。 | 否 | — |
| isQualified | 是否合格 | tinyint(1) NULL | 标识是否合格。 | 否 | — |
| unqualifiedReason | 不合格原因 | longtext NULL | 任务智能分析明细记录中的不合格原因。 | 否 | — |
| analyzedAt | 分析时间 | datetime(3) NOT NULL | 分析时间对应的时间点。 | 否 | — |
| sortOrder | 排序序号 | int NOT NULL | 任务智能分析明细记录中的排序序号。 | 否 | 唯一：TaskAiAnalysisItem_analysisId_sortOrder_key（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## TaskAiAnalysisSequence | 智能分析编号序列

> 作用：维护任务智能分析记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 智能分析编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 智能分析编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## TaskAttachment | 任务附件

> 作用：存储任务执行过程中上传到 R2 的附件元数据。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| taskRecordId | 任务实例ID | varchar(191) NOT NULL | 关联记录的任务实例ID。 | 否 | 普通：TaskAttachment_taskRecordId_itemIndex_uploaderUserId_idx |
| itemIndex | 项目索引 | int NOT NULL | 任务附件记录中的项目索引。 | 否 | 普通：TaskAttachment_taskRecordId_itemIndex_uploaderUserId_idx（第2列） |
| uploaderUserId | 上传人用户ID | varchar(191) NOT NULL | 关联记录的上传人用户ID。 | 否 | 普通：TaskAttachment_taskRecordId_itemIndex_uploaderUserId_idx（第3列）；普通：TaskAttachment_uploaderUserId_fkey |
| r2StorageId | R2存储配置ID | varchar(191) NOT NULL | 关联记录的R2存储配置ID。 | 否 | — |
| objectKey | 对象存储键 | varchar(512) NOT NULL | 文件在 R2 存储桶中的唯一对象路径。 | 否 | 唯一：TaskAttachment_objectKey_key |
| originalName | 原始文件名 | varchar(255) NOT NULL | 任务附件记录中的原始文件名。 | 否 | — |
| mimeType | 文件媒体类型 | varchar(100) NOT NULL | 任务附件记录中的文件媒体类型。 | 否 | — |
| size | 文件大小 | int NOT NULL | 任务附件记录中的文件大小。 | 否 | — |
| consumedAt | 使用时间 | datetime(3) NULL | 使用时间对应的时间点。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |

## TaskBrand | 任务适用品牌

> 作用：存储任务与适用品牌之间的关联关系。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| taskId | 任务ID | varchar(191) NOT NULL | 关联记录的任务ID。 | 是 | 主键：PRIMARY |
| brandId | 品牌ID | varchar(191) NOT NULL | 关联记录的品牌ID。 | 是 | 主键：PRIMARY；普通：TaskBrand_brandId_fkey |

## TaskExecutorRole | 任务执行角色

> 作用：存储任务与允许执行该任务的角色关联。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| taskId | 任务ID | varchar(191) NOT NULL | 关联记录的任务ID。 | 是 | 主键：PRIMARY |
| roleId | 角色ID | varchar(191) NOT NULL | 关联记录的角色ID。 | 是 | 主键：PRIMARY；普通：TaskExecutorRole_roleId_idx |

## TaskRecord | 任务实例

> 作用：存储按任务规则生成的具体执行实例及完成状态。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| taskId | 任务ID | varchar(191) NOT NULL | 关联记录的任务ID。 | 否 | 普通：TaskRecord_status_taskId_idx（第2列）；唯一：TaskRecord_task_assignee_store_target_date_key |
| storeId | 门店ID | varchar(191) NULL | 关联记录的门店ID。 | 否 | 普通：TaskRecord_storeId_executionDate_idx；唯一：TaskRecord_task_assignee_store_target_date_key（第3列） |
| status | 状态 | enum('PENDING','COMPLETED','OVERDUE') NOT NULL | 任务实例记录中的状态。 | 否 | 普通：TaskRecord_assignedUserId_executionDate_status_idx（第3列）；普通：TaskRecord_status_dueDate_idx；普通：TaskRecord_status_taskId_idx |
| dueDate | 到期日期 | datetime(3) NOT NULL | 到期日期对应的业务日期。 | 否 | 普通：TaskRecord_status_dueDate_idx（第2列） |
| completedAt | 完成时间 | datetime(3) NULL | 完成时间对应的时间点。 | 否 | — |
| configSnapshot | 配置快照 | json NULL | 业务发生时固化的配置 JSON，避免后续配置变化影响历史记录。 | 否 | — |
| configVersion | 配置版本 | int NULL | 任务实例记录中的配置版本。 | 否 | — |
| submission | 提交 | json NULL | 以 JSON 结构保存的提交。 | 否 | — |
| draftValues | 草稿值集合 | json NULL | 以 JSON 结构保存的草稿值集合。 | 否 | — |
| draftCaptureFallbacks | 草稿捕获回退值 | json NULL | 以 JSON 结构保存的草稿捕获回退值。 | 否 | — |
| draftSavedAt | 草稿保存时间 | datetime(3) NULL | 草稿保存时间对应的时间点。 | 否 | — |
| assignedUserId | 指派用户ID | varchar(191) NULL | 关联记录的指派用户ID。 | 否 | 普通：TaskRecord_assignedUserId_executionDate_status_idx；唯一：TaskRecord_task_assignee_store_target_date_key（第2列） |
| assignedUserNameSnapshot | 指派用户名称快照 | varchar(50) NULL | 业务发生时固化的指派用户名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandIdSnapshot | 品牌ID快照 | varchar(191) NULL | 业务发生时固化的品牌ID快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| effectiveEndAt | 生效结束时间 | datetime(3) NULL | 生效结束时间对应的时间点。 | 否 | — |
| effectiveStartAt | 生效开始时间 | datetime(3) NULL | 生效开始时间对应的时间点。 | 否 | — |
| executionDate | 执行日期 | date NULL | 执行日期对应的业务日期。 | 否 | 普通：TaskRecord_assignedUserId_executionDate_status_idx（第2列）；普通：TaskRecord_storeId_executionDate_idx（第2列）；普通：TaskRecord_targetPersonnelId_executionDate_idx（第2列）；唯一：TaskRecord_task_assignee_store_target_date_key（第5列） |
| includeCompletionRate | 是否计入完成率 | tinyint(1) NULL | 标识是否计入完成率。 | 否 | — |
| recordNo | 记录编号 | varchar(24) NULL | 任务实例记录中的记录编号。 | 否 | 唯一：TaskRecord_recordNo_key |
| storeNameSnapshot | 门店名称快照 | varchar(100) NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| taskNameSnapshot | 任务名称快照 | varchar(100) NULL | 业务发生时固化的任务名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| taskType | 任务类型 | enum('DAILY','WEEKLY','MONTHLY','TEMPORARY') NULL | 任务实例记录中的任务类型。 | 否 | — |
| targetType | 目标类型 | enum('STORE','STORE_EMPLOYEE') NOT NULL | 任务实例记录中的目标类型。 | 否 | — |
| triggeredAt | 触发时间 | datetime(3) NOT NULL | 触发时间对应的时间点。 | 否 | — |
| assignedRoleIdSnapshot | 指派角色ID快照 | varchar(191) NULL | 业务发生时固化的指派角色ID快照，避免源数据后续变化影响历史记录。 | 否 | — |
| assignedRoleNameSnapshot | 指派角色名称快照 | varchar(50) NULL | 业务发生时固化的指派角色名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| targetPersonnelId | 目标人员ID | varchar(191) NULL | 关联记录的目标人员ID。 | 否 | 普通：TaskRecord_targetPersonnelId_executionDate_idx |
| targetPersonnelKey | 目标人员键 | varchar(191) NOT NULL | 任务实例记录中的目标人员键。 | 否 | 唯一：TaskRecord_task_assignee_store_target_date_key（第4列） |
| targetPersonnelNameSnapshot | 目标人员名称快照 | varchar(50) NULL | 业务发生时固化的目标人员名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| targetPersonnelPositionSnapshot | 目标人员岗位快照 | varchar(50) NULL | 业务发生时固化的目标人员岗位快照，避免源数据后续变化影响历史记录。 | 否 | — |

## TaskSchedulerRun | 任务调度运行记录

> 作用：存储每日任务生成调度的运行状态、结果和错误信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| executionDate | 执行日期 | date NOT NULL | 执行日期对应的业务日期。 | 否 | 唯一：TaskSchedulerRun_executionDate_key |
| scheduledTime | 计划执行时间 | varchar(5) NOT NULL | 任务调度运行记录记录中的计划执行时间。 | 否 | — |
| status | 状态 | varchar(20) NOT NULL | 任务调度运行记录记录中的状态。 | 否 | 普通：TaskSchedulerRun_status_startedAt_idx |
| startedAt | 开始时间 | datetime(3) NOT NULL | 开始时间对应的时间点。 | 否 | 普通：TaskSchedulerRun_status_startedAt_idx（第2列） |
| completedAt | 完成时间 | datetime(3) NULL | 完成时间对应的时间点。 | 否 | — |
| result | 执行结果 | json NULL | 以 JSON 结构保存的执行结果。 | 否 | — |
| error | 错误信息 | text NULL | 任务调度运行记录记录中的错误信息。 | 否 | — |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## TaskSubmission | 任务提交

> 作用：存储任务实例的正式提交信息、执行人和配置快照。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| taskRecordId | 任务实例ID | varchar(191) NOT NULL | 关联记录的任务实例ID。 | 否 | 唯一：TaskSubmission_taskRecordId_key |
| taskIdSnapshot | 任务ID快照 | varchar(191) NOT NULL | 业务发生时固化的任务ID快照，避免源数据后续变化影响历史记录。 | 否 | — |
| taskSettingRecordNo | 任务设置记录编号 | varchar(24) NULL | 任务提交记录中的任务设置记录编号。 | 否 | — |
| taskNameSnapshot | 任务名称快照 | varchar(100) NOT NULL | 业务发生时固化的任务名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| taskType | 任务类型 | enum('DAILY','WEEKLY','MONTHLY','TEMPORARY') NOT NULL | 任务提交记录中的任务类型。 | 否 | — |
| targetType | 目标类型 | enum('STORE','STORE_EMPLOYEE') NOT NULL | 任务提交记录中的目标类型。 | 否 | — |
| storeId | 门店ID | varchar(191) NOT NULL | 关联记录的门店ID。 | 否 | 普通：TaskSubmission_storeId_executionDate_idx |
| storeNameSnapshot | 门店名称快照 | varchar(100) NOT NULL | 业务发生时固化的门店名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandIdSnapshot | 品牌ID快照 | varchar(191) NOT NULL | 业务发生时固化的品牌ID快照，避免源数据后续变化影响历史记录。 | 否 | — |
| brandNameSnapshot | 品牌名称快照 | varchar(100) NOT NULL | 业务发生时固化的品牌名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| userId | 用户ID | varchar(191) NOT NULL | 关联记录的用户ID。 | 否 | 普通：TaskSubmission_userId_submittedAt_idx |
| userRealNameSnapshot | 用户真实名称快照 | varchar(50) NOT NULL | 业务发生时固化的用户真实名称快照，避免源数据后续变化影响历史记录。 | 否 | — |
| executionDate | 执行日期 | date NOT NULL | 执行日期对应的业务日期。 | 否 | 普通：TaskSubmission_storeId_executionDate_idx（第2列） |
| configVersion | 配置版本 | int NOT NULL | 任务提交记录中的配置版本。 | 否 | — |
| configSnapshot | 配置快照 | json NOT NULL | 业务发生时固化的配置 JSON，避免后续配置变化影响历史记录。 | 否 | — |
| submittedAt | 提交时间 | datetime(3) NOT NULL | 提交时间对应的时间点。 | 否 | 普通：TaskSubmission_userId_submittedAt_idx（第2列） |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| recordNo | 记录编号 | varchar(14) NOT NULL | 任务提交记录中的记录编号。 | 否 | 唯一：TaskSubmission_recordNo_key |

## TaskSubmissionItem | 任务提交项

> 作用：存储任务提交中每个表单项的值、附件及 AI 分析结果。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| submissionId | 提交记录ID | varchar(191) NOT NULL | 关联记录的提交记录ID。 | 否 | 普通：TaskSubmissionItem_submissionId_idx；唯一：TaskSubmissionItem_submissionId_sortOrder_key |
| itemName | 项目名称 | varchar(100) NOT NULL | 任务提交项记录中的项目名称。 | 否 | — |
| componentType | 组件类型 | varchar(20) NOT NULL | 任务提交项记录中的组件类型。 | 否 | — |
| dataType | 数据类型 | varchar(20) NULL | 任务提交项记录中的数据类型。 | 否 | — |
| description | 说明 | text NOT NULL | 任务提交项记录中的说明。 | 否 | — |
| required | 是否必填 | tinyint(1) NOT NULL | 标识是否必填。 | 否 | — |
| weight | 权重 | int NOT NULL | 任务提交项记录中的权重。 | 否 | — |
| value | 数据值 | text NULL | 任务提交项记录中的数据值。 | 否 | — |
| attachmentObjectKey | 附件对象键 | varchar(512) NULL | 任务提交项记录中的附件对象键。 | 否 | — |
| attachmentName | 附件名称 | varchar(255) NULL | 任务提交项记录中的附件名称。 | 否 | — |
| attachmentMimeType | 附件媒体类型 | varchar(100) NULL | 任务提交项记录中的附件媒体类型。 | 否 | — |
| r2StorageId | R2存储配置ID | varchar(191) NULL | 关联记录的R2存储配置ID。 | 否 | — |
| aiAnalysisTypeSnapshot | AI分析类型快照 | varchar(200) NULL | 业务发生时固化的AI分析类型快照，避免源数据后续变化影响历史记录。 | 否 | — |
| aiAnalysisPromptSnapshot | AI分析提示词快照 | text NULL | 业务发生时固化的AI分析提示词快照，避免源数据后续变化影响历史记录。 | 否 | — |
| aiAnalysisStatus | AI分析状态 | varchar(20) NULL | 任务提交项记录中的AI分析状态。 | 否 | 普通：TaskSubmissionItem_aiAnalysisStatus_aiAnalyzedAt_idx |
| aiAnalysisResult | AI分析结果 | longtext NULL | 任务提交项记录中的AI分析结果。 | 否 | — |
| aiUnqualifiedReasonDescription | AI不合格原因说明 | longtext NULL | 任务提交项记录中的AI不合格原因说明。 | 否 | — |
| aiAnalysisFailureReason | AI分析失败原因 | text NULL | 任务提交项记录中的AI分析失败原因。 | 否 | — |
| aiAnalyzedAt | AI分析时间 | datetime(3) NULL | AI分析时间对应的时间点。 | 否 | 普通：TaskSubmissionItem_aiAnalysisStatus_aiAnalyzedAt_idx（第2列） |
| aiAnalyzedByUserId | AI分析人用户ID | varchar(191) NULL | 关联记录的AI分析人用户ID。 | 否 | — |
| aiAnalyzedByName | AI分析人名称 | varchar(50) NULL | 任务提交项记录中的AI分析人名称。 | 否 | — |
| sortOrder | 排序序号 | int NOT NULL | 任务提交项记录中的排序序号。 | 否 | 唯一：TaskSubmissionItem_submissionId_sortOrder_key（第2列） |
| submittedAt | 提交时间 | datetime(3) NOT NULL | 提交时间对应的时间点。 | 否 | — |

## TaskSubmissionSequence | 任务提交编号序列

> 作用：维护任务提交记录编号的顺序值。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| dateKey | 日期键 | varchar(8) NOT NULL | 任务提交编号序列记录中的日期键。 | 是 | 主键：PRIMARY |
| nextValue | 下一个序号 | int NOT NULL | 任务提交编号序列记录中的下一个序号。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |

## User | 用户

> 作用：存储平台登录账号、人员身份、角色归属和最近登录信息。

| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |
| --- | --- | --- | --- | --- | --- |
| id | 主键ID | varchar(191) NOT NULL | 数据库记录的唯一主键标识。 | 是 | 主键：PRIMARY |
| username | 登录账号 | varchar(191) NOT NULL | 用户记录中的登录账号。 | 否 | 唯一：User_username_key |
| passwordHash | 密码哈希 | varchar(191) NOT NULL | 经过单向哈希处理的登录密码，不保存可还原的密码明文。 | 否 | — |
| realName | 真实姓名 | varchar(191) NOT NULL | 用户记录中的真实姓名。 | 否 | — |
| phone | 手机号码 | varchar(191) NULL | 用户记录中的手机号码。 | 否 | — |
| status | 状态 | enum('ENABLED','DISABLED') NOT NULL | 用户记录中的状态。 | 否 | — |
| roleId | 角色ID | varchar(191) NOT NULL | 关联记录的角色ID。 | 否 | 普通：User_roleId_fkey |
| lastLoginAt | 最近登录时间 | datetime(3) NULL | 最近登录时间对应的时间点。 | 否 | 普通：User_lastLoginAt_idx |
| createdAt | 创建时间 | datetime(3) NOT NULL | 创建时间对应的时间点。 | 否 | — |
| updatedAt | 更新时间 | datetime(3) NOT NULL | 更新时间对应的时间点。 | 否 | — |
| type | 类型 | enum('SYSTEM','CUSTOM') NOT NULL | 用户记录中的类型。 | 否 | — |
| createdByUserId | 创建人用户ID | varchar(191) NULL | 关联记录的创建人用户ID。 | 否 | 普通：User_createdByUserId_idx |
| tags | 标签 | varchar(200) NULL | 用户记录中的标签。 | 否 | — |
| leadH5BrandIds | 运营端H5品牌ID集合 | json NULL | 以 JSON 结构保存的运营端H5品牌ID集合。 | 否 | — |
| leadH5StoreIds | 运营端H5门店ID集合 | json NULL | 以 JSON 结构保存的运营端H5门店ID集合。 | 否 | — |

