import {
  CheckCircle2,
  Download,
  FileImage,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  createIcons,
} from "lucide";
import "./styles.css";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type JobStatus = "queued" | "processing" | "complete" | "error";

interface ImageJob {
  id: string;
  file: File;
  status: JobStatus;
  error?: string;
  result?: {
    blob: Blob;
    downloadUrl: string;
    filename: string;
  };
}

const fileInput = getElement<HTMLInputElement>("file-input");
const dropZone = getElement<HTMLLabelElement>("drop-zone");
const queuePanel = getElement<HTMLDivElement>("queue-panel");
const queueCount = getElement<HTMLHeadingElement>("queue-count");
const queueSummary = getElement<HTMLParagraphElement>("queue-summary");
const fileList = getElement<HTMLDivElement>("file-list");
const clearButton = getElement<HTMLButtonElement>("clear-button");
const processButton = getElement<HTMLButtonElement>("process-button");
const resultsPanel = getElement<HTMLElement>("results-panel");
const resultList = getElement<HTMLDivElement>("result-list");
const downloadAllButton = getElement<HTMLButtonElement>("download-all-button");

let jobs: ImageJob[] = [];
let isProcessing = false;

createIcons({
  icons: {
    CheckCircle2,
    Download,
    FileImage,
    LoaderCircle,
    ShieldCheck,
    Sparkles,
    Trash2,
    UploadCloud,
    X,
  },
});

fileInput.addEventListener("change", () => {
  addFiles(Array.from(fileInput.files ?? []));
  fileInput.value = "";
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
}

dropZone.addEventListener("drop", (event) => {
  addFiles(Array.from(event.dataTransfer?.files ?? []));
});

clearButton.addEventListener("click", clearJobs);
processButton.addEventListener("click", processJobs);
downloadAllButton.addEventListener("click", () => {
  for (const job of jobs.filter((candidate) => candidate.result)) {
    downloadResult(job);
  }
});

window.addEventListener("pagehide", revokeResultUrls);

function addFiles(files: File[]): void {
  const existingKeys = new Set(jobs.map(({ file }) => fileKey(file)));

  for (const file of files) {
    if (existingKeys.has(fileKey(file))) {
      continue;
    }

    const error = validateFile(file);
    jobs.push({
      id: crypto.randomUUID(),
      file,
      status: error ? "error" : "queued",
      error,
    });
    existingKeys.add(fileKey(file));
  }

  render();
}

function validateFile(file: File): string | undefined {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return "Unsupported format";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "File is larger than 10 MB";
  }

  if (file.size === 0) {
    return "File is empty";
  }

  return undefined;
}

async function processJobs(): Promise<void> {
  const pendingJobs = jobs.filter((job) => job.status === "queued");
  if (pendingJobs.length === 0 || isProcessing) {
    return;
  }

  isProcessing = true;
  render();

  for (const job of pendingJobs) {
    job.status = "processing";
    render();

    try {
      const formData = new FormData();
      formData.append("image", job.file, job.file.name);

      const response = await fetch("/api/strip-metadata", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(problem?.error ?? "The server could not clean this image.");
      }

      const blob = await response.blob();
      job.result = {
        blob,
        downloadUrl: URL.createObjectURL(blob),
        filename: getDownloadName(response, job.file.name),
      };
      job.status = "complete";
    } catch (error) {
      job.status = "error";
      job.error = error instanceof Error ? error.message : "The image could not be processed.";
    }

    render();
  }

  isProcessing = false;
  render();
}

function removeJob(id: string): void {
  const job = jobs.find((candidate) => candidate.id === id);
  if (job?.result) {
    URL.revokeObjectURL(job.result.downloadUrl);
  }
  jobs = jobs.filter((candidate) => candidate.id !== id);
  render();
}

function clearJobs(): void {
  if (isProcessing) {
    return;
  }
  revokeResultUrls();
  jobs = [];
  render();
}

function revokeResultUrls(): void {
  for (const job of jobs) {
    if (job.result) {
      URL.revokeObjectURL(job.result.downloadUrl);
    }
  }
}

