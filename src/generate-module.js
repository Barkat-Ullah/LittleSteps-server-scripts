import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "@prisma/internals";
const { getDMMF } = pkg;

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
 * PATHS (EDIT IF NEEDED)
 * ========================= */
const ROOT_DIR = path.resolve(__dirname, "..");

const MODULES_DIR = path.join(ROOT_DIR, "src/app/modules");
const ROUTES_INDEX_PATH = path.join(ROOT_DIR, "src/app/routes/index.ts");
const PRISMA_DIR = path.join(ROOT_DIR, "prisma");

/* =========================
 * SMALL UTILS
 * ========================= */
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const pluralize = (str) => `${str}s`;

const isObjectIdField = (schemaText, modelName, fieldName) => {
  const modelBlockRe = new RegExp(
    `model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`,
    "m",
  );
  const match = schemaText.match(modelBlockRe);
  if (!match) return false;

  const block = match[1];
  const fieldLineRe = new RegExp(
    `^\\s*${fieldName}\\s+\\w+[\\?\\[\\]\\s\\w@()".:]*@db\\.ObjectId`,
    "m",
  );
  return fieldLineRe.test(block);
};

const toObjectIdZod = (fieldName) =>
  `z.string({ error: '${fieldName} is required' })`;

const scalarToZod = ({ type, isList, fieldName }) => {
  let base;
  switch (type) {
    case "String":
      base = `z.string({ error: '${fieldName} is required' })`;
      break;
    case "Int":
      base = `z.number({ error: '${fieldName} is required' }).int()`;
      break;
    case "Float":
      base = `z.number({ error: '${fieldName} is required' })`;
      break;
    case "Boolean":
      base = `z.boolean({ error: '${fieldName} is required' })`;
      break;
    case "DateTime":
      base = `z.coerce.date({ error: '${fieldName} is required' })`;
      break;
    default:
      base = null;
  }
  if (!base) return null;
  return isList ? `z.array(${base})` : base;
};

const enumToZod = ({ enumName, isList, fieldName }) => {
  const base = `z.enum(${enumName}, { error: '${fieldName} is required' })`;
  return isList ? `z.array(${base})` : base;
};
const shouldSkipField = (f) => {
  if (["id", "createdAt", "updatedAt"].includes(f.name)) return true;
  if (f.kind === "object") return true;
  return false;
};

const readPrismaSchema = () => {
  if (!fs.existsSync(PRISMA_DIR)) {
    throw new Error(`Prisma directory not found: ${PRISMA_DIR}`);
  }

  const files = fs.readdirSync(PRISMA_DIR).filter((f) => f.endsWith(".prisma"));

  if (!files.length) {
    throw new Error("No .prisma files found");
  }

  return files
    .map((file) => fs.readFileSync(path.join(PRISMA_DIR, file), "utf8"))
    .join("\n");
};

/* =========================
 * PRISMA -> ZOD GENERATION
 * ========================= */
const getModelFromDmmf = async (modelName) => {
  const schemaText = readPrismaSchema();
  const dmmf = await getDMMF({ datamodel: schemaText });

  const model = dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase(),
  );

  if (!model) {
    throw new Error(`Prisma model '${modelName}' not found in schema.prisma`);
  }

  return { model, schemaText };
};

const buildZodShape = ({ model, schemaText }, mode) => {
  const lines = [];

  for (const f of model.fields) {
    if (shouldSkipField(f)) continue;

    const isList = !!f.isList;
    const requiredInCreate = !!f.isRequired && !f.hasDefaultValue;
    const optional = mode === "update" ? true : !requiredInCreate;

    let zodExpr = null;

    if (
      f.kind === "scalar" &&
      f.type === "String" &&
      isObjectIdField(schemaText, model.name, f.name)
    ) {
      zodExpr = isList
        ? `z.array(${toObjectIdZod(f.name)})`
        : toObjectIdZod(f.name);
    } else if (f.kind === "enum") {
      zodExpr = enumToZod({ enumName: f.type, isList, fieldName: f.name });
    } else if (f.kind === "scalar") {
      zodExpr = scalarToZod({ type: f.type, isList, fieldName: f.name });
    }

    if (!zodExpr) continue;
    if (optional) zodExpr = `${zodExpr}.optional()`;
    lines.push(`  ${f.name}: ${zodExpr},`);
  }

  return lines.join("\n");
};

