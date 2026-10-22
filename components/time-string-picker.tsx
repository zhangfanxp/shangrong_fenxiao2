"use client";

import { TimePicker, type TimePickerProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";

type TimeStringPickerProps = Omit<TimePickerProps, "value" | "onChange" | "format"> & {
  value?: string | null;
  onChange?: (value: string) => void;
};

function parseTime(value?: string | null): Dayjs | null {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return dayjs().hour(Number(match[1])).minute(Number(match[2])).second(0).millisecond(0);
}

export function TimeStringPicker({ value, onChange, style, ...props }: TimeStringPickerProps) {
  return <TimePicker
    {...props}
    style={{ width: "100%", ...style }}
    value={parseTime(value)}
    format="HH:mm"
    minuteStep={1}
    onChange={time => onChange?.(time?.format("HH:mm") || "")}
  />;
}
