"use client";

import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert, Button, Card, Checkbox, Descriptions, Empty, Form, Input, message, Modal, Radio, Select, Space, Table, Tag, Tooltip, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";
import {
  BusinessFormulaError, businessJudgmentOperatorLabels, parseBusinessFormula, validateBusinessJudgmentConditions,
  type BusinessJudgmentCondition, type BusinessJudgmentOperator,
} from "@/lib/business-data-formulas";

type SourceType = "TASK_TEMPLATE" | "ASSESSMENT_TEMPLATE" | "RESEARCH_TEMPLATE";
type SystemSource = "STORE_COST" | "DAILY_LABOR_COST";
type FieldType = "INTEGER" | "DECIMAL" | "MONEY" | "PERCENTAGE" | "TEXT" | "DATE" | "DATETIME";
type FieldRole = "DIMENSION" | "METRIC";
type FieldSource = "SOURCE" | "FORMULA" | "JUDGMENT";
type Permission = "query" | "create" | "view" | "edit" | "delete" | "export";
type Filters = { businessNameKeyword: string; sourceType: "" | SourceType; templateRecordNo: string };
type SourceRow = {
  id: string; recordNo: string; businessName: string; sourceType: SourceType; sourceTypeLabel: string;
  templateId: string; templateRecordNoSnapshot: string; templateNameSnapshot: string; createdByNameSnapshot: string;
  systemSources: SystemSource[]; systemSourceSummary: string;
  createdAt: string; updatedAt: string; version: number; _count: { fields: number };
};
type TemplateOption = { templateId: string; templateRecordNo: string; templateName: string; status: "ENABLED" | "DISABLED" };
type TemplateField = {
  sourceFieldKey: string; sourceFieldId: string | null; sourceFieldCode: string | null; fieldName: string;
  sourceFieldType: string; fieldRole: FieldRole; recommendedFieldType: FieldType | null; recommendedUnit: string | null;
  originalTableField: string;
};
type FieldRow = {
  id?: string; sourceFieldKey: string; fieldNameSnapshot: string; sourceFieldType?: string | null;
  fieldRole: FieldRole; fieldType: FieldType; fieldTypeLabel?: string; originalTableField?: string;
  fieldSource?: FieldSource; formulaName?: string | null; formulaExpression?: string | null; formulaReferenceKeys?: string[];
  judgmentName?: string | null; judgmentConditions?: BusinessJudgmentCondition[]; judgmentReferenceKeys?: string[];
  unit?: string | null; remark?: string | null; sortOrder: number;
};
type SourceFieldDraft = {
  sourceFieldKey: string; fieldNameSnapshot: string; sourceFieldType: string; fieldRole: FieldRole;
  fieldType?: FieldType; originalTableField: string; unit: string; remark: string;
};
type SourceDetail = SourceRow & {
  remark?: string | null; createdByUsername: string; templateStatus: "ENABLED" | "DISABLED" | null; templateMissing: boolean; fields: FieldRow[];
};
type MainFormValues = { businessName: string; sourceType: SourceType; templateId: string; systemSources: SystemSource[]; remark: string };
type FieldFormValues = {
  fieldSource: FieldSource; sourceFieldKey?: string; sourceFieldKeys?: string[]; formulaName?: string; formulaExpression?: string;
  judgmentName?: string; judgmentConditions?: JudgmentConditionDraft[];
  fieldType?: FieldType; unit: string; remark: string;
};
type JudgmentConditionDraft = {
  leftExpression: string;
  operator: BusinessJudgmentOperator;
  rightExpression: string;
  result: string;
};

const sourceTypeOptions = [
  { label: "任务模版", value: "TASK_TEMPLATE" },
  { label: "考核表格", value: "ASSESSMENT_TEMPLATE" },
  { label: "调研模版", value: "RESEARCH_TEMPLATE" },
] satisfies Array<{ label: string; value: SourceType }>;
const systemSourceOptions = [
  { label: "门店成本", value: "STORE_COST" },
  { label: "每日人力成本", value: "DAILY_LABOR_COST" },
] satisfies Array<{ label: string; value: SystemSource }>;
const fieldTypeOptions = [
  { label: "整数", value: "INTEGER" }, { label: "数值", value: "DECIMAL" },
  { label: "金额", value: "MONEY" }, { label: "百分比", value: "PERCENTAGE" },
  { label: "文本", value: "TEXT" }, { label: "日期", value: "DATE" }, { label: "日期时间", value: "DATETIME" },
] satisfies Array<{ label: string; value: FieldType }>;
const metricFieldTypeOptions = fieldTypeOptions.filter(option => ["INTEGER", "DECIMAL", "MONEY", "PERCENTAGE"].includes(option.value));
const numericFieldTypes = new Set<FieldType>(["INTEGER", "DECIMAL", "MONEY", "PERCENTAGE"]);
const judgmentOperatorOptions = (Object.entries(businessJudgmentOperatorLabels) as Array<[BusinessJudgmentOperator, string]>).map(([value, label]) => ({ value, label }));
const fieldTypeLabel = Object.fromEntries(fieldTypeOptions.map(option => [option.value, option.label])) as Record<FieldType, string>;
const emptyFilters: Filters = { businessNameKeyword: "", sourceType: "", templateRecordNo: "" };
const formatTime = (value?: string | null) => value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "";

