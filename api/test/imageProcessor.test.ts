import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  InvalidImageError,
  MAX_FILE_BYTES,
  stripImageMetadata,
} from "../src/imageProcessor.js";

describe("stripImageMetadata", () => {
  it("removes metadata while preserving the visible EXIF orientation", async () => {
    const source = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: "#d84a34",
      },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: {
            Copyright: "private metadata",
          },
        },
      })
      .toBuffer();

    const result = await stripImageMetadata(source);
    const metadata = await sharp(result.data).metadata();

    expect(result.contentType).toBe("image/jpeg");
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(12);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
  });

  it("rejects unsupported image data", async () => {
    await expect(stripImageMetadata(Buffer.from("not an image"))).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it.each([
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)("removes metadata from %s images", async (format, contentType) => {
    const encoder = sharp({
      create: {
        width: 6,
        height: 4,
        channels: 4,
        background: "#2d6271",
      },
    })[format]();
    const source = await encoder
      .withMetadata({ exif: { IFD0: { Copyright: "private metadata" } } })
      .toBuffer();

    const result = await stripImageMetadata(source);
    const metadata = await sharp(result.data).metadata();

    expect(result.contentType).toBe(contentType);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
  });

  it("rejects a valid image in an unsupported format", async () => {
    const gif = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: "#17211f",
      },
    })
      .gif()
      .toBuffer();

    await expect(stripImageMetadata(gif)).rejects.toThrow(
      "Only JPEG, PNG, and WebP images are supported.",
    );
  });

  it("rejects files larger than 10 MB before decoding", async () => {
    const oversized = Buffer.alloc(MAX_FILE_BYTES + 1);
    await expect(stripImageMetadata(oversized)).rejects.toThrow(
      "The image exceeds the 10 MB limit.",
    );
  });
});