/* =========================
 * BUILD SELECT FILE CONTENT
 * (Manually editable — separated from service)
 * ========================= */
const buildSelectFileContent = (moduleName, model) => {
  const Capitalized = capitalize(moduleName);
  const lines = [];

  for (const f of model.fields) {
    if (f.kind === "object") {
      lines.push(
        `  // ${f.name}: { select: { id: true } }, // ← uncomment to include relation`,
      );
    } else {
      lines.push(`  ${f.name}: true,`);
    }
  }

  return `
import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to \`true\` (included) or \`false\` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const ${moduleName}Select = {
${lines.join("\n")}
} satisfies Prisma.${Capitalized}Select;
`.trim();
};

/* =========================
 * UPDATE FIELDS FROM PRISMA MODEL
 * ========================= */
const buildUpdateFields = (model) => {
  const fields = [];
  for (const f of model.fields) {
    if (["id", "createdAt", "updatedAt"].includes(f.name)) continue;
    if (f.kind === "object") continue;
    fields.push(f.name);
  }
  return fields;
};

const collectEnumNames = (model) => {
  const enums = new Set();
  for (const f of model.fields) {
    if (f.kind === "enum") enums.add(f.type);
  }
  return [...enums];
};

const generateValidationFileContent = async (moduleName) => {
  const { model, schemaText } = await getModelFromDmmf(moduleName);

  const createShape = buildZodShape({ model, schemaText }, "create");
  const updateShape = buildZodShape({ model, schemaText }, "update");

  const enumNames = collectEnumNames(model);
  const prismaImport =
    enumNames.length > 0
      ? `import { ${enumNames.join(", ")} } from '@prisma/client';`
      : "";

  return `
import { z } from 'zod';
${prismaImport}

const createSchema = z.object({
${createShape || "  // no scalar fields to validate"}
});

const updateSchema = z.object({
${updateShape || "  // no scalar fields to validate"}
});

export const ${moduleName}Validation = {
  createSchema,
  updateSchema,
};
`.trim();
};

/* =========================
 * TEMPLATES
 * ========================= */
