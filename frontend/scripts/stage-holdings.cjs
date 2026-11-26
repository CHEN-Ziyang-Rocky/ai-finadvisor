// Serve pinned OCR/PDF assets from the application origin, on demand.
const fs = require("node:fs");
const path = require("node:path");
const frontend = path.resolve(__dirname, "..");
const out = path.join(
  frontend,
  process.argv[2] === "public" ? "public" : "build",
  "static",
  "holdings-v1",
);
fs.mkdirSync(out, { recursive: true });
const files = {
  "pdfjs-dist/build/pdf.min.mjs": "pdf.js",
  "pdfjs-dist/build/pdf.worker.min.mjs": "pdf-worker.js",
  "tesseract.js/dist/tesseract.esm.min.js": "ocr.js",
  "tesseract.js/dist/worker.min.js": "ocr-worker.js",
  "tesseract.js-core/tesseract-core-lstm.wasm.js": "core.js",
  "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz":
    "eng.traineddata.gz",
  "pdfjs-dist/LICENSE": "PDF-LICENSE.txt",
  "tesseract.js/LICENSE.md": "OCR-LICENSE.txt",
  "tesseract.js-core/LICENSE": "CORE-LICENSE.txt",
  "tesseract.js/dist/tesseract.min.js.LICENSE.txt": "OCR-NOTICES.txt",
  "tesseract.js/dist/worker.min.js.LICENSE.txt": "WORKER-NOTICES.txt",
};
for (const [source, name] of Object.entries(files))
  fs.copyFileSync(
    path.join(frontend, "node_modules", source),
    path.join(out, name),
  );
fs.copyFileSync(
  path.join(__dirname, "holdings/reader.mjs"),
  path.join(out, "reader.js"),
);