function render(): void {
  queuePanel.hidden = jobs.length === 0;
  queueCount.textContent = `${jobs.length} ${jobs.length === 1 ? "image" : "images"}`;
  queueSummary.textContent = `${formatBytes(jobs.reduce((total, job) => total + job.file.size, 0))} total`;
  clearButton.disabled = isProcessing;

  const processableCount = jobs.filter((job) => job.status === "queued").length;
  processButton.disabled = isProcessing || processableCount === 0;
  processButton.classList.toggle("is-loading", isProcessing);
  processButton.innerHTML = isProcessing
    ? '<i data-lucide="loader-circle" aria-hidden="true"></i><span>Cleaning images</span>'
    : '<i data-lucide="sparkles" aria-hidden="true"></i><span>Remove metadata</span>';

  fileList.replaceChildren(...jobs.map(renderQueueItem));

  const completedJobs = jobs.filter((job) => job.result);
  resultsPanel.hidden = completedJobs.length === 0;
  resultList.replaceChildren(...completedJobs.map(renderResultItem));
  downloadAllButton.hidden = completedJobs.length < 2;

  createIcons({
    icons: { CheckCircle2, Download, FileImage, LoaderCircle, Sparkles, X },
  });
}

function renderQueueItem(job: ImageJob): HTMLElement {
  const row = document.createElement("article");
  row.className = `file-row status-${job.status}`;

  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.innerHTML = '<i data-lucide="file-image" aria-hidden="true"></i>';

  const details = document.createElement("div");
  details.className = "file-details";
  const name = document.createElement("strong");
  name.textContent = job.file.name;
  const meta = document.createElement("span");
  meta.textContent = job.error ?? statusLabel(job);
  details.append(name, meta);

  const action = document.createElement("button");
  action.className = "icon-button compact";
  action.type = "button";
  action.title = job.status === "processing" ? "Processing image" : "Remove image";
  action.disabled = job.status === "processing";
  action.innerHTML = job.status === "processing"
    ? '<i data-lucide="loader-circle" aria-hidden="true"></i>'
    : '<i data-lucide="x" aria-hidden="true"></i>';
  action.addEventListener("click", () => removeJob(job.id));

  row.append(icon, details, action);
  return row;
}

function renderResultItem(job: ImageJob): HTMLElement {
  const result = job.result!;
  const row = document.createElement("article");
  row.className = "result-row";

  const status = document.createElement("span");
  status.className = "success-icon";
  status.innerHTML = '<i data-lucide="check-circle-2" aria-hidden="true"></i>';

  const details = document.createElement("div");
  details.className = "file-details";
  const name = document.createElement("strong");
  name.textContent = result.filename;
  const meta = document.createElement("span");
  meta.textContent = `${formatBytes(result.blob.size)} cleaned`;
  details.append(name, meta);

  const download = document.createElement("button");
  download.className = "download-button";
  download.type = "button";
  download.innerHTML = '<i data-lucide="download" aria-hidden="true"></i><span>Download</span>';
  download.addEventListener("click", () => downloadResult(job));

  row.append(status, details, download);
  return row;
}

function downloadResult(job: ImageJob): void {
  if (!job.result) {
    return;
  }
  const link = document.createElement("a");
  link.href = job.result.downloadUrl;
  link.download = job.result.filename;
  link.click();
}

function getDownloadName(response: Response, fallbackName: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  if (match?.[1]) {
    return match[1];
  }
  const baseName = fallbackName.replace(/\.[^.]+$/, "");
  return `${baseName}-clean`;
}

function statusLabel(job: ImageJob): string {
  switch (job.status) {
    case "queued":
      return `${formatBytes(job.file.size)} · Ready`;
    case "processing":
      return `${formatBytes(job.file.size)} · Uploading to API`;
    case "complete":
      return `${formatBytes(job.file.size)} · Cleaned`;
    case "error":
      return job.error ?? "Could not process image";
  }
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}