const templates = async (moduleName) => {
  const Capitalized = capitalize(moduleName);
  const { model } = await getModelFromDmmf(moduleName);

  const updateFields = buildUpdateFields(model);

  const updateDataLines = updateFields
    .map(
      (f) => `      ${f}: data.${f} ?? (existing${Capitalized} as any).${f},`,
    )
    .join("\n");

  const statusField = model.fields.find(
    (f) => f.name === "status" && (f.type === "Boolean" || f.kind === "enum"),
  );
  const isStatusBoolean = statusField && statusField.type === "Boolean";

  const selectFileContent = buildSelectFileContent(moduleName, model);

  return {
    // ── select ──────────────────────────────────────────────────
    select: selectFileContent,

    // ── controller ──────────────────────────────────────────────
    controller: `
import httpStatus from 'http-status';
import { ${moduleName}Service } from './${moduleName}.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const ${moduleName}FilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create ${Capitalized}
const create${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const result = await ${moduleName}Service.create${Capitalized}(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: '${Capitalized} created successfully',
    data: result,
  });
});

// get all ${Capitalized}
const get${Capitalized}List = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, ${moduleName}FilterableFields);
  const result = await ${moduleName}Service.get${Capitalized}List(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get ${Capitalized} by id
const get${Capitalized}ById = catchAsync(async (req: Request, res: Response) => {
  const result = await ${moduleName}Service.get${Capitalized}ById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} details retrieved successfully',
    data: result,
  });
});

// get my ${Capitalized}
const getMy${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, ${moduleName}FilterableFields);
  const result = await ${moduleName}Service.getMy${Capitalized}(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My ${Capitalized} list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update ${Capitalized}
const update${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const result = await ${moduleName}Service.update${Capitalized}(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} updated successfully',
    data: result,
  });
});

// toggle status ${Capitalized}
const toggleStatus${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const result = await ${moduleName}Service.toggleStatus${Capitalized}(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} status toggled successfully',
    data: result,
  });
});

// soft delete ${Capitalized}
const softDelete${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const result = await ${moduleName}Service.softDelete${Capitalized}(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} soft deleted successfully',
    data: result,
  });
});

// hard delete ${Capitalized}
const delete${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const result = await ${moduleName}Service.delete${Capitalized}(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} deleted successfully',
    data: result,
  });
});

export const ${moduleName}Controller = {
  create${Capitalized},
  get${Capitalized}List,
  get${Capitalized}ById,
  getMy${Capitalized},
  update${Capitalized},
  toggleStatus${Capitalized},
  softDelete${Capitalized},
  delete${Capitalized},
};
`.trim(),

    // ── service ─────────────────────────────────────────────────
    service: `
import httpStatus from 'http-status';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { ${moduleName}Select } from './${moduleName}.select';
import { buildFilterConditions } from './${moduleName}.utils';
import { handleFileUploads } from '../../../utils/handleFile';
import prisma from '../../../shared/prisma';
import { IPaginationOptions } from '../../../interfaces/pagination';
import { paginationHelper } from '../../../shared/pagination';
import ApiError from '../../../error/ApiErrors';
import {
  CacheInvalidator,
  CacheKeys,
  TTL,
  cacheOr,
} from '../../../lib/redisConnection';

// -------------------------------------------------------
// create ${Capitalized}
// -------------------------------------------------------
const create${Capitalized} = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);
  const addedData = { ...data, ...uploadedFiles, userId };
  const result = await prisma.${moduleName}.create({
    data: addedData,
    select: ${moduleName}Select,
  });
  await CacheInvalidator.onRecordCreate("${moduleName}");
  return result;
};

// -------------------------------------------------------
// get all ${Capitalized}
// -------------------------------------------------------
type I${Capitalized}FilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

const ${moduleName}SearchAbleFields = ['fullName', 'email'];

const get${Capitalized}List = async (
  req: Request,
  options: IPaginationOptions,
  filters: I${Capitalized}FilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("${moduleName}", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.${Capitalized}WhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: ${moduleName}SearchAbleFields.map(field => ({
          [field]: { contains: searchTerm, mode: 'insensitive' },
        })),
      });
    }

     if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.${Capitalized}WhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
        prisma.${moduleName}.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
        select: ${moduleName}Select,
      }),
      prisma.${moduleName}.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get ${Capitalized} by id
// -------------------------------------------------------
const get${Capitalized}ById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(CacheKeys.single("${moduleName}", id), TTL.MEDIUM, async () => {
    const result = await prisma.${moduleName}.findUnique({
      where: { id },
      select: ${moduleName}Select,
    });
    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
    }
    return result;
  });
};

// -------------------------------------------------------
// get my ${Capitalized}
// -------------------------------------------------------
const getMy${Capitalized} = async (
  req: Request,
  options: IPaginationOptions,
  filters: I${Capitalized}FilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.${Capitalized}WhereInput[] = [{ userId }];

  if (searchTerm) {
    andConditions.push({
      OR: ${moduleName}SearchAbleFields.map(field => ({
        [field]: { contains: searchTerm, mode: 'insensitive' },
      })),
    });
  }

   if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.${Capitalized}WhereInput = { AND: andConditions };

  const cacheKey = CacheKeys.myList("${moduleName}", userId, {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.${moduleName}.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
        select: ${moduleName}Select,
      }),
      prisma.${moduleName}.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update ${Capitalized}
// -------------------------------------------------------
const update${Capitalized} = async (req: Request) => {
  const { id } = req.params;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const existing${Capitalized} = await prisma.${moduleName}.findUnique({ where: { id } });
  if (!existing${Capitalized}) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
  }

  const result = await prisma.${moduleName}.update({
    where: { id },
    data: {
${updateDataLines}
    },
    select: ${moduleName}Select,
  });

  await CacheInvalidator.onOwnedRecordUpdate("${moduleName}", id, result.userId);
  return result;
};

// -------------------------------------------------------
// toggle status ${Capitalized}
// -------------------------------------------------------
const toggleStatus${Capitalized} = async (req: Request) => {
  const { id } = req.params;
  const existing${Capitalized} = await prisma.${moduleName}.findUnique({ where: { id } });
  if (!existing${Capitalized}) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
  }

  ${
    isStatusBoolean
      ? `const result = await prisma.${moduleName}.update({
    where: { id },
    data: { status: !(existing${Capitalized} as any).status },
    select: ${moduleName}Select,
  });`
      : `// TODO: define your status enum toggle logic below
  // Example for enum: { ACTIVE -> INACTIVE, INACTIVE -> ACTIVE }
  const currentStatus = (existing${Capitalized} as any).status;
  // const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const result = await prisma.${moduleName}.update({
    where: { id },
    data: { status: currentStatus /* replace with newStatus */ },
    select: ${moduleName}Select,
  });`
  }

  await CacheInvalidator.onOwnedRecordUpdate(
    "${moduleName}",
    id,
    (existing${Capitalized} as any).userId,
  );
  return result;
};

// -------------------------------------------------------
// soft delete ${Capitalized}
// -------------------------------------------------------
const softDelete${Capitalized} = async (req: Request) => {
  const { id } = req.params;
  const existing${Capitalized} = await prisma.${moduleName}.findUnique({ where: { id , isDeleted: false} });
  if (!existing${Capitalized}) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found or ${Capitalized} is already deleted');
  }

  const result = await prisma.${moduleName}.update({
    where: { id },
    data: { isDeleted: true },
    select: ${moduleName}Select,
  });
  await CacheInvalidator.onRecordDelete(
    "${moduleName}",
    id,
    (existing${Capitalized} as any).userId,
  );
  return result;
};

// -------------------------------------------------------
// hard delete ${Capitalized}
// -------------------------------------------------------
const delete${Capitalized} = async (req: Request) => {
  const { id } = req.params;
  const existing${Capitalized} = await prisma.${moduleName}.findUnique({ where: { id } });
  if (!existing${Capitalized}) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
  }
  const result = await prisma.${moduleName}.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete(
    "${moduleName}",
    id,
    (existing${Capitalized} as any).userId,
  );
  return result;
};

export const ${moduleName}Service = {
  create${Capitalized},
  get${Capitalized}List,
  get${Capitalized}ById,
  getMy${Capitalized},
  update${Capitalized},
  toggleStatus${Capitalized},
  softDelete${Capitalized},
  delete${Capitalized},
};
`.trim(),

    // ── utils ──────────────────────────────────────────────────
    utils: `
import { Prisma } from '@prisma/client';
import { toUTCEndOfDay, toUTCEndOfMonth, toUTCStartOfDay, toUTCStartOfMonth } from '../../../utils/utcDate';

export const buildFilterConditions = (
  filterData: Record<string, any>,
): Prisma.${Capitalized}WhereInput[] => {
  const conditions: Prisma.${Capitalized}WhereInput[] = [];

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

    if (['status'].includes(key)) {
      conditions.push({
        [key]: { in: Array.isArray(value) ? value : [value] },
      });
      return;
    }

    if (['isDeleted'].includes(key)) {
       conditions.push({ [key]: value === 'true' });
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
`.trim(),

    // ── routes ──────────────────────────────────────────────────
    route: `
import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { ${moduleName}Controller } from './${moduleName}.controller';
import { ${moduleName}Validation } from './${moduleName}.validation';
import { fileUploader } from '../../../utils/fileUploader';

const router = express.Router();
const fileUpload = fileUploader.upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
    { name: 'files', maxCount: 1 },
  ]);

router.post(
  '/',
  auth(),
  fileUpload,
  validateRequest(${moduleName}Validation.createSchema),
  ${moduleName}Controller.create${Capitalized},
);

router.get('/', auth(), ${moduleName}Controller.get${Capitalized}List);

router.get('/my', auth(), ${moduleName}Controller.getMy${Capitalized});

router.get('/:id', auth(), ${moduleName}Controller.get${Capitalized}ById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(${moduleName}Validation.updateSchema),
  ${moduleName}Controller.update${Capitalized},
);

router.patch(
  '/toggle-status/:id',
  auth(),
  ${moduleName}Controller.toggleStatus${Capitalized},
);

router.delete(
  '/soft-delete/:id',
  auth(),
  ${moduleName}Controller.softDelete${Capitalized},
);

router.delete('/:id', auth(), ${moduleName}Controller.delete${Capitalized});

export const ${moduleName}Router = router;
`.trim(),

    // ── validation ──────────────────────────────────────────────
    validation: await generateValidationFileContent(moduleName),
  };
};

