import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  InvalidImageError,
  MAX_FILE_BYTES,
  stripImageMetadata,
} from "../imageProcessor.js";

export async function stripMetadata(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES + 1024 * 1024) {
    return errorResponse(413, "The image exceeds the 10 MB limit.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "Send the image as multipart form data.");
  }

  try {
    const upload = formData.get("image");

    if (!(upload instanceof File)) {
      return errorResponse(400, "Add an image using the 'image' form field.");
    }

    if (upload.size > MAX_FILE_BYTES) {
      return errorResponse(413, "The image exceeds the 10 MB limit.");
    }

    const result = await stripImageMetadata(Buffer.from(await upload.arrayBuffer()));
    const outputName = buildOutputName(upload.name, result.extension);

    context.log(`Cleaned image returned (${result.data.length} bytes).`);

    return {
      status: 200,
      body: result.data,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Content-Length": result.data.length.toString(),
        "Content-Type": result.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    };
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return errorResponse(400, error.message);
    }

    context.error("Image processing failed.");
    return errorResponse(500, "The image could not be processed.");
  }
}

function buildOutputName(originalName: string, extension: string): string {
  const baseName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${baseName || "image"}-clean.${extension}`;
}

function errorResponse(status: number, message: string): HttpResponseInit {
  return {
    status,
    jsonBody: { error: message },
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  };
}

app.http("strip-metadata", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "strip-metadata",
  handler: stripMetadata,
});