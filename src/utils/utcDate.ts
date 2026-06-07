// ─────────────────────────────────────────────
// Helper: UTC date
// ─────────────────────────────────────────────
export const toUTCStartOfDay = (dateStr: string): Date => {
  const d = new Date(dateStr);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
};

export const toUTCEndOfDay = (dateStr: string): Date => {
  const d = new Date(dateStr);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
};

export const toUTCStartOfMonth = (year: number, month: number): Date => {
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
};

export const toUTCEndOfMonth = (year: number, month: number): Date => {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
};

// event filtering
export const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const getDayNameFromDateStr = (dateStr: string): string => {
  const d = new Date(dateStr);
  return DAY_NAMES[d.getUTCDay()];
};

export const toUTCDateKey = (d: Date): string => {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isWithinFrequencyLimit = (
  item: {
    days: string[];
    daysPWeek?: number | null;
    startDate?: Date | null;
    endDate?: Date | null;
  },
  filterDateStr: string,
): boolean => {
  if (!item.daysPWeek || item.days.length === 0) return true;
  if (!item.startDate || !item.endDate) return true;

  const matchingDatesByDay: Record<string, string[]> = {};
  for (const day of item.days) {
    matchingDatesByDay[day] = [];
  }

  const current = new Date(item.startDate);
  const end = new Date(item.endDate);

  while (current <= end) {
    const dayName = DAY_NAMES[current.getUTCDay()];
    if (item.days.includes(dayName)) {
      matchingDatesByDay[dayName].push(toUTCDateKey(current));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const allowedDateKeys = new Set<string>();
  for (const day of item.days) {
    const limited = matchingDatesByDay[day].slice(0, item.daysPWeek);
    for (const key of limited) {
      allowedDateKeys.add(key);
    }
  }

  return allowedDateKeys.has(filterDateStr);
};