/* =========================
 * ROUTE REGISTRATION
 * ========================= */
const registerRoute = (moduleName) => {
  if (!fs.existsSync(ROUTES_INDEX_PATH)) {
    console.error("❌ routes index.ts not found:", ROUTES_INDEX_PATH);
    return;
  }

  const routeVar = `${moduleName}Router`;
  const routePath = `/${pluralize(moduleName.toLowerCase())}`;
  const importStatement = `import ${routeVar} from "../modules/${moduleName}/${moduleName}.route";`;

  let fileContent = fs.readFileSync(ROUTES_INDEX_PATH, "utf8");

  if (fileContent.includes(importStatement)) {
    console.log("⚠️ Route already registered, skipping...");
    return;
  }

  // ── 1. Inject import after the last import line ──────────────
  const importRegex = /^import .*;$/gm;
  const imports = [...fileContent.matchAll(importRegex)];
  if (imports.length === 0) {
    console.error("❌ No import statements found in routes index.ts");
    return;
  }

  const lastImport = imports[imports.length - 1];
  const insertImportIndex = lastImport.index + lastImport[0].length;

  fileContent =
    fileContent.slice(0, insertImportIndex) +
    "\n" +
    importStatement +
    fileContent.slice(insertImportIndex);

  // ── 2. Inject router.use() before the catch-all 404 ─────────
  const anchorComment = "// Catch-all 404";
  const anchorIndex = fileContent.indexOf(anchorComment);

  if (anchorIndex === -1) {
    console.error(
      '❌ Could not find "// Catch-all 404" anchor in routes index.ts',
    );
    return;
  }

  const routeEntry = `router.use("${routePath}", ${routeVar});\n\n`;

  fileContent =
    fileContent.slice(0, anchorIndex) +
    routeEntry +
    fileContent.slice(anchorIndex);

  fs.writeFileSync(ROUTES_INDEX_PATH, fileContent);
  console.log(`✅ Route registered: ${routePath}`);
};

