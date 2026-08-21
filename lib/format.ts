import dayjs from "dayjs";

export const displayDate = (value?: string | Date | null) => value ? dayjs(value).format("YYYY-MM-DD") : "-";
export const displayMoney = (value?: number | string | null) => value === null || value === undefined ? "-" : `¥ ${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const maskPhone = (value?: string | null) => value && value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : "未配置";
