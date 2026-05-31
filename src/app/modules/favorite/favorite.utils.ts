import { Prisma } from '@prisma/client';
import { toUTCEndOfDay, toUTCEndOfMonth, toUTCStartOfDay, toUTCStartOfMonth } from '../../../utils/utcDate';

export const buildFilterConditions = (
  filterData: Record<string, any>,
): Prisma.favoriteWhereInput[] => {
  const conditions: Prisma.favoriteWhereInput[] = [];

  Object.keys(filterData).forEach(key => {
    const value = filterData[key];
    if (value === '' || value === null || value === undefined) return;

    if (key === 'createdAt') {
      const parts = (value as string).split('-');

      if (parts.length === 2) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        conditions.push({
          createdAt: {
            gte: toUTCStartOfMonth(year, month),
            lte: toUTCEndOfMonth(year, month),
          },
        });
      } else if (parts.length === 3) {
        conditions.push({
          createdAt: {
            gte: toUTCStartOfDay(value),
            lte: toUTCEndOfDay(value),
          },
        });
      }
      return;
    }

    if (key.includes('.')) {
      const [relation, field] = key.split('.');
      conditions.push({ [relation]: { some: { [field]: value } } });
      return;
    }

    conditions.push({ [key]: value });
  });

  return conditions;
};