/* =========================
 * SYNC SELECT — smart merge
 * ========================= */
const syncSelect = async (moduleName) => {
  if (!moduleName) {
    console.error("❌ Please provide a module name!");
    process.exit(1);
  }

  const modulePath = path.join(MODULES_DIR, moduleName);
  const selectFilePath = path.join(modulePath, `${moduleName}.select.ts`);

  if (!fs.existsSync(selectFilePath)) {
    console.error(`❌ select file not found: ${selectFilePath}`);
    console.log(`💡 Run without --sync-select to generate the module first.`);
    process.exit(1);
  }

  const { model } = await getModelFromDmmf(moduleName);
  const Capitalized = capitalize(moduleName);

  const existingContent = fs.readFileSync(selectFilePath, "utf8");

  const selectBodyMatch = existingContent.match(
    /export const \w+Select\s*=\s*\{([\s\S]*?)\}\s*satisfies/,
  );
  const existingBody = selectBodyMatch ? selectBodyMatch[1] : "";

  const existingFieldNames = new Set();
  existingBody.split("\n").forEach((line) => {
    const match = line.match(/^\s*\/?\/?\/?\s*(\w+)\s*[:{]/);
    if (match) existingFieldNames.add(match[1]);
  });

  const schemaFields = model.fields;

  const newFields = [];
  const removedFields = [];

  for (const f of schemaFields) {
    if (!existingFieldNames.has(f.name)) {
      newFields.push(f);
    }
  }

  const schemaFieldNames = new Set(schemaFields.map((f) => f.name));
  existingBody.split("\n").forEach((line) => {
    const match = line.match(/^\s*(\w+)\s*:/);
    if (match && !schemaFieldNames.has(match[1])) {
      removedFields.push(match[1]);
    }
  });

  if (newFields.length === 0 && removedFields.length === 0) {
    console.log(`✅ select is already up-to-date for '${moduleName}'`);
    return;
  }

  const newLines = newFields.map((f) => {
    if (f.kind === "object") {
      return `  // ${f.name}: { select: { id: true } }, // ← NEW relation — uncomment to include`;
    }
    return `  ${f.name}: true, // ← NEW`;
  });

  let updatedContent = existingContent;

  if (newFields.length > 0) {
    updatedContent = updatedContent.replace(
      /(\}\s*satisfies\s*Prisma)/,
      `${newLines.join("\n")}\n} satisfies Prisma`,
    );
  }

  if (removedFields.length > 0) {
    const warningComment = `  // ⚠️  These fields no longer exist in schema: ${removedFields.join(", ")} — remove manually if needed\n`;
    updatedContent = updatedContent.replace(
      /(\}\s*satisfies\s*Prisma)/,
      `${warningComment}} satisfies Prisma`,
    );
  }

  fs.writeFileSync(selectFilePath, updatedContent);

  console.log(`✅ select synced for '${moduleName}'`);
  if (newFields.length > 0) {
    console.log(
      `   ➕ New fields added: ${newFields.map((f) => f.name).join(", ")}`,
    );
  }
  if (removedFields.length > 0) {
    console.log(
      `   ⚠️  Fields removed from schema: ${removedFields.join(", ")} (check the file)`,
    );
  }
  console.log(`\n📝 Review: ${selectFilePath}`);
};

