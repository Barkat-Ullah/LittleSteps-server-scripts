import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import ApiError from "../error/ApiErrors";
import httpStatus from "http-status";

dotenv.config();

const s3Endpoint = process.env.S3_ENDPOINT ?? process.env.DO_SPACE_ENDPOINT;
const s3AccessKeyId =
  process.env.S3_ACCESS_KEY ?? process.env.DO_SPACE_ACCESS_KEY;
const s3SecretAccessKey =
  process.env.S3_SECRET_KEY ?? process.env.DO_SPACE_SECRET_KEY;
const s3Region = process.env.S3_REGION ?? process.env.DO_SPACE_REGION ?? "atl1";

// Configure DigitalOcean Spaces or generic S3-compatible storage
const s3Client = new S3Client({
  region: s3Region,
  endpoint: s3Endpoint,
  credentials: {
    accessKeyId: s3AccessKeyId || "",
    secretAccessKey: s3SecretAccessKey || "",
  },
});

// Multer configuration using memoryStorage (for DigitalOcean & Cloudinary)
const storage = multer.memoryStorage();
// File filter for validation
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "application/pdf",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 50MB max
  },
});

// Upload single image
const uploadSingle = upload.single("image");
const uploadFile = upload.single("file");

// Upload multiple images
const uploadMultipleImage = upload.fields([{ name: "images", maxCount: 15 }]);

// ✅ Unchanged: DigitalOcean Upload
const uploadToDigitalOcean = async (file: Express.Multer.File) => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  try {
    const Key = `nathancloud/${Date.now()}_${uuidv4()}_${file.originalname}`;
    const bucket = process.env.S3_BUCKET ?? process.env.DO_SPACE_BUCKET ?? "";
    const uploadParams = {
      Bucket: bucket,
      Key,
      Body: file.buffer, // ✅ Use buffer instead of file path
      ACL: "public-read" as ObjectCannedACL,
      ContentType: file.mimetype,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    const baseUrl =
      process.env.S3_PUBLIC_BASE_URL ??
      process.env.DO_SPACE_CDN_ENDPOINT ??
      s3Endpoint;
    const fileURL = `${baseUrl?.replace(/\/$/, "")}/${bucket}/${Key}`;
    return {
      Location: fileURL,
      Bucket: bucket,
      Key,
    };
  } catch (error) {
    console.error("Error uploading file to DigitalOcean:", error);
    throw error;
  }
};

//* upload with type
const FILE_LIMITS = {
  image: {
    size: 20 * 1024 * 1024,
    formats: ["jpg", "jpeg", "png", "webp", "heic"],
  }, // 5MB
  video: { size: 200 * 1024 * 1024, formats: ["mp4", "mov", "avi", "webm"] }, // 50MB
  pdf: { size: 50 * 1024 * 1024, formats: ["pdf"] }, // 10MB
  voice: {
    size: 25 * 1024 * 1024,
    formats: ["webm", "mp3", "m4a", "wav", "ogg", "opus"],
  },
};

const validateFile = (
  file: Express.Multer.File,
  fileType: "image" | "video" | "pdf" | "voice",
) => {
  const limit = FILE_LIMITS[fileType];
  const ext = file.originalname.split(".").pop()?.toLowerCase();

  if (file.size > limit.size) {
    throw new Error(
      `${fileType} size exceeds ${limit.size / (1024 * 1024)}MB limit`,
    );
  }

  if (ext && !limit.formats.includes(ext)) {
    throw new Error(
      `Invalid ${fileType} format. Allowed: ${limit.formats.join(", ")}`,
    );
  }
};