export function BusinessDataSourceList({ permissions, currentUserName }: { permissions: string[]; currentUserName: string }) {
  const hasAll = permissions.includes("*");
  const can = (action: Permission) => hasAll || permissions.includes(`business-data-sources:${action}`);
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [mode, setMode] = useState<"create" | "view" | "edit" | null>(null);
  const [current, setCurrent] = useState<SourceDetail | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState(false);
  const [availableFields, setAvailableFields] = useState<TemplateField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [mainForm] = Form.useForm<MainFormValues>();
  const [fieldForm] = Form.useForm<FieldFormValues>();
  const [fieldMode, setFieldMode] = useState<"create" | "view" | "edit" | null>(null);
  const [currentField, setCurrentField] = useState<FieldRow | null>(null);
  const [sourceFieldDrafts, setSourceFieldDrafts] = useState<SourceFieldDraft[]>([]);
  const [judgmentConditions, setJudgmentConditions] = useState<JudgmentConditionDraft[]>([]);
  const [appliedSystemSources, setAppliedSystemSources] = useState<SystemSource[]>([]);
  const selectedMainSourceType = Form.useWatch("sourceType", mainForm);
  const selectedFieldSource = Form.useWatch("fieldSource", fieldForm) || "SOURCE";
  const selectedSourceFieldKey = Form.useWatch("sourceFieldKey", fieldForm);
  const formulaName = Form.useWatch("formulaName", fieldForm);
  const formulaExpression = Form.useWatch("formulaExpression", fieldForm);
  const selectedAvailableField = availableFields.find(field => field.sourceFieldKey === selectedSourceFieldKey);
  const formulaSelected = selectedFieldSource === "FORMULA";
  const judgmentSelected = selectedFieldSource === "JUDGMENT";
  const judgmentName = Form.useWatch("judgmentName", fieldForm);
  const systemDimensionSelected = !formulaSelected && !judgmentSelected && (selectedAvailableField?.fieldRole === "DIMENSION" || currentField?.fieldRole === "DIMENSION");
  const textSourceFieldSelected = !formulaSelected && !systemDimensionSelected && (selectedAvailableField?.sourceFieldType === "text" || currentField?.sourceFieldType === "text");
  const judgmentReferenceFields = useMemo(() => fields.filter(field => field.fieldRole === "METRIC" && numericFieldTypes.has(field.fieldType)), [fields]);
  const formulaReferenceFields = useMemo(() => judgmentReferenceFields.filter(field => field.sourceFieldType !== "formula"), [judgmentReferenceFields]);

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) => {
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (nextFilters.businessNameKeyword.trim()) query.set("businessNameKeyword", nextFilters.businessNameKeyword.trim());
      if (nextFilters.sourceType) query.set("sourceType", nextFilters.sourceType);
      if (nextFilters.templateRecordNo.trim()) query.set("templateRecordNo", nextFilters.templateRecordNo.trim());
      const response = await fetch(`/api/business-data-sources?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setRows(data.rows); setTotal(data.total);
    } catch { setLoadError(true); } finally { setLoading(false); }
  };

  useEffect(() => { if (can("query")) void load(1, 20, emptyFilters); else setLoading(false); }, []);

  const loadTemplateOptions = async (sourceType: SourceType, currentOption?: TemplateOption) => {
    setTemplateLoading(true); setTemplateError(false);
    try {
      const response = await fetch(`/api/business-data-sources/template-options?sourceType=${sourceType}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const next = data.rows as TemplateOption[];
      if (currentOption && !next.some(option => option.templateId === currentOption.templateId)) next.push(currentOption);
      setTemplateOptions(next);
    } catch { setTemplateOptions(currentOption ? [currentOption] : []); setTemplateError(true); }
    finally { setTemplateLoading(false); }
  };

  const loadAvailableFields = async (sourceType: SourceType, templateId: string, systemSources: SystemSource[] = []) => {
    setFieldsLoading(true); setFieldsError(false);
    try {
      const query = new URLSearchParams({ sourceType });
      if (systemSources.length) query.set("systemSources", systemSources.join(","));
      const response = await fetch(`/api/business-data-sources/template-options/${templateId}/fields?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setAvailableFields(data.fields || []);
    } catch { setAvailableFields([]); setFieldsError(true); }
    finally { setFieldsLoading(false); }
  };

  const applyFilters = () => {
    const next = { ...filters, businessNameKeyword: filters.businessNameKeyword.trim(), templateRecordNo: filters.templateRecordNo.trim() };
    setAppliedFilters(next); setPage(1); void load(1, pageSize, next);
  };
  const resetFilters = () => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); void load(1, pageSize, emptyFilters); };

  const openCreate = () => {
    mainForm.resetFields(); mainForm.setFieldsValue({ businessName: "", systemSources: [], remark: "" });
    setAppliedSystemSources([]);
    setCurrent(null); setFields([]); setTemplateOptions([]); setAvailableFields([]); setTemplateError(false); setFieldsError(false); setSaveError(""); setDirty(false); setMode("create");
  };

  const openExisting = async (row: SourceRow, nextMode: "view" | "edit") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/business-data-sources/${row.id}?intent=${nextMode}`);
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "业务数据源加载失败，请稍后重试");
      const detail = data.source as SourceDetail;
      setCurrent(detail); setFields(detail.fields); setSaveError(""); setDirty(false); setMode(nextMode);
      mainForm.setFieldsValue({ businessName: detail.businessName, sourceType: detail.sourceType, templateId: detail.templateId, systemSources: detail.systemSources || [], remark: detail.remark || "" });
      setAppliedSystemSources(detail.systemSources || []);
      const currentOption: TemplateOption = { templateId: detail.templateId, templateRecordNo: detail.templateRecordNoSnapshot, templateName: detail.templateNameSnapshot, status: detail.templateStatus || "DISABLED" };
      await Promise.all([loadTemplateOptions(detail.sourceType, currentOption), loadAvailableFields(detail.sourceType, detail.templateId, detail.systemSources || [])]);
    } catch { message.error("业务数据源加载失败，请稍后重试"); }
    finally { setSaving(false); }
  };

  const closeMain = () => {
    if (saving) return;
    if (dirty && mode !== "view") { setDiscardOpen(true); return; }
    setMode(null); setCurrent(null); setFields([]);
  };

  const applySourceType = (value: SourceType) => {
    mainForm.setFieldsValue({ sourceType: value, templateId: undefined as unknown as string, systemSources: [] });
    setAppliedSystemSources([]);
    setFields([]); setTemplateOptions([]); setAvailableFields([]); setFieldsError(false); setDirty(true);
    void loadTemplateOptions(value);
  };
  const changeSourceType = (value: SourceType) => {
    const previous = mainForm.getFieldValue("sourceType");
    const hasDependentData = Boolean(mainForm.getFieldValue("templateId")) || fields.length > 0;
    if (!hasDependentData) return applySourceType(value);
    Modal.confirm({
      title: "确认修改来源类型？",
      content: "修改来源类型后，当前模版记录和数据字典字段将被清空，需要重新配置。",
      okText: "确认修改", cancelText: "取消",
      onOk: () => applySourceType(value),
      onCancel: () => mainForm.setFieldValue("sourceType", previous),
    });
  };

  const applyTemplate = (templateId: string) => {
    mainForm.setFieldValue("templateId", templateId); setFields([]); setAvailableFields([]); setDirty(true);
    const sourceType = mainForm.getFieldValue("sourceType");
    const systemSources = mainForm.getFieldValue("systemSources") || [];
    if (sourceType && templateId) void loadAvailableFields(sourceType, templateId, systemSources);
  };

  const applySystemSources = (values: SystemSource[]) => {
    mainForm.setFieldValue("systemSources", values);
    setAppliedSystemSources(values);
    setFields([]); setAvailableFields([]); setFieldsError(false); setDirty(true);
    const sourceType = mainForm.getFieldValue("sourceType");
    const templateId = mainForm.getFieldValue("templateId");
    if (sourceType && templateId) void loadAvailableFields(sourceType, templateId, values);
  };
  const changeSystemSources = (values: Array<string | number>) => {
    const next = values.filter((value): value is SystemSource => value === "STORE_COST" || value === "DAILY_LABOR_COST");
    const previous = appliedSystemSources;
    if (!fields.length) return applySystemSources(next);
    Modal.confirm({
      title: "确认修改组合系统来源？",
      content: "修改组合系统来源后，当前数据字典字段、公式字段和判断字段配置将被清空，需要重新配置。",
      okText: "确认修改", cancelText: "取消",
      onOk: () => applySystemSources(next),
      onCancel: () => mainForm.setFieldValue("systemSources", previous),
    });
  };
  const changeTemplate = (templateId: string) => {
    const previous = mainForm.getFieldValue("templateId");
    if (!fields.length) return applyTemplate(templateId);
    Modal.confirm({
      title: "确认更换模版记录？",
      content: "更换模版记录后，原数据字典字段配置将失效，需要基于新模版重新配置。",
      okText: "确认更换", cancelText: "取消",
      onOk: () => applyTemplate(templateId),
      onCancel: () => mainForm.setFieldValue("templateId", previous),
    });
  };

  const openFieldCreate = () => {
    if (!mainForm.getFieldValue("templateId")) return void message.warning("请先选择模版记录");
    if (fieldsError) return void message.error("模版字段数据加载失败，请重新加载后再试");
    fieldForm.resetFields(); fieldForm.setFieldsValue({ fieldSource: "SOURCE", sourceFieldKeys: [], unit: "", remark: "" } as FieldFormValues);
    setSourceFieldDrafts([]); setJudgmentConditions([]);
    setCurrentField(null); setFieldMode("create");
  };
  const openField = (row: FieldRow, nextMode: "view" | "edit") => {
    fieldForm.resetFields(); setSourceFieldDrafts([]); setJudgmentConditions(row.judgmentConditions?.map(condition => ({
      leftExpression: condition.leftDisplayExpression || condition.leftExpression || (condition.leftFieldName ? `[${condition.leftFieldName}]` : ""),
      operator: condition.operator,
      rightExpression: condition.rightDisplayExpression || condition.rightExpression || (condition.rightFieldName ? `[${condition.rightFieldName}]` : ""),
      result: condition.result,
    })) || []);
    setCurrentField(row); fieldForm.setFieldsValue({
      fieldSource: row.fieldSource || (row.sourceFieldType === "formula" ? "FORMULA" : row.sourceFieldType === "judgment" ? "JUDGMENT" : "SOURCE"),
      sourceFieldKey: row.sourceFieldKey,
      formulaName: row.formulaName || row.fieldNameSnapshot,
      formulaExpression: row.formulaExpression || "",
      judgmentName: row.judgmentName || row.fieldNameSnapshot,
      fieldType: row.fieldType,
      unit: row.unit || "",
      remark: row.remark || "",
    }); setFieldMode(nextMode);
  };
  const closeFieldEditor = () => {
    setFieldMode(null); setCurrentField(null); setSourceFieldDrafts([]); setJudgmentConditions([]); fieldForm.resetFields();
  };
  const saveField = async () => {
    try {
      const values = await fieldForm.validateFields();
      if (fieldMode === "edit" && currentField) {
        const formulaField = currentField.sourceFieldType === "formula";
        const judgmentField = currentField.sourceFieldType === "judgment";
        const customFieldName = (formulaField ? values.formulaName : judgmentField ? values.judgmentName : "")?.trim() || "";
        if ((formulaField || judgmentField) && fields.some(field => field !== currentField && field.fieldNameSnapshot === customFieldName)) return void message.error("当前数据源已存在相同业务字段");
        setFields(previous => previous.map(field => field === currentField ? {
          ...field,
          ...(formulaField ? { fieldNameSnapshot: customFieldName, formulaName: customFieldName } : {}),
          ...(judgmentField ? { fieldNameSnapshot: customFieldName, judgmentName: customFieldName } : {}),
          remark: values.remark || null,
        } : field));
      } else if (values.fieldSource === "FORMULA") {
        const name = values.formulaName?.trim() || "";
        if (fields.some(field => field.fieldNameSnapshot === name)) return void message.error("当前数据源已存在相同业务字段");
        let parsedFormula;
        try {
          const referenceByName = new Map(formulaReferenceFields.map(field => [field.fieldNameSnapshot, field.sourceFieldKey]));
          parsedFormula = parseBusinessFormula(values.formulaExpression || "", fieldName => referenceByName.get(fieldName) || null);
        } catch (error) {
          return void message.error(error instanceof BusinessFormulaError ? error.message : "计算公式格式不正确");
        }
        const sourceFieldKey = `formula:${crypto.randomUUID()}`;
        setFields(previous => [...previous, {
          sourceFieldKey,
          fieldNameSnapshot: name,
          sourceFieldType: "formula",
          fieldRole: "METRIC",
          fieldSource: "FORMULA",
          fieldType: values.fieldType!,
          originalTableField: "公式计算",
          formulaName: name,
          formulaExpression: parsedFormula.displayExpression,
          formulaReferenceKeys: parsedFormula.referenceKeys,
          unit: values.unit || null,
          remark: values.remark || null,
          sortOrder: previous.length,
        }]);
      } else if (values.fieldSource === "JUDGMENT") {
        const name = values.judgmentName?.trim() || "";
        if (fields.some(field => field.fieldNameSnapshot === name)) return void message.error("当前数据源已存在相同业务字段");
        const referenceByName = new Map(judgmentReferenceFields.map(field => [field.fieldNameSnapshot, field.sourceFieldKey]));
        let conditions: BusinessJudgmentCondition[];
        try {
          conditions = judgmentConditions.map(condition => {
            const left = parseBusinessFormula(condition.leftExpression, fieldName => referenceByName.get(fieldName) || null, { requireField: false });
            const right = parseBusinessFormula(condition.rightExpression, fieldName => referenceByName.get(fieldName) || null, { requireField: false });
            return {
              leftExpression: left.expression,
              rightExpression: right.expression,
              leftDisplayExpression: left.displayExpression,
              rightDisplayExpression: right.displayExpression,
              leftReferenceKeys: left.referenceKeys,
              rightReferenceKeys: right.referenceKeys,
              leftRpn: left.rpn,
              rightRpn: right.rpn,
              operator: condition.operator,
              result: condition.result.trim(),
            };
          });
        } catch (error) {
          return void message.error(error instanceof BusinessFormulaError ? `判断条件表达式不正确：${error.message}` : "判断条件表达式不正确");
        }
        if (!conditions.some(condition => (condition.leftReferenceKeys?.length || 0) + (condition.rightReferenceKeys?.length || 0) > 0)) return void message.error("判断条件至少需要引用一个数值字段或公式字段");
        const numericKeys = new Set(judgmentReferenceFields.map(field => field.sourceFieldKey));
        const conditionError = validateBusinessJudgmentConditions(conditions, numericKeys);
        if (conditionError) return void message.error(conditionError);
        const sourceFieldKey = `judgment:${crypto.randomUUID()}`;
        setFields(previous => [...previous, {
          sourceFieldKey,
          fieldNameSnapshot: name,
          sourceFieldType: "judgment",
          fieldRole: "METRIC",
          fieldSource: "JUDGMENT",
          fieldType: "TEXT",
          originalTableField: "判断计算",
          judgmentName: name,
          judgmentConditions: conditions,
          judgmentReferenceKeys: [...new Set(conditions.flatMap(condition => [...(condition.leftReferenceKeys || []), ...(condition.rightReferenceKeys || [])]))],
          unit: null,
          remark: values.remark || null,
          sortOrder: fields.length,
        }]);
      } else {
        if (!sourceFieldDrafts.length) return void message.error("请至少选择一个业务字段");
        const incomplete = sourceFieldDrafts.find(field => !field.fieldType);
        if (incomplete) return void message.error(`请设置字段“${incomplete.fieldNameSnapshot}”的字段类型`);
        const seenKeys = new Set(fields.map(field => field.sourceFieldKey));
        const seenNames = new Set(fields.map(field => field.fieldNameSnapshot));
        for (const field of sourceFieldDrafts) {
          if (seenKeys.has(field.sourceFieldKey) || seenNames.has(field.fieldNameSnapshot)) return void message.error(`当前数据源已存在业务字段“${field.fieldNameSnapshot}”`);
          seenKeys.add(field.sourceFieldKey); seenNames.add(field.fieldNameSnapshot);
        }
        setFields(previous => [...previous, ...sourceFieldDrafts.map((field, index) => ({
          sourceFieldKey: field.sourceFieldKey,
          fieldNameSnapshot: field.fieldNameSnapshot,
          sourceFieldType: field.sourceFieldType,
          fieldRole: field.fieldRole,
          fieldSource: "SOURCE" as const,
          fieldType: field.fieldType!,
          originalTableField: field.originalTableField,
          unit: field.unit || null,
          remark: field.remark || null,
          sortOrder: previous.length + index,
        }))]);
      }
      setDirty(true); setFieldMode(null); setCurrentField(null); setSourceFieldDrafts([]); setJudgmentConditions([]);
    } catch { /* Form displays validation errors. */ }
  };
  const updateSourceFieldSelection = (keys: string[]) => {
    const selectedKeys = new Set(keys);
    const currentByKey = new Map(sourceFieldDrafts.map(field => [field.sourceFieldKey, field]));
    const next = availableFields.filter(field => selectedKeys.has(field.sourceFieldKey)).map(field => currentByKey.get(field.sourceFieldKey) || {
      sourceFieldKey: field.sourceFieldKey,
      fieldNameSnapshot: field.fieldName,
      sourceFieldType: field.sourceFieldType,
      fieldRole: field.fieldRole,
      fieldType: field.recommendedFieldType || undefined,
      originalTableField: field.originalTableField,
      unit: field.recommendedUnit || "",
      remark: "",
    });
    setSourceFieldDrafts(next);
    fieldForm.setFieldValue("sourceFieldKeys", next.map(field => field.sourceFieldKey));
  };
  const selectSourceFieldGroup = (role: FieldRole) => {
    const existingKeys = new Set(fields.map(field => field.sourceFieldKey));
    const keys = new Set(sourceFieldDrafts.map(field => field.sourceFieldKey));
    availableFields.filter(field => field.fieldRole === role && !existingKeys.has(field.sourceFieldKey)).forEach(field => keys.add(field.sourceFieldKey));
    updateSourceFieldSelection([...keys]);
  };
  const updateSourceFieldDraft = (key: string, patch: Partial<Pick<SourceFieldDraft, "fieldType" | "unit" | "remark">>) => {
    setSourceFieldDrafts(previous => previous.map(field => field.sourceFieldKey === key ? { ...field, ...patch } : field));
  };
  const appendFormula = (token: string) => {
    const currentExpression = fieldForm.getFieldValue("formulaExpression")?.trimEnd() || "";
    fieldForm.setFieldValue("formulaExpression", `${currentExpression}${currentExpression ? " " : ""}${token}`);
  };
  const updateJudgmentCondition = (index: number, patch: Partial<JudgmentConditionDraft>) => {
    setJudgmentConditions(previous => previous.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition));
  };
  const appendJudgmentOperand = (index: number, side: "leftExpression" | "rightExpression", token: string) => {
    const current = judgmentConditions[index]?.[side]?.trimEnd() || "";
    updateJudgmentCondition(index, { [side]: `${current}${current ? " " : ""}${token}` } as Partial<JudgmentConditionDraft>);
  };
  const addJudgmentCondition = () => {
    if (judgmentConditions.length >= 20) return void message.warning("判断条件最多支持20条");
    setJudgmentConditions(previous => [...previous, { leftExpression: "", operator: "LT", rightExpression: "", result: "" }]);
  };
  const removeJudgmentCondition = (index: number) => {
    setJudgmentConditions(previous => previous.filter((_, conditionIndex) => conditionIndex !== index));
  };
  const removeField = (row: FieldRow) => {
    const dependentField = fields.find(field => (field.sourceFieldType === "formula" && field.formulaReferenceKeys?.includes(row.sourceFieldKey)) || (field.sourceFieldType === "judgment" && field.judgmentReferenceKeys?.includes(row.sourceFieldKey)));
    if (dependentField) return void message.error(`字段“${row.fieldNameSnapshot}”正在被${dependentField.sourceFieldType === "judgment" ? "判断字段" : "公式字段"}“${dependentField.fieldNameSnapshot}”引用，请先删除后者`);
    Modal.confirm({
    title: "确认删除数据字典字段？", content: "删除后当前业务数据源将不再包含该业务字段，是否继续？", okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true },
    onOk: () => { setFields(previous => previous.filter(field => field !== row).map((field, index) => ({ ...field, sortOrder: index }))); setDirty(true); },
    });
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    setFields(previous => {
      const next = [...previous];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next.map((field, sortOrder) => ({ ...field, sortOrder }));
    });
    setDirty(true);
  };

  const submit = async () => {
    setSaveError("");
    let values: MainFormValues;
    try {
      values = await mainForm.validateFields();
    } catch (error) {
      const validationError = error as { errorFields?: Array<{ name?: Array<string | number> }> };
      const firstField = validationError.errorFields?.[0]?.name;
      if (firstField) mainForm.scrollToField(firstField, { block: "center" });
      setSaveError("请检查并补充表单中标红的必填内容");
      return;
    }
    if (!fields.length) {
      setSaveError("请至少新增一个数据字典字段后再保存");
      return void message.error("请至少新增一个数据字典字段后再保存");
    }
    setSaving(true);
    try {
      const payload = { ...values, fields: fields.map(field => ({
        id: field.id,
        fieldSource: field.fieldSource || (field.sourceFieldType === "formula" ? "FORMULA" : field.sourceFieldType === "judgment" ? "JUDGMENT" : "SOURCE"),
        sourceFieldKey: field.sourceFieldKey,
        fieldNameSnapshot: field.fieldNameSnapshot,
        formulaName: field.sourceFieldType === "formula" ? field.formulaName || field.fieldNameSnapshot : undefined,
        formulaExpression: field.sourceFieldType === "formula" ? field.formulaExpression : undefined,
        judgmentName: field.sourceFieldType === "judgment" ? field.judgmentName || field.fieldNameSnapshot : undefined,
        judgmentConditions: field.sourceFieldType === "judgment" ? field.judgmentConditions?.map(condition => ({
          leftExpression: condition.leftDisplayExpression || condition.leftExpression || (condition.leftFieldName ? `[${condition.leftFieldName}]` : ""),
          operator: condition.operator,
          rightExpression: condition.rightDisplayExpression || condition.rightExpression || (condition.rightFieldName ? `[${condition.rightFieldName}]` : ""),
          result: condition.result,
        })) : undefined,
        fieldType: field.fieldType,
        unit: field.unit || "",
        remark: field.remark || "",
      })), ...(mode === "edit" ? { version: current?.version } : {}) };
      const response = await fetch(mode === "create" ? "/api/business-data-sources" : `/api/business-data-sources/${current?.id}`, { method: mode === "create" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = data?.message || `业务数据源保存失败（HTTP ${response.status}）`;
        setSaveError(errorMessage);
        return void message.error(errorMessage);
      }
      message.success(mode === "create" ? "业务数据源新增成功" : "业务数据源保存成功");
      setMode(null); setCurrent(null); setFields([]); setDirty(false); setPage(1); await load(1, pageSize, appliedFilters);
    } catch (error) {
      const errorMessage = error instanceof Error && error.message ? error.message : "业务数据源保存失败，请检查网络后重试";
      setSaveError(errorMessage);
      message.error(errorMessage);
    } finally { setSaving(false); }
  };

  const remove = (row: SourceRow) => Modal.confirm({
    title: "温馨提示",
    content: "删除操作不可逆，删除成功后当前业务数据源及其数据字典字段配置将无法恢复，请谨慎操作。",
    okText: "我知道了，继续删除", cancelText: "我再想想", okButtonProps: { danger: true },
    onOk: async () => {
      const response = await fetch(`/api/business-data-sources/${row.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) { message.error(data.message || "业务数据源删除失败，请稍后重试"); throw new Error(); }
      message.success(data.message); setSelectedRowKeys(keys => keys.filter(key => key !== row.id));
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); await load(nextPage);
    },
  });

  const exportRows = async () => {
    try {
      const response = await fetch("/api/business-data-sources/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedRowKeys.length ? { recordIds: selectedRowKeys } : { filters: appliedFilters }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || "业务数据源导出失败，请稍后重试"); }
      const blob = await response.blob(); const disposition = response.headers.get("Content-Disposition") || ""; const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = encoded ? decodeURIComponent(encoded) : `业务数据源_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`; link.click(); URL.revokeObjectURL(link.href);
    } catch (error) { message.error(error instanceof Error ? error.message : "业务数据源导出失败，请稍后重试"); }
  };

  const templateSelectOptions = templateOptions.map(option => ({
    value: option.templateId,
    label: `[${option.templateRecordNo}] ${option.templateName}${option.status === "DISABLED" ? "（已禁用）" : ""}`,
    disabled: option.status === "DISABLED" && option.templateId !== current?.templateId,
  }));
  const selectableFields = useMemo(() => ([
    {
      label: "系统维度（自动取自上报记录）",
      options: availableFields.filter(field => field.fieldRole === "DIMENSION").map(field => {
        const added = fields.some(existing => existing.sourceFieldKey === field.sourceFieldKey);
        return { label: added && fieldMode === "create" ? `${field.fieldName}（已添加）` : field.fieldName, value: field.sourceFieldKey, disabled: added };
      }),
    },
    {
      label: "业务字段（取自模版填写项）",
      options: availableFields.filter(field => field.fieldRole === "METRIC" && !field.sourceFieldKey.startsWith("system-source:")).map(field => {
        const added = fields.some(existing => existing.sourceFieldKey === field.sourceFieldKey);
        return { label: added && fieldMode === "create" ? `${field.fieldName}（已添加）` : field.fieldName, value: field.sourceFieldKey, disabled: added };
      }),
    },
    {
      label: "门店成本字段（按门店关联，保留月配置值）",
      options: availableFields.filter(field => field.sourceFieldKey.startsWith("system-source:store-cost:")).map(field => {
        const added = fields.some(existing => existing.sourceFieldKey === field.sourceFieldKey);
        return { label: added && fieldMode === "create" ? `${field.fieldName}（已添加）` : field.fieldName, value: field.sourceFieldKey, disabled: added };
      }),
    },
    {
      label: "每日人力成本字段（按门店＋业务日期关联）",
      options: availableFields.filter(field => field.sourceFieldKey.startsWith("system-source:daily-labor-cost:")).map(field => {
        const added = fields.some(existing => existing.sourceFieldKey === field.sourceFieldKey);
        return { label: added && fieldMode === "create" ? `${field.fieldName}（已添加）` : field.fieldName, value: field.sourceFieldKey, disabled: added };
      }),
    },
  ].filter(group => group.options.length)), [availableFields, fields, fieldMode]);
  const sourceFieldDraftColumns: ColumnsType<SourceFieldDraft> = [
    { title: "序号", width: 60, render: (_, __, index) => index + 1 },
    { title: "业务字段", dataIndex: "fieldNameSnapshot", width: 220, ellipsis: true },
    { title: "字段角色", dataIndex: "fieldRole", width: 100, render: value => value === "DIMENSION" ? <Tag color="blue">系统维度</Tag> : <Tag color="green">业务字段</Tag> },
    { title: "原始表字段", dataIndex: "originalTableField", width: 230, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><Typography.Text code>{value}</Typography.Text></Tooltip> },
    {
      title: "字段类型", dataIndex: "fieldType", width: 130, render: (value, row) => {
        const fixed = row.fieldRole === "DIMENSION" || row.sourceFieldType === "text";
        const options = fixed ? fieldTypeOptions.filter(option => option.value === value) : metricFieldTypeOptions;
        return <Select style={{ width: "100%" }} value={value} placeholder="请选择" options={options} disabled={fixed} onChange={fieldType => updateSourceFieldDraft(row.sourceFieldKey, { fieldType, ...(fieldType === "PERCENTAGE" && !row.unit ? { unit: "%" } : {}) })} />;
      },
    },
    { title: "单位", dataIndex: "unit", width: 120, render: (value, row) => <Input value={value} maxLength={10} placeholder="选填" disabled={row.fieldRole === "DIMENSION" || row.sourceFieldType === "text"} onChange={event => updateSourceFieldDraft(row.sourceFieldKey, { unit: event.target.value })} /> },
    { title: "备注", dataIndex: "remark", width: 200, render: (value, row) => <Input value={value} maxLength={200} placeholder="选填" onChange={event => updateSourceFieldDraft(row.sourceFieldKey, { remark: event.target.value })} /> },
    { title: "操作", fixed: "right", width: 75, render: (_, row) => <Button type="link" danger size="small" onClick={() => updateSourceFieldSelection(sourceFieldDrafts.filter(field => field.sourceFieldKey !== row.sourceFieldKey).map(field => field.sourceFieldKey))}>移除</Button> },
  ];
  const filteredEmpty = Object.values(appliedFilters).some(Boolean);

  const columns: ColumnsType<SourceRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 145 },
    { title: "业务名称", dataIndex: "businessName", width: 210, ellipsis: true },
    { title: "来源类型", dataIndex: "sourceTypeLabel", width: 130 },
    { title: "模版记录编号", dataIndex: "templateRecordNoSnapshot", width: 160 },
    { title: "组合系统来源", dataIndex: "systemSourceSummary", width: 220, ellipsis: true, render: value => value === "无" ? "-" : value },
    { title: "创建人", dataIndex: "createdByNameSnapshot", width: 120 },
    { title: "创建时间", dataIndex: "createdAt", width: 175, render: formatTime },
    { title: "操作", fixed: "right", width: 190, render: (_, row) => <Space className="table-actions" size={0}>{can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openExisting(row, "view")}>查看</Button>}{can("edit") && <Button type="link" size="small" onClick={() => void openExisting(row, "edit")}>编辑</Button>}{can("delete") && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(row)}>删除</Button>}</Space> },
  ];
  const fieldColumns: ColumnsType<FieldRow> = [
    { title: "序号", width: 70, render: (_, __, index) => index + 1 },
    { title: "业务字段", dataIndex: "fieldNameSnapshot", ellipsis: true, width: 240 },
    { title: "字段来源", width: 110, render: (_, row) => row.sourceFieldType === "formula" ? <Tag color="purple">公式字段</Tag> : row.sourceFieldType === "judgment" ? <Tag color="orange">判断字段</Tag> : <Tag>数据源字段</Tag> },
    { title: "原始表字段", dataIndex: "originalTableField", width: 270, ellipsis: { showTitle: false }, render: value => <Tooltip title={value || "-"}><Typography.Text code>{value || "-"}</Typography.Text></Tooltip> },
    { title: "计算公式", dataIndex: "formulaExpression", width: 300, ellipsis: { showTitle: false }, render: (value, row) => {
      const expression = value || (row.sourceFieldType === "judgment" ? row.judgmentConditions?.map(condition => `${condition.leftDisplayExpression || condition.leftExpression || ""} ${businessJudgmentOperatorLabels[condition.operator]} ${condition.rightDisplayExpression || condition.rightExpression || ""} → ${condition.result}`).join("；") : "");
      return expression ? <Tooltip title={expression}><Typography.Text code>{expression}</Typography.Text></Tooltip> : "-";
    } },
    { title: "字段角色", dataIndex: "fieldRole", width: 100, render: value => value === "DIMENSION" ? <Tag color="blue">系统维度</Tag> : <Tag color="green">业务字段</Tag> },
    { title: "字段类型", dataIndex: "fieldType", width: 110, render: value => fieldTypeLabel[value as FieldType] },
    { title: "单位", dataIndex: "unit", width: 90, render: value => value || "-" },
    { title: "备注", dataIndex: "remark", ellipsis: true, render: value => value || "-" },
    { title: "操作", fixed: "right", width: mode === "view" ? 80 : 330, render: (_, row, index) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => openField(row, "view")}>查看</Button>{mode !== "view" && <Button type="link" size="small" onClick={() => openField(row, "edit")}>编辑</Button>}{mode !== "view" && <Button type="link" size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveField(index, -1)}>上移</Button>}{mode !== "view" && <Button type="link" size="small" icon={<ArrowDownOutlined />} disabled={index === fields.length - 1} onClick={() => moveField(index, 1)}>下移</Button>}{mode !== "view" && <Button type="link" danger size="small" onClick={() => removeField(row)}>删除</Button>}</Space> },
  ];

  if (!can("query")) return <Alert type="warning" showIcon message="暂无业务数据源查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  return <>
    <Card style={{ marginBottom: 16 }}>
      <div className="business-source-filter-grid">
        <Form.Item label="业务名称"><Input allowClear value={filters.businessNameKeyword} maxLength={20} placeholder="请输入业务名称" onChange={event => setFilters(previous => ({ ...previous, businessNameKeyword: event.target.value }))} onPressEnter={applyFilters} /></Form.Item>
        <Form.Item label="来源类型"><Select allowClear value={filters.sourceType || undefined} placeholder="全部来源类型" options={sourceTypeOptions} onChange={value => setFilters(previous => ({ ...previous, sourceType: value || "" }))} /></Form.Item>
        <Form.Item label="模版记录编号"><Input allowClear value={filters.templateRecordNo} maxLength={24} placeholder="请输入完整模版记录编号" onChange={event => setFilters(previous => ({ ...previous, templateRecordNo: event.target.value }))} onPressEnter={applyFilters} /></Form.Item>
        <Space className="business-source-filter-actions"><Button onClick={resetFilters}>重置</Button><Button type="primary" onClick={applyFilters}>筛选</Button></Space>
      </div>
    </Card>
    <Card>
      <div className="business-source-toolbar"><Space>{can("create") && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}<Typography.Text type="secondary">已选择 {selectedRowKeys.length} 条</Typography.Text></Space>{can("export") && <Button icon={<DownloadOutlined />} onClick={() => void exportRows()}>批量导出</Button>}</div>
      {loadError ? <Alert type="error" showIcon message="业务数据源加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable<SourceRow>
        rowKey="id" columns={columns} dataSource={rows} loading={loading} rowSelection={{ selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys }} scroll={{ x: 1370 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{filteredEmpty ? "没有找到符合当前条件的业务数据源" : "暂无业务数据源记录"}</div><small>{filteredEmpty ? "请调整筛选条件后重试" : "当前还没有配置业务数据源"}</small></>}>{filteredEmpty ? <Button onClick={resetFilters}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}</Empty> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize); } }}
      />}
    </Card>

    <Modal className="business-source-modal" title={mode === "create" ? "新增业务数据" : mode === "edit" ? "编辑业务数据" : "查看业务数据"} open={Boolean(mode)} width={1240} maskClosable={false} destroyOnHidden onCancel={closeMain} styles={{ body: { maxHeight: "74vh", overflowY: "auto" } }} footer={mode === "view" ? <Button onClick={closeMain}>关闭</Button> : <Space><Button onClick={closeMain}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      {saveError && <Alert style={{ marginBottom: 16 }} type="error" showIcon closable message="保存失败" description={saveError} onClose={() => setSaveError("")} />}
      <Form form={mainForm} layout="vertical" disabled={mode === "view"} onValuesChange={() => { if (mode !== "view") { setSaveError(""); setDirty(true); } }}>
        <div className="business-source-form-grid">
          <Form.Item label="记录编号"><Input disabled value={current?.recordNo} placeholder="保存后自动生成" /></Form.Item>
          <Form.Item label="业务名称" name="businessName" rules={[{ required: true, whitespace: true, message: "请输入业务名称" }, { max: 20, message: "业务名称不能超过20个字符" }]}><Input maxLength={20} placeholder="请输入业务名称" /></Form.Item>
          <Form.Item label="来源类型" name="sourceType" rules={[{ required: true, message: "请选择来源类型" }]}><Select placeholder="请选择" options={sourceTypeOptions} onChange={changeSourceType} /></Form.Item>
          <Form.Item label="模版记录" name="templateId" rules={[{ required: true, message: "请选择模版记录" }]} extra={templateError ? "模版记录数据加载失败，请稍后重试。" : undefined}><Select showSearch optionFilterProp="label" placeholder={mainForm.getFieldValue("sourceType") ? "请选择" : "请先选择来源类型"} disabled={mode === "view" || !mainForm.getFieldValue("sourceType")} loading={templateLoading} options={templateSelectOptions} onChange={changeTemplate} notFoundContent={templateLoading ? "加载中..." : "暂无已启用模版"} /></Form.Item>
          <Form.Item className="business-source-form-span" label="组合系统来源" name="systemSources" extra={selectedMainSourceType === "TASK_TEMPLATE" ? "可选。门店成本按门店关联并保留月配置值；每日人力成本按门店＋业务日期关联，缺失考勤时数据为空。" : "第一阶段仅任务模版支持组合系统来源。"}>
            <Checkbox.Group options={systemSourceOptions} disabled={mode === "view" || selectedMainSourceType !== "TASK_TEMPLATE"} onChange={changeSystemSources} />
          </Form.Item>
          <Form.Item className="business-source-form-span" label="备注" name="remark" rules={[{ max: 200, message: "备注不能超过200个字符" }]}><Input.TextArea rows={3} showCount maxLength={200} placeholder="请输入备注（选填）" /></Form.Item>
        </div>
      </Form>

      <Card size="small" title="数据字典列表" extra={mode !== "view" ? <Button type="primary" size="small" icon={<PlusOutlined />} loading={fieldsLoading} onClick={openFieldCreate}>新增</Button> : null}>
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="系统维度会自动从正式上报记录中读取；品牌、门店、日期等信息无需用户重复填写。" />
        {fieldsError && <Alert style={{ marginBottom: 12 }} type="error" showIcon message="模版字段数据加载失败，请稍后重试" action={<Button size="small" onClick={() => { const type = mainForm.getFieldValue("sourceType"); const id = mainForm.getFieldValue("templateId"); const systemSources = mainForm.getFieldValue("systemSources") || []; if (type && id) void loadAvailableFields(type, id, systemSources); }}>重新加载</Button>} />}
        <Table<FieldRow> rowKey={row => row.id || row.sourceFieldKey} size="small" columns={fieldColumns} dataSource={fields} pagination={false} scroll={{ x: 1825 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>暂无数据字典字段</div><small>请点击“新增”配置系统维度、数据源字段、公式字段或判断字段</small></>} /> }} />
      </Card>

      <Descriptions style={{ marginTop: 18 }} title="系统信息" bordered size="small" column={2}>
        <Descriptions.Item label="创建人">{current?.createdByNameSnapshot || currentUserName}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{formatTime(current?.createdAt) || "保存后自动生成"}</Descriptions.Item>
        {current?.templateMissing && <Descriptions.Item label="模版状态" span={2}><Tag color="error">原模版记录已不存在</Tag></Descriptions.Item>}
        {!current?.templateMissing && current?.templateStatus === "DISABLED" && <Descriptions.Item label="模版状态" span={2}><Tag>已禁用</Tag></Descriptions.Item>}
      </Descriptions>
    </Modal>

    <Modal title={fieldMode === "create" ? "新增数据字典" : fieldMode === "edit" ? "编辑数据字典" : "查看数据字典"} open={Boolean(fieldMode)} width={fieldMode === "create" && !formulaSelected ? 1120 : 760} zIndex={2050} maskClosable={false} destroyOnHidden styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }} onCancel={closeFieldEditor} footer={fieldMode === "view" ? <Button onClick={closeFieldEditor}>关闭</Button> : <Space><Button onClick={closeFieldEditor}>取消</Button><Button type="primary" onClick={() => void saveField()}>{fieldMode === "create" && !formulaSelected && !judgmentSelected ? `添加所选字段${sourceFieldDrafts.length ? `（${sourceFieldDrafts.length}）` : ""}` : "保存"}</Button></Space>}>
      <Form form={fieldForm} layout="vertical">
        <Form.Item label="字段来源" name="fieldSource" rules={[{ required: true, message: "请选择字段来源" }]}>
          <Radio.Group disabled={fieldMode !== "create"} onChange={event => {
            setSourceFieldDrafts([]);
            if (event.target.value === "FORMULA") { setJudgmentConditions([]); fieldForm.setFieldsValue({ sourceFieldKey: undefined, sourceFieldKeys: [], formulaName: "", formulaExpression: "", judgmentName: "", judgmentConditions: [], fieldType: "DECIMAL", unit: "", remark: "" }); }
            else if (event.target.value === "JUDGMENT") { setJudgmentConditions([{ leftExpression: "", operator: "GTE", rightExpression: "", result: "" }, { leftExpression: "", operator: "LT", rightExpression: "", result: "" }]); fieldForm.setFieldsValue({ sourceFieldKey: undefined, sourceFieldKeys: [], formulaName: "", formulaExpression: "", judgmentName: "", fieldType: "TEXT", unit: "", remark: "" }); }
            else { setJudgmentConditions([]); fieldForm.setFieldsValue({ sourceFieldKey: undefined, sourceFieldKeys: [], formulaName: "", formulaExpression: "", judgmentName: "", fieldType: undefined as unknown as FieldType, unit: "", remark: "" }); }
          }}>
            <Radio.Button value="SOURCE">数据源字段</Radio.Button>
            <Radio.Button value="FORMULA">公式字段</Radio.Button>
            <Radio.Button value="JUDGMENT">判断字段</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {!formulaSelected && !judgmentSelected && fieldMode === "create" ? <>
          <Form.Item label="业务字段" name="sourceFieldKeys" rules={[{ required: true, type: "array", min: 1, message: "请至少选择一个业务字段" }]} extra="支持搜索和多选；已添加到数据字典列表的字段不可重复选择。">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" maxTagCount="responsive" placeholder="请选择系统维度或模版业务字段" options={selectableFields} onChange={updateSourceFieldSelection} />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Space wrap>
              <Button size="small" onClick={() => selectSourceFieldGroup("DIMENSION")}>全选系统维度</Button>
              <Button size="small" onClick={() => selectSourceFieldGroup("METRIC")}>全选指标字段</Button>
              <Button size="small" disabled={!sourceFieldDrafts.length} onClick={() => updateSourceFieldSelection([])}>清空选择</Button>
            </Space>
            <Typography.Text type="secondary">已选择 {sourceFieldDrafts.length} 个字段</Typography.Text>
          </div>
          <Table<SourceFieldDraft> rowKey="sourceFieldKey" size="small" columns={sourceFieldDraftColumns} dataSource={sourceFieldDrafts} pagination={false} scroll={{ x: 1135, y: 360 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请从上方勾选需要添加的字段" /> }} />
        </> : !formulaSelected && !judgmentSelected ? <Form.Item label="业务字段" name="sourceFieldKey" rules={[{ required: true, message: "请选择业务字段" }]}><Select showSearch optionFilterProp="label" placeholder="业务字段" options={selectableFields} disabled /></Form.Item> : formulaSelected ? <>
          <Form.Item label="自定义业务字段名称" name="formulaName" rules={[{ required: true, whitespace: true, message: "请输入自定义业务字段名称" }, { max: 50, message: "自定义业务字段名称不能超过50个字符" }]}>
            <Input maxLength={50} showCount placeholder="例如：好评率" disabled={fieldMode === "view"} />
          </Form.Item>
          <Form.Item label="可用数值字段" extra="公式只能引用当前数据源中已添加的数据源数值字段，不能引用维度或其他公式字段。">
            {formulaReferenceFields.length ? <Space size={[6, 8]} wrap>{formulaReferenceFields.map(field => <Button key={field.sourceFieldKey} size="small" disabled={fieldMode !== "create"} onClick={() => appendFormula(`[${field.fieldNameSnapshot}]`)}>{field.fieldNameSnapshot}</Button>)}</Space> : <Alert type="warning" showIcon message="请先在数据字典列表中添加公式需要引用的数值字段" />}
          </Form.Item>
          <Form.Item label="计算公式" name="formulaExpression" rules={[
            { required: true, whitespace: true, message: "请输入计算公式" },
            { max: 500, message: "计算公式不能超过500个字符" },
            { validator: async (_, value) => {
              if (!value) return;
              const referenceByName = new Map(formulaReferenceFields.map(field => [field.fieldNameSnapshot, field.sourceFieldKey]));
              try { parseBusinessFormula(value, fieldName => referenceByName.get(fieldName) || null); }
              catch (error) { throw new Error(error instanceof BusinessFormulaError ? error.message : "计算公式格式不正确"); }
            } },
          ]} extra="支持 +、-、×、÷、括号、普通数字和百分数；除数为0时结果为空。">
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="例如：[周好评数] / [周评价数] × 100%" disabled={fieldMode !== "create"} />
          </Form.Item>
          {fieldMode === "create" && <Form.Item label="快捷运算符"><Space wrap>{["+", "-", "×", "÷", "(", ")", "100%"].map(operator => <Button key={operator} size="small" onClick={() => appendFormula(operator)}>{operator}</Button>)}</Space></Form.Item>}
          {(formulaName || formulaExpression) && <Alert style={{ marginBottom: 16 }} type="info" showIcon message="公式预览" description={`${formulaName || "公式字段"} = ${formulaExpression || "请继续输入公式"}`} />}
        </> : judgmentSelected ? <>
          <Form.Item label="自定义判断字段名称" name="judgmentName" rules={[{ required: true, whitespace: true, message: "请输入自定义判断字段名称" }, { max: 50, message: "自定义判断字段名称不能超过50个字符" }]}>
            <Input maxLength={50} showCount placeholder="例如：销售达成情况" disabled={fieldMode === "view"} />
          </Form.Item>
          <Form.Item label="判断公式" extra="左右两侧均支持数据源字段、公式字段、数字及加减乘除表达式，例如：[字段A] > [字段B] / 30；同一判断字段的多条条件需使用相同的左右表达式，保存时会检查交叉冲突。">
            <Space direction="vertical" style={{ width: "100%" }} size={10}>
              {judgmentConditions.map((condition, index) => <Card key={`judgment-condition-${index}`} size="small" style={{ width: "100%" }}>
                <Space align="start" wrap>
                  <Typography.Text style={{ lineHeight: "32px" }}>条件{index + 1}：当</Typography.Text>
                  <Space direction="vertical" size={4} style={{ width: 300 }}>
                    <Input value={condition.leftExpression} placeholder="左侧表达式，如：[字段A]" disabled={fieldMode === "view"} onChange={event => updateJudgmentCondition(index, { leftExpression: event.target.value })} />
                    {fieldMode !== "view" && <Space wrap size={[4, 4]}><Typography.Text type="secondary">插入：</Typography.Text>{judgmentReferenceFields.map(field => <Button key={field.sourceFieldKey} size="small" onClick={() => appendJudgmentOperand(index, "leftExpression", `[${field.fieldNameSnapshot}]`)}>{field.fieldNameSnapshot}</Button>)}{["+", "-", "×", "÷", "(", ")"].map(token => <Button key={token} size="small" onClick={() => appendJudgmentOperand(index, "leftExpression", token)}>{token}</Button>)}</Space>}
                  </Space>
                  <Select style={{ width: 86, marginTop: 0 }} value={condition.operator} options={judgmentOperatorOptions} disabled={fieldMode === "view"} onChange={value => updateJudgmentCondition(index, { operator: value })} />
                  <Space direction="vertical" size={4} style={{ width: 300 }}>
                    <Input value={condition.rightExpression} placeholder="右侧表达式，如：[字段B] / 30" disabled={fieldMode === "view"} onChange={event => updateJudgmentCondition(index, { rightExpression: event.target.value })} />
                    {fieldMode !== "view" && <Space wrap size={[4, 4]}><Typography.Text type="secondary">插入：</Typography.Text>{judgmentReferenceFields.map(field => <Button key={field.sourceFieldKey} size="small" onClick={() => appendJudgmentOperand(index, "rightExpression", `[${field.fieldNameSnapshot}]`)}>{field.fieldNameSnapshot}</Button>)}{["+", "-", "×", "÷", "(", ")"].map(token => <Button key={token} size="small" onClick={() => appendJudgmentOperand(index, "rightExpression", token)}>{token}</Button>)}</Space>}
                  </Space>
                  <Typography.Text style={{ lineHeight: "32px" }}>时，结果为</Typography.Text>
                  <Input style={{ width: 150 }} maxLength={50} placeholder="如：合格" value={condition.result} disabled={fieldMode === "view"} onChange={event => updateJudgmentCondition(index, { result: event.target.value })} />
                  {fieldMode !== "view" && <Button danger type="link" onClick={() => removeJudgmentCondition(index)}>删除</Button>}
                </Space>
              </Card>)}
              {fieldMode !== "view" && <Button type="dashed" onClick={addJudgmentCondition}>新增条件</Button>}
              {!judgmentReferenceFields.length && <Alert type="warning" showIcon message="请先在数据字典列表中添加可比较的数值字段或公式字段" />}
            </Space>
          </Form.Item>
        </> : null}
        {(formulaSelected || judgmentSelected || fieldMode !== "create") && <>
          <Form.Item label="字段类型" name="fieldType" rules={[{ required: true, message: "请选择字段类型" }]} extra={systemDimensionSelected ? "系统维度的字段类型由系统固定。" : textSourceFieldSelected ? "文本业务字段的字段类型固定为文本，不参与公式计算。" : formulaSelected ? "公式字段仅支持整数、数值、金额和百分比。" : judgmentSelected ? "判断字段根据条件输出文本结果，字段类型固定为文本。" : undefined}><Select placeholder="请选择" options={systemDimensionSelected ? fieldTypeOptions : textSourceFieldSelected || judgmentSelected ? fieldTypeOptions.filter(option => option.value === "TEXT") : metricFieldTypeOptions} disabled={fieldMode !== "create" || systemDimensionSelected || textSourceFieldSelected || judgmentSelected} onChange={value => { if (formulaSelected && value === "PERCENTAGE" && !fieldForm.getFieldValue("unit")) fieldForm.setFieldValue("unit", "%"); }} /></Form.Item>
          <Form.Item label="单位" name="unit" rules={[{ max: 10, message: "单位不能超过10个字符" }]}><Input maxLength={10} placeholder={systemDimensionSelected || judgmentSelected ? "无需单位" : textSourceFieldSelected ? "文本业务字段无需单位" : "例如：人、元、%、分（选填）"} disabled={fieldMode !== "create" || systemDimensionSelected || textSourceFieldSelected || judgmentSelected} /></Form.Item>
          <Form.Item label="备注" name="remark" rules={[{ max: 200, message: "备注不能超过200个字符" }]}><Input.TextArea rows={4} showCount maxLength={200} placeholder="请输入字段统计口径（选填）" disabled={fieldMode === "view"} /></Form.Item>
        </>}
      </Form>
      {fieldMode === "edit" && <Alert type="info" showIcon message={formulaSelected || judgmentSelected ? "仅支持修改自定义字段名称和备注；计算公式、判断条件、字段类型和单位不可修改。" : "字段定义创建后不可修改，本次仅支持修订备注。"} />}
    </Modal>

    <UnsavedChangesModal open={discardOpen} title="当前业务数据尚未保存" content="关闭后填写内容和数据字典字段将丢失，是否继续？" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); setMode(null); setCurrent(null); setFields([]); setDirty(false); }} />
  </>;
}
