"use client";

import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined,
  FileOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined, UsergroupAddOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, Checkbox, Descriptions, Empty, Form, Image, Input, message as antdMessage, Modal, Select, Skeleton,
  Space, Table, Tabs, Tag, Tooltip, Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";
import { createClientRequestId } from "@/lib/client-request-id";

type Asset = { kind: "R2"; r2StorageId: string; objectKey: string; originalName: string; mimeType: string; size: number; uploadProof: string };
type Cover = Asset | { kind: "DEFAULT" } | { kind: "EXISTING" };
type CoursewareType = "VIDEO" | "AUDIO" | "PDF" | "PPT";
type Lesson = {
  id: string; recordNo: string; chapterName: string; chapterDescription?: string | null; coursewareType: CoursewareType;
  originalFileName: string; fileSizeBytes: number; fileSizeText: string; mimeType: string; remark?: string | null;
  sortOrder: number; createdByName: string; createdAtText: string; version: number; coverUrl?: string | null;
  fileUrl: string; hasLearningProgress: boolean;
};
type Course = {
  id: string; recordNo: string; courseName: string; courseDescription?: string | null; applicablePosition: string;
  status: "ENABLED" | "DISABLED"; createdByName: string; createdAtText: string; version: number;
  brandCodes: string[]; brands: { brandCode: string; brandLabel: string }[]; coverUrl?: string | null;
  lessonCount?: number; hasLearningProgress: boolean; lessons?: Lesson[];
};
type Filters = { courseName?: string; positionKeyword?: string; brand?: string; status?: string };
type AssignmentFilters = { brand?: string; roleId?: string; tag?: string; username?: string; status?: "ENABLED" | "DISABLED" };
type AssignmentUser = {
  id: string; realName: string; username: string; phone?: string | null; tags?: string | null; status: "ENABLED" | "DISABLED";
  role: { id: string; name: string; status: "ENABLED" | "DISABLED" };
};
type AssignmentOptions = {
  brands: { label: string; value: string }[];
  roles: { id: string; name: string; status: "ENABLED" | "DISABLED" }[];
  tags: string[];
};
type CourseForm = { courseName: string; courseDescription?: string; applicablePosition: string; brandCodes: string[]; status: "ENABLED" | "DISABLED" };
type LessonForm = { chapterName: string; chapterDescription?: string; coursewareType: CoursewareType; remark?: string };
type ModalMode = "create" | "edit" | "view";

const typeLabels: Record<CoursewareType, string> = { VIDEO: "视频", AUDIO: "音频", PDF: "PDF", PPT: "PPT" };
const acceptByType: Record<CoursewareType, string> = { VIDEO: ".mp4,.webm,.mov", AUDIO: ".mp3,.aac,.m4a,.wav", PDF: ".pdf", PPT: ".ppt,.pptx" };
const defaultAssignmentFilters: AssignmentFilters = { status: "ENABLED" };

function can(permissions: string[], scope: "courses" | "course-lessons", action: string) {
  return permissions.includes("*") || permissions.includes("training:view") || permissions.includes(`${scope}:${action}`);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "操作失败，请稍后重试");
  return data as T;
}

async function uploadAsset(file: File, businessType: "COURSE_COVER" | "LESSON_COVER" | CoursewareType, onProgress: (percent: number) => void) {
  const grant = await requestJson<Omit<Asset, "kind" | "uploadProof"> & { uploadUrl: string; headers: Record<string, string> }>("/api/course-uploads/sign", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessType, fileName: file.name, fileSize: file.size, mimeType: file.type }),
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let uploadBodySent = false;
    xhr.open("PUT", grant.uploadUrl); Object.entries(grant.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.timeout = 15 * 60 * 1000;
    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      uploadBodySent = event.loaded >= event.total;
      onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
    };
    xhr.upload.onload = () => { uploadBodySent = true; onProgress(100); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 || uploadBodySent ? resolve() : reject(new Error("课件上传失败，请重新上传"));
    xhr.onerror = () => uploadBodySent ? resolve() : reject(new Error("课件上传失败，请重新上传"));
    xhr.ontimeout = () => uploadBodySent ? resolve() : reject(new Error("课件上传超时，请重新上传"));
    xhr.onabort = () => reject(new Error("课件上传已取消"));
    xhr.send(file);
  });
  onProgress(100);
  const metadata = { r2StorageId: grant.r2StorageId, objectKey: grant.objectKey, originalName: grant.originalName, mimeType: grant.mimeType, size: grant.size };
  const confirmed = await requestJson<Omit<Asset, "kind">>("/api/course-uploads/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessType, ...metadata }),
  });
  return { kind: "R2" as const, ...confirmed };
}