const uploadToDigitalOceanWithType = async (
  file: Express.Multer.File,
  fileType: "image" | "video" | "pdf",
): Promise<{
  Location: string;
  Bucket: string;
  Key: string;
  resource_type: string;
}> => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  validateFile(file, fileType);

  try {
    const timestamp = Date.now();
    const uniqueId = uuidv4();
    const sanitizedFileName = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );

    // ✅ Just use filename without folder
    const Key = `${timestamp}_${uniqueId}_${sanitizedFileName}`;

    let contentType = file.mimetype;
    let contentDisposition = "inline";

    if (fileType === "pdf") {
      contentType = "application/pdf";
      contentDisposition =
        'inline; filename="' + encodeURIComponent(file.originalname) + '"';
    } else if (fileType === "video") {
      if (!contentType.startsWith("video/")) {
        contentType = "video/mp4";
      }
    } else if (fileType === "image") {
      if (!contentType.startsWith("image/")) {
        contentType = "image/jpeg";
      }
    }

    const bucket = process.env.S3_BUCKET ?? process.env.DO_SPACE_BUCKET ?? "";
    const region =
      process.env.S3_REGION ?? process.env.DO_SPACE_REGION ?? "atl1";

    const uploadParams = {
      Bucket: bucket,
      Key,
      Body: file.buffer,
      ACL: "public-read" as ObjectCannedACL,
      ContentType: contentType,
      ContentDisposition: contentDisposition,
      CacheControl: "max-age=31536000",
      Metadata: {
        originalname: file.originalname,
        filetype: fileType,
        uploadedAt: new Date().toISOString(),
      },
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    const cdnEndpoint =
      process.env.S3_PUBLIC_BASE_URL ?? process.env.DO_SPACE_CDN_ENDPOINT;
    const fileURL = cdnEndpoint
      ? `${cdnEndpoint.replace(/\/$/, "")}/${Key}`
      : `https://${bucket}.${region}.digitaloceanspaces.com/${Key}`;

    return {
      Location: fileURL,
      Bucket: bucket,
      Key,
      resource_type: fileType,
    };
  } catch (error: any) {
    console.error(`Error uploading ${fileType} to DigitalOcean:`, error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to upload ${fileType}: ${error.message || "Upload failed"}`,
    );
  }
};

const uploadToZenexCloudWithType = async (
  file: Express.Multer.File,
  fileType: "image" | "video" | "pdf",
): Promise<{ Location: string; Key: string; Bucket: string }> => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  // Validate file before upload
  validateFile(file, fileType);

  // ZenexCloud S3 Configuration
  const endpoint = (
    process.env.ZENEX_ENDPOINT || "http://vault.zenexcloud.com:9000"
  ).replace(/\/$/, "");
  const accessKeyId = process.env.ZENEX_ACCESS_KEY || "7SnO9zrkvWEacOSREMXI";
  const secretAccessKey =
    process.env.ZENEX_SECRET_KEY || "3SoY01MKsJqyGwlIuYVcPuMQrkMc3OjGco46Bkx9";
  const bucket = process.env.ZENEX_BUCKET;

  if (!bucket) {
    throw new Error("ZENEX_BUCKET is required and must be an existing bucket.");
  }

  const client = new S3Client({
    region: process.env.ZENEX_REGION || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    // Create organized folder structure based on file type
    const timestamp = Date.now();
    const uniqueId = uuidv4();
    const sanitizedFilename = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    const Key = `child-documents/${fileType}s/${timestamp}_${uniqueId}_${sanitizedFilename}`;

    // Upload parameters
    const uploadParams = {
      Bucket: bucket,
      Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // Optional: Add metadata for better organization
      Metadata: {
        "original-name": file.originalname,
        "file-type": fileType,
        "upload-date": new Date().toISOString(),
      },
    };

    // Upload to ZenexCloud
    await client.send(new PutObjectCommand(uploadParams));

    // Generate public URL
    const publicEndpoint = (
      process.env.ZENEX_PUBLIC_ENDPOINT || endpoint
    ).replace(/\/$/, "");
    const fileURL = `${publicEndpoint}/${bucket}/${Key}`;

    console.log(`✅ Successfully uploaded ${fileType} to ZenexCloud:`, fileURL);

    return {
      Location: fileURL,
      Key,
      Bucket: bucket,
    };
  } catch (error) {
    console.error(`❌ Error uploading ${fileType} to ZenexCloud:`, error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    throw error;
  }
};

export const fileUploader = {
  upload,
  uploadSingle,
  uploadMultipleImage,
  uploadFile,
  uploadToDigitalOcean,
  uploadToDigitalOceanWithType,
  uploadToZenexCloudWithType,
};
