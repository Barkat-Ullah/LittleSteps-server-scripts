import httpStatus from "http-status";
import { ContactStatus, Prisma, userRole } from "@prisma/client";
import { Request } from "express";
import { contactSelect } from "./contact.select";
import { buildFilterConditions } from "./contact.utils";
import prisma from "../../../shared/prisma";
import { IPaginationOptions } from "../../../interfaces/pagination";
import { paginationHelper } from "../../../shared/pagination";
import ApiError from "../../../error/ApiErrors";
import {
  CacheInvalidator,
  CacheKeys,
  TTL,
  cacheOr,
} from "../../../lib/redisConnection";
import emailSender from "../../../helpers/emailSender/emailSender";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type IContactFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

// Correct searchable fields matching the actual model field names
const contactSearchableFields = ["name", "email", "subject"];

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

const createContact = async (req: Request) => {
  // userId is optional — guest users can also submit contact forms
  const userId = req.user?.id ?? null;
  const { name, email, subject, message } = req.body;
  const admin = await prisma.user.findFirst({
    where: {
      role: userRole.ADMIN,
    },
    select: {
      email: true,
    },
  });

  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Message</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .header { background-color: #2563eb; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .body { padding: 30px; color: #333333; line-height: 1.6; }
          .label { font-weight: bold; color: #1e40af; }
          .value { margin: 8px 0 20px; padding: 12px; background-color: #f8fafc; border-left: 4px solid #2563eb; border-radius: 4px; }
          .message-box { background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0; font-style: italic; }
          .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 14px; color: #64748b; }
          @media (max-width: 600px) {
            .container { width: 100%; border-radius: 0; }
            .body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Contact Form Submission</h1>
          </div>
          <div class="body">
            <p>Hello,</p>
            <p>You have received a new message from your website's contact form. Details below:</p>

            <p class="label">Name:</p>
            <div class="value">${name}</div>

            <p class="label">Email:</p>
            <div class="value"><a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a></div>

            <p class="label">Subject:</p>
            <div class="value">${subject}</div>

            <p class="label">Message:</p>
            <div class="message-box">
              ${message.replace(/\n/g, "<br>")}
            </div>

            <p><strong>Received on:</strong> ${new Date().toLocaleString(
              "en-US",
              {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short",
              },
            )}</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from your website contact form.</p>
            <p>&copy; ${new Date().getFullYear()} Your Website Name. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

  const mailSubject = `New Contact: ${subject} – From ${name}`;

  try {
    emailSender(admin!.email, html, mailSubject);
  } catch (error) {
    console.log(error);
  }

  const result = await prisma.contact.create({
    data: {
      name,
      email,
      subject,
      message,
      ...(userId && { userId }),
    },
    select: contactSelect,
  });

  // Bust all contact list caches
  await CacheInvalidator.onRecordCreate("contact");

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL (admin)
// ─────────────────────────────────────────────────────────────────────────────

const getContactList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IContactFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("contact", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.ContactWhereInput[] = [{ isDeleted: false }];

    if (searchTerm) {
      andConditions.push({
        OR: contactSearchableFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const where: Prisma.ContactWhereInput = { AND: andConditions };

    const [result, total] = await Promise.all([
      prisma.contact.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: "desc" },
        select: contactSelect,
      }),
      prisma.contact.count({ where }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────────

const getContactById = async (req: Request) => {
  const { id } = req.params;

  return cacheOr(CacheKeys.single("contact", id), TTL.MEDIUM, async () => {
    const result = await prisma.contact.findUnique({
      where: { id, isDeleted: false },
      select: contactSelect,
    });

    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, "Contact not found");
    }

    return result;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY CONTACTS (user-scoped)
// ─────────────────────────────────────────────────────────────────────────────

const getMyContact = async (
  req: Request,
  options: IPaginationOptions,
  filters: IContactFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.myList("contact", userId, {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.ContactWhereInput[] = [
      { userId },
      { isDeleted: false },
    ];

    if (searchTerm) {
      andConditions.push({
        OR: contactSearchableFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const where: Prisma.ContactWhereInput = { AND: andConditions };

    const [result, total] = await Promise.all([
      prisma.contact.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: "desc" },
        select: contactSelect,
      }),
      prisma.contact.count({ where }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE (only the message fields — status is changed via toggle)
// ─────────────────────────────────────────────────────────────────────────────

const updateContact = async (req: Request) => {
  const { id } = req.params;
  const { name, email, subject, message } = req.body;

  const existing = await prisma.contact.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, userId: true },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contact not found");
  }

  const result = await prisma.contact.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(subject !== undefined && { subject }),
      ...(message !== undefined && { message }),
    },
    select: contactSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate(
    "contact",
    id,
    existing.userId ?? "",
  );

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE STATUS  Pending → Inprogress → Solved → Pending
// ─────────────────────────────────────────────────────────────────────────────

const statusCycle: Record<ContactStatus, ContactStatus> = {
  Pending: ContactStatus.Inprogress,
  Inprogress: ContactStatus.Solved,
  Solved: ContactStatus.Pending,
};

const toggleStatusContact = async (req: Request) => {
  const { id } = req.params;

  const existing = await prisma.contact.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, status: true, userId: true },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contact not found");
  }

  const newStatus = statusCycle[existing.status];

  const result = await prisma.contact.update({
    where: { id },
    data: { status: newStatus },
    select: contactSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate(
    "contact",
    id,
    existing.userId ?? "",
  );

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// SOFT DELETE
// ─────────────────────────────────────────────────────────────────────────────

const softDeleteContact = async (req: Request) => {
  const { id } = req.params;

  const existing = await prisma.contact.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, userId: true },
  });

  if (!existing) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Contact not found or already deleted",
    );
  }

  const result = await prisma.contact.update({
    where: { id },
    data: { isDeleted: true },
    select: contactSelect,
  });

  await CacheInvalidator.onRecordDelete(
    "contact",
    id,
    existing.userId ?? undefined,
  );

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// HARD DELETE
// ─────────────────────────────────────────────────────────────────────────────

const deleteContact = async (req: Request) => {
  const { id } = req.params;

  const existing = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contact not found");
  }

  const result = await prisma.contact.delete({ where: { id } });

  await CacheInvalidator.onRecordDelete(
    "contact",
    id,
    existing.userId ?? undefined,
  );

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export const contactService = {
  createContact,
  getContactList,
  getContactById,
  getMyContact,
  updateContact,
  toggleStatusContact,
  softDeleteContact,
  deleteContact,
};
