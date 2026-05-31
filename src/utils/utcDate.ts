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
