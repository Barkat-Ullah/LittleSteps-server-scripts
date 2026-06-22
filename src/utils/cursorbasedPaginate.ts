// src/utils/paginate.ts

type PaginateArgs<WhereInput, OrderByInput, Select> = {
  where?: WhereInput;
  orderBy?: OrderByInput;
  select?: Select;
};

type PaginateOptions = {
  limit: number;
  cursor?: string;
};

type PaginateResult<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

type PrismaModel = {
  findMany: (args: any) => Promise<any[]>;
};

export async function paginate<T extends { id: string }>(
  model: PrismaModel,
  args: PaginateArgs<any, any, any>,
  options: PaginateOptions,
): Promise<PaginateResult<T>> {
  const cursorArgs = options.cursor
    ? { cursor: { id: options.cursor }, skip: 1 }
    : {};
  const results: T[] = await model.findMany({
    ...args,
    ...cursorArgs,
    take: options.limit + 1,
  });

  const hasMore = results.length > options.limit;
  const data = hasMore ? results.slice(0, options.limit) : results;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}



// // scheduleItem.service.ts
// import { paginate } from "../../../utils/paginate";

// const getScheduleItemList = async (
//   req: Request,
//   options: IPaginationOptions,
//   filters: IScheduleItemFilterRequest,
// ) => {
//   const { page, limit, cursor } = paginationHelper.calculatePagination(options);
//   const { searchTerm, ...filterData } = filters;

//   const andConditions: Prisma.ScheduleItemWhereInput[] = [{ isDeleted: false }];

//   if (searchTerm) {
//     andConditions.push({
//       OR: scheduleItemSearchableFields.map((field) => ({
//         [field]: { contains: searchTerm, mode: "insensitive" },
//       })),
//     });
//   }

//   if (Object.keys(filterData).length) {
//     andConditions.push(...buildFilterConditions(filterData));
//   }

//   const where: Prisma.ScheduleItemWhereInput = { AND: andConditions };

//   // ✅ cursor থাকলে cursor-based, না থাকলে offset
//   if (cursor) {
//     const result = await paginate<any>(
//       prisma.scheduleItem,
//       { where, orderBy: { createdAt: "desc" }, select: scheduleItemSelect },
//       { cursor, limit },
//     );

//     return {
//       meta: { limit, nextCursor: result.nextCursor, hasMore: result.hasMore },
//       data: result.data,
//     };
//   }

//   // offset fallback — প্রথম page বা page number দিয়ে navigate
//   const skip = (page - 1) * limit;
//   const [data, total] = await Promise.all([
//     prisma.scheduleItem.findMany({
//       skip,
//       take: limit,
//       where,
//       orderBy: { createdAt: "desc" },
//       select: scheduleItemSelect,
//     }),
//     prisma.scheduleItem.count({ where }),
//   ]);

//   return { meta: { total, page, limit, nextCursor: null }, data };
// };


// notification.service.ts — একই paginate util
// const { data, nextCursor, hasMore } = await paginate(
//   prisma.notification,
//   { where: { receiverId: userId }, orderBy: { createdAt: "desc" } },
//   { cursor, limit },
// );

// // chat.service.ts — একই
// const { data, nextCursor } = await paginate(
//   prisma.chat,
//   { where: { roomId }, orderBy: { createdAt: "desc" } },
//   { cursor, limit },
// );