/* =========================
 * MAIN GENERATOR
 * ========================= */
const generateModule = async (moduleName) => {
  if (!moduleName) {
    console.error("❌ Please provide a module name!");
    process.exit(1);
  }

  if (!fs.existsSync(MODULES_DIR)) {
    fs.mkdirSync(MODULES_DIR, { recursive: true });
  }

  const modulePath = path.join(MODULES_DIR, moduleName);
  if (fs.existsSync(modulePath)) {
    console.error(`❌ Module '${moduleName}' already exists!`);
    process.exit(1);
  }

  fs.mkdirSync(modulePath, { recursive: true });

  const tpl = await templates(moduleName);

  Object.entries(tpl).forEach(([key, content]) => {
    const filePath = path.join(modulePath, `${moduleName}.${key}.ts`);
    fs.writeFileSync(filePath, content.trim());
    console.log(`✅ Created: ${filePath}`);
  });

  registerRoute(moduleName);
  console.log(`🎉 Module '${moduleName}' created successfully!`);
  console.log(
    `\n📝 Edit select fields in: ${modulePath}/${moduleName}.select.ts`,
  );
};

/* =========================
 * SYNC VALIDATION — smart merge
 * ========================= */
const syncValidation = async (moduleName) => {
  if (!moduleName) {
    console.error("❌ Please provide a module name!");
    process.exit(1);
  }

  const modulePath = path.join(MODULES_DIR, moduleName);
  const validationFilePath = path.join(
    modulePath,
    `${moduleName}.validation.ts`,
  );

  if (!fs.existsSync(validationFilePath)) {
    console.error(`❌ validation file not found: ${validationFilePath}`);
    console.log(`💡 Run without flags to generate the module first.`);
    process.exit(1);
  }

  const { model, schemaText } = await getModelFromDmmf(moduleName);

  const existingContent = fs.readFileSync(validationFilePath, "utf8");

  const extractSchemaBody = (content, schemaName) => {
    const startMarker = `const ${schemaName} = z.object({`;
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) return "";

    const braceStart = startIdx + startMarker.length - 1;
    let depth = 0;
    let bodyStart = braceStart + 1;
    let bodyEnd = -1;

    for (let i = braceStart; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }

    return bodyEnd === -1 ? "" : content.slice(bodyStart, bodyEnd);
  };

  const createBody = extractSchemaBody(existingContent, "createSchema");
  const updateBody = extractSchemaBody(existingContent, "updateSchema");

  const getExistingFields = (body) => {
    const fields = new Set();
    body.split("\n").forEach((line) => {
      const match = line.match(/^\s*(?:\/\/\s*)?(\w+)\s*:\s*z\./);
      if (match) fields.add(match[1]);
    });
    return fields;
  };

  const existingCreateFields = getExistingFields(createBody);
  const existingUpdateFields = getExistingFields(updateBody);

  const newCreateLines = [];
  const newUpdateLines = [];
  const newFieldNames = [];

  for (const f of model.fields) {
    if (shouldSkipField(f)) continue;

    const isList = !!f.isList;

    if (existingCreateFields.has(f.name) && existingUpdateFields.has(f.name))
      continue;

    let zodExpr = null;

    if (
      f.kind === "scalar" &&
      f.type === "String" &&
      isObjectIdField(schemaText, model.name, f.name)
    ) {
      zodExpr = isList
        ? `z.array(${toObjectIdZod(f.name)})`
        : toObjectIdZod(f.name);
    } else if (f.kind === "enum") {
      zodExpr = enumToZod({ enumName: f.type, isList, fieldName: f.name });
    } else if (f.kind === "scalar") {
      zodExpr = scalarToZod({ type: f.type, isList, fieldName: f.name });
    }

    if (!zodExpr) continue;

    newFieldNames.push(f.name);

    const requiredInCreate = !!f.isRequired && !f.hasDefaultValue;

    if (!existingCreateFields.has(f.name)) {
      const createExpr = requiredInCreate ? zodExpr : `${zodExpr}.optional()`;
      newCreateLines.push(`  ${f.name}: ${createExpr}, // ← NEW`);
    }

    if (!existingUpdateFields.has(f.name)) {
      newUpdateLines.push(`  ${f.name}: ${zodExpr}.optional(), // ← NEW`);
    }
  }

  const enumNames = collectEnumNames(model);
  const existingImports = existingContent.includes("@prisma/client");
  let updatedContent = existingContent;

  if (enumNames.length > 0 && !existingImports) {
    updatedContent = updatedContent.replace(
      `import { z } from 'zod';`,
      `import { z } from 'zod';\nimport { ${enumNames.join(", ")} } from '@prisma/client';`,
    );
  } else if (enumNames.length > 0 && existingImports) {
    updatedContent = updatedContent.replace(
      /import \{([^}]+)\} from '@prisma\/client';/,
      `import { ${enumNames.join(", ")} } from '@prisma/client';`,
    );
  }

  const injectIntoSchema = (content, schemaName, newLines) => {
    const startMarker = `const ${schemaName} = z.object({`;
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) return content;

    let depth = 0;
    let i = startIdx + startMarker.length - 1;
    let closingIdx = -1;

    while (i < content.length) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          if (content[i + 1] === ")") {
            closingIdx = i;
          }
          break;
        }
      }
      i++;
    }

    if (closingIdx === -1) return content;

    return (
      content.slice(0, closingIdx) +
      newLines.join("\n") +
      "\n" +
      content.slice(closingIdx)
    );
  };

  if (newCreateLines.length > 0) {
    updatedContent = injectIntoSchema(
      updatedContent,
      "createSchema",
      newCreateLines,
    );
  }

  if (newUpdateLines.length > 0) {
    updatedContent = injectIntoSchema(
      updatedContent,
      "updateSchema",
      newUpdateLines,
    );
  }

  if (newFieldNames.length === 0) {
    console.log(`✅ validation is already up-to-date for '${moduleName}'`);
    return;
  }

  fs.writeFileSync(validationFilePath, updatedContent);

  console.log(`✅ validation synced for '${moduleName}'`);
  console.log(`   ➕ New fields added: ${newFieldNames.join(", ")}`);
  console.log(`\n📝 Review: ${validationFilePath}`);
};

/* =========================
 * SYNC ALL — select + validation
 * ========================= */
const syncAll = async (moduleName) => {
  console.log("🔄 Syncing select...");
  await syncSelect(moduleName);
  console.log("");
  console.log("🔄 Syncing validation...");
  await syncValidation(moduleName);
};

const [, , moduleName, flag] = process.argv;

if (flag === "--sync-select") {
  syncSelect(moduleName).catch((e) => {
    console.error("❌ Sync failed:", e.message);
    process.exit(1);
  });
} else if (flag === "--sync-validation") {
  syncValidation(moduleName).catch((e) => {
    console.error("❌ Sync failed:", e.message);
    process.exit(1);
  });
} else if (flag === "--sync") {
  syncAll(moduleName).catch((e) => {
    console.error("❌ Sync failed:", e.message);
    process.exit(1);
  });
} else {
  generateModule(moduleName).catch((e) => {
    console.error("❌ Generate failed:", e.message);
    process.exit(1);
  });
}