export function CourseManagement({ permissions, defaultCourseCover, defaultLessonCover }: { permissions: string[]; defaultCourseCover: string | null; defaultLessonCover: string | null }) {
  const [message, messageContextHolder] = antdMessage.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const { options, loading: brandsLoading, error: brandsError, reload: reloadBrands } = useBusinessDictionaries(["BRAND"]);
  const brandOptions = options.BRAND || [];
  const [filterForm] = Form.useForm<Filters>(); const [courseForm] = Form.useForm<CourseForm>(); const [lessonForm] = Form.useForm<LessonForm>(); const [assignmentForm] = Form.useForm<AssignmentFilters>();
  const [rows, setRows] = useState<Course[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>({}); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false); const [assignmentRows, setAssignmentRows] = useState<AssignmentUser[]>([]);
  const [assignmentTotal, setAssignmentTotal] = useState(0); const [assignmentPage, setAssignmentPage] = useState(1); const [assignmentPageSize, setAssignmentPageSize] = useState(10);
  const [assignmentFilters, setAssignmentFilters] = useState<AssignmentFilters>(defaultAssignmentFilters); const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOptions>({ brands: [], roles: [], tags: [] });
  const [assignmentLoading, setAssignmentLoading] = useState(false); const [assignmentError, setAssignmentError] = useState(false); const [selectedAssignmentUserIds, setSelectedAssignmentUserIds] = useState<string[]>([]); const [assigningCourses, setAssigningCourses] = useState(false);
  const [assignmentSubmitError, setAssignmentSubmitError] = useState<string | null>(null);
  const [mode, setMode] = useState<ModalMode>(); const [courseDetail, setCourseDetail] = useState<Course>(); const [detailLoading, setDetailLoading] = useState(false);
  const [courseDraftId, setCourseDraftId] = useState<string>(); const [courseCover, setCourseCover] = useState<Cover>({ kind: "DEFAULT" });
  const [courseCoverPreview, setCourseCoverPreview] = useState<string | null>(defaultCourseCover); const [courseCoverUploading, setCourseCoverUploading] = useState(false); const [courseCoverProgress, setCourseCoverProgress] = useState(0);
  const [savingCourse, setSavingCourse] = useState(false); const [activeTab, setActiveTab] = useState("info");
  const [courseSaveError, setCourseSaveError] = useState<string | null>(null);
  const courseSaveFlow = useRef(false);
  const [lessonOpen, setLessonOpen] = useState(false); const [lessonView, setLessonView] = useState(false); const [editingLesson, setEditingLesson] = useState<Lesson>();
  const [lessonDiscardOpen, setLessonDiscardOpen] = useState(false);
  const [lessonCover, setLessonCover] = useState<Cover>({ kind: "DEFAULT" }); const [lessonCoverPreview, setLessonCoverPreview] = useState<string | null>(defaultLessonCover);
  const [lessonFile, setLessonFile] = useState<Asset | { kind: "EXISTING" }>(); const [lessonCoverUploading, setLessonCoverUploading] = useState(false); const [lessonFileUploading, setLessonFileUploading] = useState(false); const [lessonUploadProgress, setLessonUploadProgress] = useState(0);
  const [savingLesson, setSavingLesson] = useState(false); const [ordering, setOrdering] = useState(false); const [deletingId, setDeletingId] = useState<string>();
  const [lessonRefreshing, setLessonRefreshing] = useState(false);
  const lessonFileUploadAttemptRef = useRef(0);
  const assignmentRequest = useRef<{ id: string; payloadKey: string } | null>(null);
  const assignmentInFlight = useRef(false);
  const assignmentUsersRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => value && query.set(key, value));
      const result = await requestJson<{ rows: Course[]; total: number }>(`/api/courses?${query}`);
      setRows(result.rows); setTotal(result.total);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [filters, page, pageSize]);
  useEffect(() => { void load(1, 20, {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const selectableIds = new Set(rows.filter(row => row.status === "ENABLED").map(row => row.id));
    setSelectedCourseIds(current => current.filter(id => selectableIds.has(id)));
  }, [rows]);

  const lessons = courseDetail?.lessons || [];
  const applyFilters = (values: Filters) => { const normalized = { ...values, courseName: values.courseName?.trim(), positionKeyword: values.positionKeyword?.trim() }; setSelectedCourseIds([]); setFilters(normalized); setPage(1); void load(1, pageSize, normalized); };
  const resetFilters = () => { filterForm.resetFields(); setSelectedCourseIds([]); setFilters({}); setPage(1); void load(1, pageSize, {}); };

  const loadAssignmentUsers = useCallback(async (nextPage: number, nextPageSize: number, nextFilters: AssignmentFilters) => {
    assignmentUsersRequest.current?.abort();
    const controller = new AbortController();
    assignmentUsersRequest.current = controller;
    setAssignmentLoading(true); setAssignmentError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => value && query.set(key, value));
      const result = await requestJson<{ rows: AssignmentUser[]; total: number; options: AssignmentOptions }>(`/api/course-assignments/users?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAssignmentRows(result.rows); setAssignmentTotal(result.total); setAssignmentOptions(result.options);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setAssignmentError(true); message.error(reason instanceof Error ? reason.message : "待分配用户加载失败，请稍后重试");
    } finally { if (!controller.signal.aborted) setAssignmentLoading(false); }
  }, [message]);

  useEffect(() => {
    if (!assignmentOpen) return;
    // Initialize only after the dialog mounts; a force-rendered Portal does not match SSR markup.
    assignmentForm.resetFields();
    void loadAssignmentUsers(1, 10, defaultAssignmentFilters);
    return () => { assignmentUsersRequest.current?.abort(); };
  }, [assignmentOpen, assignmentForm, loadAssignmentUsers]);

  const openCourseAssignment = () => {
    if (!selectedCourseIds.length) return;
    assignmentRequest.current = null;
    setAssignmentSubmitError(null);
    setAssignmentFilters(defaultAssignmentFilters);
    setSelectedAssignmentUserIds([]); setAssignmentPage(1); setAssignmentPageSize(10);
    setAssignmentRows([]); setAssignmentTotal(0); setAssignmentError(false); setAssignmentLoading(true);
    setAssignmentOpen(true);
  };
  const closeCourseAssignment = () => {
    if (assignmentInFlight.current) return;
    assignmentUsersRequest.current?.abort();
    setAssignmentOpen(false); setSelectedAssignmentUserIds([]);
  };
  const filterAssignmentUsers = (values: AssignmentFilters) => {
    if (assignmentInFlight.current) return;
    const normalized = { ...values, username: values.username?.trim() || undefined };
    setAssignmentFilters(normalized); setSelectedAssignmentUserIds([]); setAssignmentPage(1); void loadAssignmentUsers(1, assignmentPageSize, normalized);
  };
  const resetAssignmentFilters = () => {
    if (assignmentInFlight.current) return;
    assignmentForm.resetFields(); assignmentForm.setFieldsValue(defaultAssignmentFilters); setAssignmentFilters(defaultAssignmentFilters);
    setSelectedAssignmentUserIds([]); setAssignmentPage(1); void loadAssignmentUsers(1, assignmentPageSize, defaultAssignmentFilters);
  };
  const assignCourses = async () => {
    if (assignmentInFlight.current) return;
    if (!selectedCourseIds.length || !selectedAssignmentUserIds.length) {
      setAssignmentSubmitError("请至少选择一门课程和一名用户");
      return;
    }
    assignmentInFlight.current = true;
    setAssigningCourses(true);
    setAssignmentSubmitError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const payload = { courseIds: [...new Set(selectedCourseIds)].sort(), userIds: [...new Set(selectedAssignmentUserIds)].sort() };
      const payloadKey = JSON.stringify(payload);
      // Retrying the same selection reuses its key; changing recipients is a new operation.
      if (assignmentRequest.current?.payloadKey !== payloadKey) assignmentRequest.current = { id: createClientRequestId(), payloadKey };
      const result = await requestJson<{ success: boolean; recordNo: string; courseCount: number; userCount: number }>("/api/course-assignments", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...payload, clientRequestId: assignmentRequest.current.id }),
      });
      if (result.success !== true || !result.recordNo || result.courseCount !== payload.courseIds.length || result.userCount !== payload.userIds.length) {
        throw new Error("分配结果尚未确认，请重试。同一次分配不会重复生成记录");
      }
      setAssignmentOpen(false); setSelectedAssignmentUserIds([]); setSelectedCourseIds([]);
      message.success(`分配完成：批次 ${result.recordNo}，已将 ${result.courseCount} 门课程分配给 ${result.userCount} 名用户`);
    } catch (reason) {
      const error = controller.signal.aborted ? "请求超时，分配结果尚未确认，请重试。同一次分配不会重复生成记录" : reason instanceof Error ? reason.message : "课程分配失败，请稍后重试";
      setAssignmentSubmitError(error);
      message.error(error);
    } finally {
      clearTimeout(timeout);
      assignmentInFlight.current = false;
      setAssigningCourses(false);
    }
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try { const detail = await requestJson<Course>(`/api/courses/${id}`); setCourseDetail(detail); return detail; }
    catch (reason) { message.error(reason instanceof Error ? reason.message : "课程详情加载失败，请稍后重试"); return undefined; }
    finally { setDetailLoading(false); }
  };

  const refreshLessons = async () => {
    const url = mode === "create"
      ? courseDraftId ? `/api/course-drafts/${courseDraftId}/lessons` : null
      : courseDetail?.id ? `/api/courses/${courseDetail.id}/lessons` : null;
    if (!url) return false;
    setLessonRefreshing(true);
    try {
      const result = await requestJson<{ lessons: Lesson[]; total: number }>(url);
      setCourseDetail(current => current ? { ...current, lessons: result.lessons, lessonCount: result.total } : current);
      return true;
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "课时列表刷新失败，请稍后重试");
      return false;
    } finally { setLessonRefreshing(false); }
  };

  const openCreate = async () => {
    setCourseSaveError(null);
    try {
      const draft = await requestJson<{ courseDraftId: string }>("/api/courses/drafts", { method: "POST" });
      setCourseDraftId(draft.courseDraftId); setCourseDetail({ id: "", recordNo: "", courseName: "", applicablePosition: "", status: "ENABLED", createdByName: "", createdAtText: "", version: 1, brandCodes: [], brands: [], hasLearningProgress: false, lessons: [] });
      courseForm.setFieldsValue({ courseName: "", courseDescription: "", applicablePosition: "", brandCodes: brandOptions.map(item => item.value), status: "ENABLED" });
      setCourseCover({ kind: "DEFAULT" }); setCourseCoverPreview(defaultCourseCover); setActiveTab("info"); setMode("create");
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "课程草稿创建失败，请稍后重试"); }
  };

  const openCourse = async (row: Course, nextMode: "edit" | "view") => {
    setCourseSaveError(null);
    setMode(nextMode); setActiveTab("info"); const detail = await loadDetail(row.id);
    if (!detail) { setMode(undefined); return; }
    courseForm.setFieldsValue({ courseName: detail.courseName, courseDescription: detail.courseDescription || "", applicablePosition: detail.applicablePosition, brandCodes: detail.brandCodes, status: detail.status });
    setCourseCover({ kind: "EXISTING" }); setCourseCoverPreview(detail.coverUrl || defaultCourseCover);
  };

  const closeCourseNow = async (deleteDraft = true) => {
    setCourseSaveError(null);
    const draft = courseDraftId; setMode(undefined); setCourseDetail(undefined); setCourseDraftId(undefined); setActiveTab("info"); courseForm.resetFields();
    if (deleteDraft && draft) await fetch(`/api/courses/drafts/${draft}`, { method: "DELETE" }).catch(() => undefined);
  };
  const closeCourse = () => {
    if (courseSaveFlow.current) return;
    if (mode !== "create") { void closeCourseNow(); return; }
    const hasDraftContent = courseForm.isFieldsTouched() || lessons.length > 0 || courseCover.kind === "R2";
    if (!hasDraftContent) { void closeCourseNow(); return; }
    modal.confirm({
      zIndex: 2100, title: "当前课程尚未保存", content: "关闭后课程信息和草稿课时将不会形成正式业务数据，是否继续？",
      okText: "继续关闭", cancelText: "返回编辑", onOk: () => closeCourseNow(),
    });
  };

  const courseFormError = (reason: unknown) => {
    if (reason && typeof reason === "object" && "errorFields" in reason) {
      const errorFields = (reason as { errorFields?: { errors?: string[] }[] }).errorFields;
      return errorFields?.flatMap(field => field.errors || [])[0] || "请检查课程信息后重试";
    }
    return reason instanceof Error ? reason.message : "课程保存失败，请稍后重试";
  };

  const persistCourse = async (values: CourseForm, savedAsDisabled = false) => {
    setSavingCourse(true); setCourseSaveError(null);
    try {
      const body = { ...values, courseDescription: values.courseDescription?.trim() || null, cover: courseCover, courseDraftId, ...(mode === "edit" ? { version: courseDetail?.version } : {}) };
      await requestJson(mode === "create" ? "/api/courses" : `/api/courses/${courseDetail?.id}`, { method: mode === "create" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      message.success(savedAsDisabled ? "课程已保存为禁用状态" : mode === "create" ? "课程新增成功" : "课程编辑成功");
      await closeCourseNow(false); await load();
    } catch (reason) { const error = courseFormError(reason); setCourseSaveError(error); message.error(error); }
    finally { setSavingCourse(false); }
  };

  const saveCourse = async () => {
    if (!mode || mode === "view" || courseCoverUploading || courseSaveFlow.current) return;
    courseSaveFlow.current = true;
    setCourseSaveError(null);
    try {
      const values = await courseForm.validateFields();
      if (!courseCoverPreview) throw new Error("请上传课程封面");
      if (values.status === "ENABLED" && lessons.length === 0) {
        // Render in this React tree; static Modal.confirm cannot mount on React 19.
        await modal.confirm({
          zIndex: 2100,
          title: "启用课程至少需要添加一个课时",
          content: "当前课程暂无课时。你可以先将课程保存为禁用状态，后续添加课时后再启用；也可以返回继续添加课时。",
          okText: "保存为禁用课程",
          cancelText: "继续添加课时",
          onOk: () => persistCourse({ ...values, status: "DISABLED" }, true),
          onCancel: () => setActiveTab("lessons"),
        });
        return;
      }
      await persistCourse(values);
    } catch (reason) { const error = courseFormError(reason); setActiveTab("info"); setCourseSaveError(error); message.error(error); }
    finally { courseSaveFlow.current = false; }
  };

  const uploadCover = async (file: File, kind: "COURSE_COVER" | "LESSON_COVER") => {
    const setUploading = kind === "COURSE_COVER" ? setCourseCoverUploading : setLessonCoverUploading;
    try {
      setUploading(true); const asset = await uploadAsset(file, kind, kind === "COURSE_COVER" ? setCourseCoverProgress : setLessonUploadProgress);
      const preview = URL.createObjectURL(file);
      if (kind === "COURSE_COVER") { setCourseCover(asset); setCourseCoverPreview(preview); } else { setLessonCover(asset); setLessonCoverPreview(preview); }
      message.success("封面上传成功");
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "封面上传失败，请重新上传"); }
    finally { setUploading(false); }
  };

  const openAddLesson = () => {
    lessonFileUploadAttemptRef.current += 1;
    setEditingLesson(undefined); setLessonView(false); setLessonOpen(true); lessonForm.resetFields(); lessonForm.setFieldsValue({ coursewareType: undefined as never });
    setLessonCover({ kind: "DEFAULT" }); setLessonCoverPreview(defaultLessonCover); setLessonFile(undefined); setLessonFileUploading(false); setLessonUploadProgress(0);
  };
  const openEditLesson = (lesson: Lesson) => {
    lessonFileUploadAttemptRef.current += 1;
    setEditingLesson(lesson); setLessonView(false); setLessonOpen(true); lessonForm.setFieldsValue({ chapterName: lesson.chapterName, chapterDescription: lesson.chapterDescription || "", coursewareType: lesson.coursewareType, remark: lesson.remark || "" });
    setLessonCover({ kind: "EXISTING" }); setLessonCoverPreview(lesson.coverUrl || defaultLessonCover); setLessonFile({ kind: "EXISTING" }); setLessonFileUploading(false); setLessonUploadProgress(0);
  };
  const openViewLesson = (lesson: Lesson) => { setEditingLesson(lesson); setLessonView(true); setLessonOpen(true); };
  const closeLessonNow = () => { lessonFileUploadAttemptRef.current += 1; setLessonDiscardOpen(false); setLessonFileUploading(false); setLessonOpen(false); };
  const closeLesson = () => {
    if (lessonView) { closeLessonNow(); return; }
    setLessonDiscardOpen(true);
  };

  const uploadLessonFile = async (file: File) => {
    const type = lessonForm.getFieldValue("coursewareType");
    if (!type) { message.warning("请先选择课件类型"); return; }
    const attempt = ++lessonFileUploadAttemptRef.current;
    const previousFile = lessonFile;
    try {
      setLessonFileUploading(true); setLessonUploadProgress(0);
      const asset = await uploadAsset(file, type, percent => { if (attempt === lessonFileUploadAttemptRef.current) setLessonUploadProgress(percent); });
      if (attempt !== lessonFileUploadAttemptRef.current) return;
      setLessonFile(asset); message.success("课件上传成功");
    } catch (reason) {
      if (attempt !== lessonFileUploadAttemptRef.current) return;
      setLessonFile(previousFile); message.error(reason instanceof Error ? reason.message : "课件上传失败，请重新上传");
    } finally { if (attempt === lessonFileUploadAttemptRef.current) setLessonFileUploading(false); }
  };

  const saveLesson = async () => {
    if (lessonFileUploading || lessonCoverUploading) return;
    try {
      const values = await lessonForm.validateFields(); if (!lessonFile) throw new Error("请选择课件文件"); setSavingLesson(true);
      const body = { ...values, chapterDescription: values.chapterDescription?.trim() || null, remark: values.remark?.trim() || null, cover: lessonCover, file: lessonFile, ...(editingLesson ? { version: editingLesson.version } : {}) };
      const url = editingLesson ? `/api/course-lessons/${editingLesson.id}` : mode === "create" ? `/api/course-drafts/${courseDraftId}/lessons` : `/api/courses/${courseDetail?.id}/lessons`;
      const saved = await requestJson<Lesson>(url, { method: editingLesson ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setCourseDetail(current => current ? { ...current, lessons: editingLesson ? current.lessons?.map(item => item.id === saved.id ? saved : item) : [...(current.lessons || []), saved] } : current);
      closeLessonNow(); setActiveTab("lessons");
      message.success(editingLesson ? "课时编辑成功" : "课时添加成功");
    } catch (reason) { if (reason instanceof Error) message.error(reason.message); }
    finally { setSavingLesson(false); }
  };

  const deleteLesson = (lesson: Lesson) => modal.confirm({ zIndex: 2100, title: "删除课时", content: "删除课时后，该课时将从当前课程中移除，是否继续？", okText: "确认删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => {
    try { setDeletingId(lesson.id); await requestJson(`/api/course-lessons/${lesson.id}`, { method: "DELETE" }); setCourseDetail(current => current ? { ...current, lessons: current.lessons?.filter(item => item.id !== lesson.id) } : current); await refreshLessons(); message.success("课时删除成功，列表已刷新"); }
    catch (reason) { message.error(reason instanceof Error ? reason.message : "课时删除失败，请稍后重试"); } finally { setDeletingId(undefined); }
  }});

  const moveLesson = async (index: number, direction: -1 | 1) => {
    const next = [...lessons]; const target = index + direction; if (target < 0 || target >= next.length || ordering) return;
    [next[index], next[target]] = [next[target], next[index]]; setOrdering(true);
    try {
      const versions = Object.fromEntries(lessons.map(item => [item.id, item.version]));
      const url = mode === "create" ? `/api/course-drafts/${courseDraftId}/lessons/order` : `/api/courses/${courseDetail?.id}/lessons/order`;
      const result = await requestJson<{ lessons: Lesson[] }>(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonIds: next.map(item => item.id), versions }) });
      setCourseDetail(current => current ? { ...current, lessons: result.lessons } : current); message.success("课时顺序已更新");
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "课时顺序更新失败，请稍后重试"); if (courseDetail?.id && mode !== "create") await loadDetail(courseDetail.id); }
    finally { setOrdering(false); }
  };

  const changeStatus = (course: Course) => {
    const enabling = course.status === "DISABLED";
    modal.confirm({ title: enabling ? "确认启用该课程？" : "确认禁用该课程？", content: enabling ? "启用后，符合品牌范围的移动端学员可以看到该课程。" : "禁用后，该课程不再向新学员开放，历史学习记录仍会保留。", okText: enabling ? "确认启用" : "确认禁用", cancelText: "取消", onOk: async () => {
      try { await requestJson(`/api/courses/${course.id}/${enabling ? "enable" : "disable"}`, { method: "POST" }); message.success(enabling ? "课程已启用" : "课程已禁用"); void load(); }
      catch (reason) { message.error(reason instanceof Error ? reason.message : "课程状态更新失败，请稍后重试"); }
    } });
  };

  const deleteCourse = (course: Course) => modal.confirm({ title: "温馨提示", content: "删除操作不可逆，一旦删除成功，当前课程及其相关课时配置将无法恢复，请谨慎操作。", okText: "我知道了，继续删除", okButtonProps: { danger: true }, cancelText: "我再想想", onOk: async () => {
    try { setDeletingId(course.id); await requestJson(`/api/courses/${course.id}`, { method: "DELETE" }); message.success("课程删除成功"); void load(); }
    catch (reason) { message.error(reason instanceof Error ? reason.message : "课程删除失败，请稍后重试"); } finally { setDeletingId(undefined); }
  }});

  const courseColumns: ColumnsType<Course> = [
    { title: "记录编号", dataIndex: "recordNo", width: 130, fixed: "left" },
    { title: "课程名称", dataIndex: "courseName", width: 210, ellipsis: true },
    { title: "课程封面", dataIndex: "coverUrl", width: 100, render: value => value ? <Image width={64} height={40} style={{ objectFit: "cover", borderRadius: 6 }} src={value} fallback={defaultCourseCover || undefined} /> : <div className="course-cover-fallback"><FileOutlined /></div> },
    { title: "适用品牌", dataIndex: "brands", width: 220, render: (value: Course["brands"]) => <Tooltip title={value.map(item => item.brandLabel).join("、")}><span>{value.slice(0, 2).map(item => item.brandLabel).join("、")}{value.length > 2 ? ` +${value.length - 2}` : ""}</span></Tooltip> },
    { title: "状态", dataIndex: "status", width: 100, render: value => <Tag color={value === "ENABLED" ? "success" : "default"}>{value === "ENABLED" ? "已启用" : "已禁用"}</Tag> },
    { title: "创建人", dataIndex: "createdByName", width: 120 }, { title: "创建时间", dataIndex: "createdAtText", width: 180 },
    { title: "操作", key: "actions", fixed: "right", width: 300, render: (_, row) => <Space size={0} className="table-actions">
      {can(permissions, "courses", "view") && <Button type="link" icon={<EyeOutlined />} onClick={() => void openCourse(row, "view")}>查看</Button>}
      {can(permissions, "courses", "edit") && <Button type="link" icon={<EditOutlined />} onClick={() => void openCourse(row, "edit")}>编辑</Button>}
      {can(permissions, "courses", row.status === "ENABLED" ? "disable" : "enable") && <Button type="link" onClick={() => changeStatus(row)}>{row.status === "ENABLED" ? "禁用" : "启用"}</Button>}
      {can(permissions, "courses", "delete") && <Tooltip title={row.hasLearningProgress ? "已有学员学习记录，请使用禁用" : undefined}><span><Button danger type="link" icon={<DeleteOutlined />} disabled={row.hasLearningProgress} loading={deletingId === row.id} onClick={() => deleteCourse(row)}>删除</Button></span></Tooltip>}
    </Space> },
  ];

  const lessonColumns: ColumnsType<Lesson> = [
    { title: "记录编号", dataIndex: "recordNo", width: 130 }, { title: "章节名称", dataIndex: "chapterName", width: 190, ellipsis: true },
    { title: "课件类型", dataIndex: "coursewareType", width: 100, render: value => <Tag color="blue">{typeLabels[value as CoursewareType]}</Tag> },
    { title: "课件名称", dataIndex: "originalFileName", width: 220, ellipsis: true }, { title: "课件容量", dataIndex: "fileSizeText", width: 110 },
    { title: "创建人", dataIndex: "createdByName", width: 110 }, { title: "创建时间", dataIndex: "createdAtText", width: 180 },
    { title: "操作", key: "actions", fixed: "right", width: mode === "view" ? 80 : 290, render: (_, row, index) => <Space size={0} className="table-actions">
      {mode !== "view" && can(permissions, "course-lessons", "order") && <><Button type="link" icon={<ArrowUpOutlined />} disabled={index === 0 || ordering} onClick={() => void moveLesson(index, -1)}>上移</Button><Button type="link" icon={<ArrowDownOutlined />} disabled={index === lessons.length - 1 || ordering} onClick={() => void moveLesson(index, 1)}>下移</Button></>}
      {mode !== "view" && can(permissions, "course-lessons", "edit") && <Button type="link" onClick={() => openEditLesson(row)}>编辑</Button>}
      {can(permissions, "course-lessons", "view") && <Button type="link" onClick={() => openViewLesson(row)}>查看</Button>}
      {mode !== "view" && can(permissions, "course-lessons", "delete") && <Tooltip title={row.hasLearningProgress ? "该课时已有学员学习记录" : undefined}><span><Button danger type="link" disabled={row.hasLearningProgress} loading={deletingId === row.id} onClick={() => deleteLesson(row)}>删除</Button></span></Tooltip>}
    </Space> },
  ];

  const assignmentColumns: ColumnsType<AssignmentUser> = [
    { title: "真实姓名", dataIndex: "realName", width: 130, fixed: "left" },
    { title: "登录账号", dataIndex: "username", width: 150 },
    { title: "手机号码", dataIndex: "phone", width: 140, render: value => value || "-" },
    { title: "用户标签", dataIndex: "tags", width: 240, render: value => value ? <Space size={[4, 4]} wrap>{String(value).split("|").filter(Boolean).map(tag => <Tag key={tag}>{tag}</Tag>)}</Space> : "-" },
    { title: "用户角色", dataIndex: ["role", "name"], width: 160 },
    { title: "账号状态", dataIndex: "status", width: 110, render: value => <Tag color={value === "ENABLED" ? "success" : "default"}>{value === "ENABLED" ? "已启用" : "已禁用"}</Tag> },
  ];

  const watchedCourseware = Form.useWatch("coursewareType", lessonForm);
  const courseInfo = mode === "view" ? <Descriptions bordered column={2} size="small">
    <Descriptions.Item label="记录编号">{courseDetail?.recordNo}</Descriptions.Item><Descriptions.Item label="课程名称">{courseDetail?.courseName}</Descriptions.Item>
    <Descriptions.Item label="课程简介" span={2}>{courseDetail?.courseDescription || "-"}</Descriptions.Item><Descriptions.Item label="课程封面" span={2}>{courseDetail?.coverUrl && <Image width={180} src={courseDetail.coverUrl} />}</Descriptions.Item>
    <Descriptions.Item label="适用岗位">{courseDetail?.applicablePosition}</Descriptions.Item><Descriptions.Item label="适用品牌">{courseDetail?.brands.map(item => item.brandLabel).join("、")}</Descriptions.Item>
    <Descriptions.Item label="课程状态">{courseDetail?.status === "ENABLED" ? "已启用" : "已禁用"}</Descriptions.Item><Descriptions.Item label="创建人">{courseDetail?.createdByName}</Descriptions.Item><Descriptions.Item label="创建时间" span={2}>{courseDetail?.createdAtText}</Descriptions.Item>
  </Descriptions> : <Form name="course-info" form={courseForm} layout="vertical" preserve={false} initialValues={mode === "create" ? { courseName: "", courseDescription: "", applicablePosition: "", brandCodes: brandOptions.map(item => item.value), status: "ENABLED" } : undefined}><div className="course-form-grid">
    <Form.Item label="记录编号"><Input disabled placeholder="保存成功后自动生成" value={courseDetail?.recordNo} /></Form.Item>
    <Form.Item name="courseName" label="课程名称" rules={[{ required: true, message: "请输入课程名称" }, { max: 30, message: "课程名称不能超过30个字符" }]}><Input maxLength={30} placeholder="请输入课程名称" /></Form.Item>
    <Form.Item className="course-form-span" name="courseDescription" label="课程简介" rules={[{ max: 200, message: "课程简介不能超过200个字符" }]}><Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入课程简介（选填）" /></Form.Item>
    <Form.Item className="course-form-span" label="封面图片" required validateStatus={!courseCoverPreview ? "error" : undefined} help={!courseCoverPreview ? "请上传课程封面" : courseCoverUploading ? `上传中 ${courseCoverProgress}%` : undefined}><div className="course-cover-upload">{courseCoverPreview ? <Image width={180} height={112} style={{ objectFit: "cover", borderRadius: 8 }} src={courseCoverPreview} /> : <div className="course-cover-placeholder"><FileOutlined />暂无默认封面</div>}<Upload accept=".jpg,.jpeg,.png,.webp" showUploadList={false} beforeUpload={file => { void uploadCover(file, "COURSE_COVER"); return Upload.LIST_IGNORE; }}><Button icon={<UploadOutlined />} loading={courseCoverUploading}>{courseCoverPreview ? "重新选择" : "上传封面"}</Button></Upload></div></Form.Item>
    <Form.Item name="applicablePosition" label="适用岗位" rules={[{ required: true, message: "请输入适用岗位" }, { max: 30, message: "适用岗位不能超过30个字符" }]}><Input maxLength={30} placeholder="请输入适用岗位" /></Form.Item>
    <Form.Item name="status" label="课程状态" rules={[{ required: true }]}><Select options={[{ value: "ENABLED", label: "启用" }, { value: "DISABLED", label: "禁用" }]} /></Form.Item>
    <Form.Item className="course-form-span" name="brandCodes" label="适用品牌" rules={[{ required: true, type: "array", min: 1, message: "请至少选择一个适用品牌" }]}><Checkbox.Group options={brandOptions} /></Form.Item>
    {mode === "edit" && <><Form.Item label="创建人"><Input disabled value={courseDetail?.createdByName} /></Form.Item><Form.Item label="创建时间"><Input disabled value={courseDetail?.createdAtText} /></Form.Item></>}
  </div></Form>;

  return <>
    {messageContextHolder}
    {modalContextHolder}
    {brandsError && <Alert className="course-alert" type="error" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadBrands()}>重试</Button>} />}
    <Card className="course-filter-card"><Form form={filterForm} layout="vertical" onFinish={applyFilters}><div className="course-filter-grid">
      <Form.Item name="courseName" label="课程名称"><Input allowClear maxLength={30} placeholder="请输入课程名称" onPressEnter={() => filterForm.submit()} /></Form.Item>
      <Form.Item name="positionKeyword" label="适用岗位"><Input allowClear maxLength={30} placeholder="请输入适用岗位" onPressEnter={() => filterForm.submit()} /></Form.Item>
      <Form.Item name="brand" label="适用品牌"><Select allowClear loading={brandsLoading} placeholder="全部" options={brandOptions} /></Form.Item>
      <Form.Item name="status" label="课程状态"><Select allowClear placeholder="全部" options={[{ value: "ENABLED", label: "已启用" }, { value: "DISABLED", label: "已禁用" }]} /></Form.Item>
      <div className="course-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>筛选</Button></Space></div>
    </div></Form></Card>
    <Card className="course-list-card"><div className="course-toolbar"><span>共 {total} 条课程记录{selectedCourseIds.length ? `，已选择 ${selectedCourseIds.length} 条` : ""}</span><Space>{can(permissions, "courses", "edit") && <Button icon={<UsergroupAddOutlined />} disabled={loading || selectedCourseIds.length === 0} onClick={openCourseAssignment}>课程分配</Button>}{can(permissions, "courses", "create") && <Button type="primary" icon={<PlusOutlined />} disabled={brandsLoading || !brandOptions.length} onClick={() => void openCreate()}>新增</Button>}</Space></div>
      {loadError ? <Alert type="error" showIcon message="课程数据加载失败，请稍后重试" action={<Button onClick={() => void load()}>重试</Button>} /> : <Table rowKey="id" loading={loading} rowSelection={{ selectedRowKeys: selectedCourseIds, columnWidth: 48, fixed: true, getCheckboxProps: row => ({ disabled: row.status !== "ENABLED", title: row.status !== "ENABLED" ? "禁用课程不可分配" : undefined }), onChange: (_, selectedRows) => setSelectedCourseIds(selectedRows.filter(row => row.status === "ENABLED").map(row => row.id)) }} columns={courseColumns} dataSource={rows} scroll={{ x: 1448 }} locale={{ emptyText: <Empty description={<span>{Object.values(filters).some(Boolean) ? "没有找到符合当前条件的课程" : "暂无课程"}<br/><small>{Object.values(filters).some(Boolean) ? "请调整筛选条件后重试" : "当前还没有创建培训课程"}</small></span>}>{Object.values(filters).some(Boolean) ? <Button onClick={resetFilters}>重置筛选</Button> : can(permissions, "courses", "create") && <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreate()}>新增</Button>}</Empty> }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (p, s) => { setSelectedCourseIds([]); setPage(p); setPageSize(s); void load(p, s, filters); } }} />}
    </Card>

    {assignmentOpen && <Modal className="course-assignment-modal" width={1180} title="请选择用户" open onCancel={closeCourseAssignment} closable={!assigningCourses} maskClosable={false} footer={<Space><Button disabled={assigningCourses} onClick={closeCourseAssignment}>取消分配</Button><Button type="primary" loading={assigningCourses} disabled={assignmentLoading || assignmentError || !selectedAssignmentUserIds.length} onClick={() => void assignCourses()}>{assigningCourses ? "分配中..." : "立即分配"}</Button></Space>}>
      <Alert className="course-assignment-summary" type="info" showIcon message={`已选择 ${selectedCourseIds.length} 门课程，请选择需要分配的用户`} />
      {assignmentSubmitError && <Alert className="course-assignment-summary" type="error" showIcon message={assignmentSubmitError} />}
      <Card size="small" title="筛选条件" className="course-assignment-filter-card">
        <Form name="course-assignment-users" form={assignmentForm} disabled={assigningCourses} layout="vertical" preserve={false} initialValues={defaultAssignmentFilters} onFinish={filterAssignmentUsers}>
          <div className="course-assignment-filter-grid">
            <Form.Item name="brand" label="品牌"><Select allowClear placeholder="全部" options={assignmentOptions.brands} /></Form.Item>
            <Form.Item name="roleId" label="角色"><Select allowClear placeholder="全部" options={assignmentOptions.roles.map(role => ({ value: role.id, label: role.status === "ENABLED" ? role.name : `${role.name}（已禁用）` }))} /></Form.Item>
            <Form.Item name="tag" label="标签"><Select allowClear showSearch optionFilterProp="label" placeholder="全部" options={assignmentOptions.tags.map(tag => ({ value: tag, label: tag }))} /></Form.Item>
            <Form.Item name="username" label="用户名"><Input allowClear maxLength={30} placeholder="请输入用户名或登录账号" onPressEnter={() => assignmentForm.submit()} /></Form.Item>
            <Form.Item name="status" label="账号状态"><Select allowClear placeholder="全部" options={[{ value: "ENABLED", label: "已启用" }, { value: "DISABLED", label: "已禁用" }]} /></Form.Item>
          </div>
          <div className="course-assignment-filter-actions"><Space><Button onClick={resetAssignmentFilters}>重置</Button><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>筛选</Button></Space></div>
        </Form>
      </Card>
      <div inert={assigningCourses} aria-busy={assigningCourses}><Card size="small" title="用户列表" extra={<span>共 {assignmentTotal} 名用户{selectedAssignmentUserIds.length ? `，已选择 ${selectedAssignmentUserIds.length} 名` : ""}</span>}>
        {assignmentError ? <Alert type="error" showIcon message="待分配用户加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadAssignmentUsers(assignmentPage, assignmentPageSize, assignmentFilters)}>重试</Button>} /> : <Table rowKey="id" size="small" loading={assignmentLoading} rowSelection={{ selectedRowKeys: selectedAssignmentUserIds, preserveSelectedRowKeys: true, columnWidth: 48, fixed: true, onChange: keys => setSelectedAssignmentUserIds(keys.map(String)) }} columns={assignmentColumns} dataSource={assignmentRows} scroll={{ x: 930, y: 360 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的用户" /> }} pagination={{ current: assignmentPage, pageSize: assignmentPageSize, total: assignmentTotal, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextPageSize) => { setAssignmentPage(nextPage); setAssignmentPageSize(nextPageSize); void loadAssignmentUsers(nextPage, nextPageSize, assignmentFilters); } }} />}
      </Card></div>
    </Modal>}

    <Modal className="course-detail-modal" width={1220} title={mode === "create" ? "新增课程" : mode === "edit" ? "编辑课程详情" : "查看课程详情"} open={Boolean(mode)} onCancel={closeCourse} maskClosable={false} destroyOnHidden footer={mode === "view" ? <Button onClick={closeCourse}>关闭</Button> : <Space><Button onClick={closeCourse}>取消</Button><Button type="primary" loading={savingCourse} disabled={courseCoverUploading} onClick={() => void saveCourse()}>{savingCourse ? "保存中..." : "保存"}</Button></Space>}>
      {courseSaveError && <Alert className="course-alert" type="error" showIcon message={courseSaveError} />}
      {detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : <Tabs activeKey={activeTab} onChange={key => { setActiveTab(key); if (key === "lessons") void refreshLessons(); }} items={[
        { key: "info", label: "课程信息", children: courseInfo },
        { key: "lessons", label: `课程课时${lessons.length ? `（${lessons.length}）` : ""}`, children: <div className="course-lessons-panel">{mode !== "view" && can(permissions, "course-lessons", "create") && <div className="course-lessons-toolbar"><Button type="primary" icon={<PlusOutlined />} onClick={openAddLesson}>添加课时</Button>{(ordering || lessonRefreshing) && <span>更新中...</span>}</div>}<Table rowKey="id" size="small" loading={lessonRefreshing} columns={lessonColumns} dataSource={lessons} scroll={{ x: mode === "view" ? 1000 : 1300 }} pagination={false} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>暂无课时<br/><small>{mode === "view" ? "该课程尚未配置课时" : "点击“添加课时”创建第一个课时"}</small></span>} /> }} /></div> },
      ]} />}
    </Modal>

    <Modal className="lesson-form-modal" width={900} title={lessonView ? "查看课时" : editingLesson ? "编辑课时" : "添加课时"} open={lessonOpen} onCancel={closeLesson} maskClosable={false} destroyOnHidden footer={lessonView ? <Button onClick={() => setLessonOpen(false)}>关闭</Button> : <Space><Button onClick={closeLesson}>取消</Button><Button type="primary" loading={savingLesson} disabled={lessonCoverUploading || lessonFileUploading} onClick={() => void saveLesson()}>{savingLesson ? "保存中..." : "保存"}</Button></Space>}>
      {lessonView && editingLesson ? <div className="lesson-view"><Descriptions bordered column={2} size="small"><Descriptions.Item label="记录编号">{editingLesson.recordNo}</Descriptions.Item><Descriptions.Item label="章节名称">{editingLesson.chapterName}</Descriptions.Item><Descriptions.Item label="章节概述" span={2}>{editingLesson.chapterDescription || "-"}</Descriptions.Item><Descriptions.Item label="课时封面" span={2}>{editingLesson.coverUrl && <Image width={180} src={editingLesson.coverUrl} />}</Descriptions.Item><Descriptions.Item label="课件类型">{typeLabels[editingLesson.coursewareType]}</Descriptions.Item><Descriptions.Item label="课件容量">{editingLesson.fileSizeText}</Descriptions.Item><Descriptions.Item label="课件名称" span={2}>{editingLesson.originalFileName}</Descriptions.Item><Descriptions.Item label="备注" span={2}>{editingLesson.remark || "-"}</Descriptions.Item><Descriptions.Item label="创建人">{editingLesson.createdByName}</Descriptions.Item><Descriptions.Item label="创建时间">{editingLesson.createdAtText}</Descriptions.Item></Descriptions><div className="lesson-preview">{editingLesson.coursewareType === "VIDEO" ? <video controls preload="metadata" src={editingLesson.fileUrl} /> : editingLesson.coursewareType === "AUDIO" ? <audio controls preload="metadata" src={editingLesson.fileUrl} /> : editingLesson.coursewareType === "PDF" ? <iframe title="PDF预览" src={editingLesson.fileUrl} /> : <Alert type="info" showIcon message="PPT浏览器原生预览能力有限" description="可下载文件后使用演示文稿软件查看。" />}<Button icon={<DownloadOutlined />} href={`${editingLesson.fileUrl}&download=1`}>下载课件</Button></div></div> : <Form form={lessonForm} layout="vertical" preserve={false}><div className="lesson-form-grid">
        <Form.Item label="记录编号"><Input disabled value={editingLesson?.recordNo} placeholder="保存成功后自动生成" /></Form.Item>
        <Form.Item name="chapterName" label="章节名称" rules={[{ required: true, message: "请输入章节名称" }, { max: 30, message: "章节名称不能超过30个字符" }]}><Input maxLength={30} placeholder="请输入章节名称" /></Form.Item>
        <Form.Item className="lesson-form-span" name="chapterDescription" label="章节概述" rules={[{ max: 200, message: "章节概述不能超过200个字符" }]}><Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入章节概述（选填）" /></Form.Item>
        <Form.Item className="lesson-form-span" label="课时封面" required><div className="course-cover-upload">{lessonCoverPreview ? <Image width={180} height={112} style={{ objectFit: "cover", borderRadius: 8 }} src={lessonCoverPreview} /> : <div className="course-cover-placeholder"><FileOutlined />暂无默认封面</div>}<Upload accept=".jpg,.jpeg,.png,.webp" showUploadList={false} beforeUpload={file => { void uploadCover(file, "LESSON_COVER"); return Upload.LIST_IGNORE; }}><Button icon={<UploadOutlined />} loading={lessonCoverUploading}>{lessonCoverPreview ? "重新选择" : "上传封面"}</Button></Upload></div></Form.Item>
        <Form.Item name="coursewareType" label="课件类型" rules={[{ required: true, message: "请选择课件类型" }]}><Select disabled={lessonFileUploading} placeholder="请选择" options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))} onChange={() => { lessonFileUploadAttemptRef.current += 1; if (lessonFile) { setLessonFile(undefined); message.info("课件类型已变更，请重新选择对应格式文件"); } }} /></Form.Item>
        <Form.Item label="选择文件" required validateStatus={lessonFileUploading ? "validating" : lessonFile ? "success" : "error"} help={lessonFileUploading ? lessonUploadProgress >= 100 ? "文件已上传，正在确认上传结果..." : `上传中 ${lessonUploadProgress}%` : lessonFile ? "课件上传成功" : "请选择课件文件"}><div className="lesson-file-upload"><Upload accept={watchedCourseware ? acceptByType[watchedCourseware] : undefined} showUploadList={false} beforeUpload={file => { void uploadLessonFile(file); return Upload.LIST_IGNORE; }}><Button icon={<UploadOutlined />} loading={lessonFileUploading} disabled={!watchedCourseware}>{lessonFile ? "重新上传" : "选择文件"}</Button></Upload>{lessonFile && <span><FileOutlined /> {"kind" in lessonFile && lessonFile.kind === "EXISTING" ? editingLesson?.originalFileName : (lessonFile as Asset).originalName}{"kind" in lessonFile && lessonFile.kind === "R2" ? ` · ${((lessonFile as Asset).size / 1024 / 1024).toFixed(2)} MB` : editingLesson ? ` · ${editingLesson.fileSizeText}` : ""}</span>}</div></Form.Item>
        <Form.Item className="lesson-form-span" name="remark" label="备注" rules={[{ max: 200, message: "备注不能超过200个字符" }]}><Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入备注（选填）" /></Form.Item>
        {editingLesson && <><Form.Item label="创建人"><Input disabled value={editingLesson.createdByName} /></Form.Item><Form.Item label="创建时间"><Input disabled value={editingLesson.createdAtText} /></Form.Item></>}
      </div></Form>}
    </Modal>
    <UnsavedChangesModal open={lessonDiscardOpen} title="当前课时尚未保存" okText="继续关闭" cancelText="返回编辑" onKeep={() => setLessonDiscardOpen(false)} onDiscard={closeLessonNow} />
  </>;
}
