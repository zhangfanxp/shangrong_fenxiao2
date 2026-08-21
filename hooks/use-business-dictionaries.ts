"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type SelectOption = { label: string; value: string };
export type DictionaryOptions = Record<string, SelectOption[]>;

export function useBusinessDictionaries(codes: string[]) {
  const key = useMemo(() => codes.join(","), [codes]);
  const [options, setOptions] = useState<DictionaryOptions>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch(`/api/business-dictionaries?codes=${encodeURIComponent(key)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "数据字典加载失败，请联系系统管理员");
      setOptions(result);
    } catch (reason) {
      setOptions({});
      setError(reason instanceof Error ? reason.message : "数据字典加载失败，请联系系统管理员");
    } finally { setLoading(false); }
  }, [key]);

  useEffect(() => { void reload(); }, [reload]);
  return { options, loading, error, reload };
}
