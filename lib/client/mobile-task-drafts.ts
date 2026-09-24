"use client";

export type LocalTaskDraftFile = {
  clientId: string;
  itemIndex: number;
  name: string;
  type: string;
  lastModified: number;
  file: Blob;
};

export type LocalTaskDraft<TTask = unknown> = {
  key: string;
  taskInstanceId: string;
  channel: "store-h5" | "lead-h5";
  savedAt: string;
  serverSynced: boolean;
  values: Record<string, string | number>;
  fallbackItemIndexes: number[];
  task: TTask;
  files: LocalTaskDraftFile[];
};

const DATABASE_NAME = "canyin-mobile-task-drafts";
const STORE_NAME = "task-drafts";

export function mobileTaskDraftKey(channel: "store-h5" | "lead-h5", ownerUserId: string, taskInstanceId: string) {
  return `${channel}:${ownerUserId}:${taskInstanceId}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("当前浏览器不支持本机暂存"));
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本机暂存空间"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("本机暂存操作失败")); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("本机暂存操作已取消")); };
    action(store, resolve, reject);
  });
}

export function getLocalTaskDraft<TTask = unknown>(key: string) {
  return withStore<LocalTaskDraft<TTask> | null>("readonly", (store, resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as LocalTaskDraft<TTask> | undefined) || null);
    request.onerror = () => reject(request.error || new Error("读取本机草稿失败"));
  });
}

export function saveLocalTaskDraft<TTask>(draft: LocalTaskDraft<TTask>) {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(draft);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("保存本机草稿失败"));
  });
}

export async function markLocalTaskDraftSynced(key: string, savedAt: string) {
  const draft = await getLocalTaskDraft(key);
  if (!draft) return;
  await saveLocalTaskDraft({ ...draft, savedAt, serverSynced: true });
}

export async function deleteLocalTaskDraftFile(key: string, clientId: string) {
  const draft = await getLocalTaskDraft(key);
  if (!draft) return;
  await saveLocalTaskDraft({ ...draft, files: draft.files.filter(file => file.clientId !== clientId) });
}

export function deleteLocalTaskDraft(key: string) {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("清理本机草稿失败"));
  });
}

export function localDraftFileAsFile(file: LocalTaskDraftFile) {
  return new File([file.file], file.name, { type: file.type || file.file.type || "application/octet-stream", lastModified: file.lastModified });
}
