# Supplier Registration

A Fiori elements Object Page for one supplier registration. It uses SAPUI5 1.136 and the Horizon theme. Company names, audits and document previews are fictional. The data lives in the browser, so a reload restores the sample file. There is no CAP service and no SAP system behind it.

The page opens on Helvetia Motion AG. The header shows the company logo, approval status, risk, file completeness and the last audit. Company, payment, decision and compliance are field groups. Certificates and the logo are image streams, and further documents sit in a table.

## Run locally

```bash
npm install
npm start
```

Opens [http://localhost:8085/index.html](http://localhost:8085/index.html).

Regenerate the document previews:

```bash
npm run generate-previews
```

## What you can do

- Read the coloured approval, risk and audit indicators, and the file-completeness bar, in the header.
- Scroll the company, location, payment, decision and compliance sections. The location section shows the supplier on an OpenStreetMap.
- Open a supporting document to preview a PDF, a Word file, an Excel sheet, or an image. Upload, on the Documents section, adds an image, Word, Excel, or PDF file to that list for this browser session. Download saves the file shown in Document preview.

Another registration opens by key, for example `index.html#/SupplierRegistrations('SR-1004')` for the rejected Baltic Forge file.

## Publishing on the MindTek site

The Work page lives in [mindtek](https://github.com/igormuntoreanu/mindtek). Its GitHub Pages workflow checks out this repository and copies `webapp/` into the site. To show this app at `https://mindtek-ltd.com/supplier-registration/`:

1. In `.github/workflows/pages.yml`, check out this repository next to the others:

```yaml
      - uses: actions/checkout@v4
        with:
          repository: igormuntoreanu/mindtek-supplier-registration
          path: vendor/supplier-registration
```

2. Copy it into the site output:

```yaml
          mkdir -p dist/supplier-registration
          cp -a vendor/supplier-registration/webapp/. dist/supplier-registration/
```

3. In `webapp/controller/Portfolio.controller.js`, point the Supplier Registration tile at this app:

```javascript
url: this._showcaseUrl(
    "http://localhost:8085/index.html",
    "https://mindtek-ltd.com/supplier-registration/"
)
```

The workflow checks out the default branch, so this repository needs the app on `main` before that MindTek build will pick it up. Locally, run this app on port 8085 and the MindTek site on port 8080.
