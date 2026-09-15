# Image Metadata Remover

This utility removes metadata from JPEG, PNG, and WebP images. The browser uploads one file at a time to an Azure Static Web Apps managed Functions API. The API applies embedded orientation, re-encodes the image without copying EXIF, XMP, or IPTC data, and returns the result directly. Images are never persisted.

## Architecture

- `web/`: Vite and TypeScript static client
- `api/`: Node.js 22 Azure Functions v4 managed API
- `infra/`: Bicep for an Azure Static Web Apps Free resource
- `.github/workflows/azure-static-web-apps.yml`: frontend and managed API deployment

The browser does not decode, transform, or inspect image metadata. It only selects files, uploads them to `/api/strip-metadata`, and downloads the API response.

## Requirements

- Node.js 22
- Azure Functions Core Tools v4 for local API execution
- Azurite, or another valid `AzureWebJobsStorage` value, for local Functions storage
- Azure Developer CLI for infrastructure provisioning

## Local development

Install dependencies:

```powershell
npm ci --prefix api
npm ci --prefix web
Copy-Item api/local.settings.example.json api/local.settings.json
```

Start Azurite and the API in one terminal:

```powershell
Set-Location api
npm start
```

Start the Vite client in another terminal:

```powershell
Set-Location web
npm run dev
```

Vite proxies `/api` to the Functions host at `http://localhost:7071`.

## Validation

```powershell
npm test --prefix api
npm run typecheck --prefix api
npm run build --prefix api
npm run build --prefix web
npm audit --prefix api --omit=dev
npm audit --prefix web --omit=dev
```

## Azure preparation

Provision the Free-tier Static Web App after selecting an Azure subscription and region:

```powershell
azd auth login
azd env new
azd provision
```

Provisioning does not upload images or application code. In the Azure portal, open the new Static Web App, select **Manage deployment token**, and add the token to the GitHub repository as a secret named `AZURE_STATIC_WEB_APPS_API_TOKEN`. Push to `main` to run the included workflow. The workflow deploys `web` as the static client and `api` as the integrated managed API.

The deployment step is intentionally separate from provisioning so the API remains a Static Web Apps managed Function on the included consumption plan rather than a separately billed Function App.

## API

`POST /api/strip-metadata` accepts `multipart/form-data` with one `image` field.

- Supported formats: JPEG, PNG, WebP
- Maximum file size: 10 MB
- Maximum decoded pixel count: 40 million
- Animated and multi-page images: rejected
- Response: cleaned image binary with `Content-Disposition: attachment`

The API validates the decoded format rather than trusting the filename or browser-provided media type.
