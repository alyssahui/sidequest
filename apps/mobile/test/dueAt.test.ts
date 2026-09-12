import { describe, expect, it } from "vitest";

import {
  combineDueAt,
  defaultDue,
  formatTimeLeft,
  isFutureDue,
  toDateInput,
  toTimeInput,
} from "../src/features/quests/dueAt";

describe("dueAt", () => {
  it("defaults to one hour later, rolling past midnight when needed", () => {
    const afternoon = new Date("2026-09-12T15:20:00");
    const due = defaultDue(afternoon);
    expect(due.getTime() - afternoon.getTime()).toBe(60 * 60_000);
    expect(toTimeInput(due)).toBe("16:20");
    expect(toDateInput(due)).toBe(toDateInput(afternoon));

    const late = new Date("2026-09-12T23:30:00");
    const next = defaultDue(late);
    expect(toDateInput(next)).not.toBe(toDateInput(late));
    expect(toTimeInput(next)).toBe("00:30");
  });

  it("formats remaining time from the deadline", () => {
    const now = Date.parse("2026-09-12T10:00:00.000Z");
    expect(formatTimeLeft("2026-09-12T10:00:45.000Z", now)).toBe("45 sec");
    expect(formatTimeLeft("2026-09-12T10:41:00.000Z", now)).toBe("41 min");
    expect(formatTimeLeft("2026-09-12T18:10:00.000Z", now)).toBe(
      "8 hrs 10 mins",
    );
    expect(formatTimeLeft("2026-09-12T22:30:00.000Z", now)).toBe(
      "12 hrs 30 mins",
    );
    expect(formatTimeLeft("2026-09-14T12:00:00.000Z", now)).toBe(
      "2 days 2 hrs",
    );
    expect(formatTimeLeft("2026-09-13T10:59:00.000Z", now)).toBe("1 day 59 min");
    expect(formatTimeLeft("2026-09-12T09:00:00.000Z", now)).toBe("expired");
  });

  it("combines day and time and rejects past deadlines", () => {
    const due = combineDueAt("2026-09-12", "11:32");
    expect(due).not.toBeNull();
    expect(toDateInput(due!)).toBe("2026-09-12");
    expect(toTimeInput(due!)).toBe("11:32");
    expect(isFutureDue("2026-09-12", "11:32", due!.getTime() - 1_000)).toBe(
      true,
    );
    expect(isFutureDue("2026-09-12", "11:32", due!.getTime() + 1_000)).toBe(
      false,
    );
  });
});
