import sharp, { type Metadata } from "sharp";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

export type SupportedImageFormat = "jpeg" | "png" | "webp";

export interface ProcessedImage {
  data: Buffer;
  extension: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

export class InvalidImageError extends Error {}

export async function stripImageMetadata(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) {
    throw new InvalidImageError("The uploaded file is empty.");
  }

  if (input.length > MAX_FILE_BYTES) {
    throw new InvalidImageError("The image exceeds the 10 MB limit.");
  }

  const source = sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  });

  let metadata: Metadata;
  try {
    metadata = await source.metadata();
  } catch {
    throw new InvalidImageError("The uploaded file is not a valid image.");
  }

  if (!isSupportedFormat(metadata.format)) {
    throw new InvalidImageError("Only JPEG, PNG, and WebP images are supported.");
  }

  if ((metadata.pages ?? 1) > 1) {
    throw new InvalidImageError("Animated and multi-page images are not supported.");
  }

  try {
    const oriented = source.rotate();

    switch (metadata.format) {
      case "jpeg":
        return {
          data: await oriented.jpeg({ quality: 90, mozjpeg: true }).toBuffer(),
          extension: "jpg",
          contentType: "image/jpeg",
        };
      case "png":
        return {
          data: await oriented.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
          extension: "png",
          contentType: "image/png",
        };
      case "webp":
        return {
          data: await oriented.webp({ quality: 90, effort: 4 }).toBuffer(),
          extension: "webp",
          contentType: "image/webp",
        };
    }

    throw new InvalidImageError("Only JPEG, PNG, and WebP images are supported.");
  } catch (error) {
    if (error instanceof InvalidImageError) {
      throw error;
    }

    throw new InvalidImageError("The image could not be processed.");
  }
}

function isSupportedFormat(format: string | undefined): format is SupportedImageFormat {
  return format === "jpeg" || format === "png" || format === "webp";
}