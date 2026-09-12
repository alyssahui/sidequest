import { useEffect, useState } from "react";

const HOUR_MS = 60 * 60_000;

export function defaultDue(now = new Date()): Date {
  const due = new Date(now.getTime() + HOUR_MS);
  due.setSeconds(0, 0);
  return due;
}

export function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function combineDueAt(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = time.length === 5 ? `${time}:00` : time;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(clock)) return null;
  const next = new Date(`${date}T${clock}`);
  return Number.isNaN(next.getTime()) ? null : next;
}

export function isFutureDue(date: string, time: string, now = Date.now()) {
  const due = combineDueAt(date, time);
  return due !== null && due.getTime() > now;
}

export function formatTimeLeft(dueAt: string, now: number): string {
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return "—";
  const remaining = due - now;
  if (remaining <= 0) return "expired";

  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds < 60) return `${totalSeconds} sec`;

  const totalMins = Math.floor(totalSeconds / 60);
  if (totalMins < 60) return `${totalMins} min`;

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) {
    if (mins === 0) return hours === 1 ? "1 hr" : `${hours} hrs`;
    return `${hours} hrs ${mins} mins`;
  }

  const days = Math.floor(totalMins / (24 * 60));
  const afterDays = totalMins % (24 * 60);
  const remHours = Math.floor(afterDays / 60);
  const remMins = afterDays % 60;
  const dayLabel = days === 1 ? "1 day" : `${days} days`;
  if (remHours === 0 && remMins === 0) return dayLabel;
  if (remHours === 0) return `${dayLabel} ${remMins} min`;
  if (remMins === 0) {
    return `${dayLabel} ${remHours === 1 ? "1 hr" : `${remHours} hrs`}`;
  }
  return `${dayLabel} ${remHours} hrs ${remMins} mins`;
}

/** Null until mount so prerendered HTML does not hydrate with a stale clock. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
