// Browser entry point. All file data and OCR output live inside this tab.
const base = new URL("./", import.meta.url).href;
const maxPixels = 8_000_000;
function checkDimensions(width, height) {
  if (
    !(
      width > 0 &&
      height > 0 &&
      width * height <= maxPixels &&
      Math.max(width, height) <= 6500
    )
  ) {
    throw Error(
      "Crop the image to the holdings table (up to 8 megapixels and 6500 pixels per side).",
    );
  }
}
function jpegDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 2;
  while (pos + 9 < bytes.length) {
    if (bytes[pos++] !== 255) break;
    while (bytes[pos] === 255) pos++;
    const marker = bytes[pos++];
    if ([0xc0, 0xc1, 0xc2].includes(marker))
      return [view.getUint16(pos + 5), view.getUint16(pos + 3)];
    const size = view.getUint16(pos);
    if (size < 2) break;
    pos += size;
  }
  throw Error("The JPEG header could not be read.");
}
async function recognize(canvas, signal) {
  const { default: ocr } = await import("./ocr.js");
  signal?.throwIfAborted();
  let worker,
    expired = false,
    timer,
    abort,
    failWorker;
  const deadline = new Promise((_, reject) => {
    failWorker = () =>
      reject(Error("The recognition engine could not read this page."));
    abort = () => reject(Error("Recognition cancelled."));
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(
      () => reject(Error("Recognition timed out. Try a smaller crop.")),
      45000,
    );
  });
  try {
    const ready = ocr
      .createWorker("eng", 1, {
        workerPath: base + "ocr-worker.js",
        corePath: base + "core.js",
        langPath: base,
        workerBlobURL: false,
        cacheMethod: "none",
        errorHandler: failWorker,
      })
      .then(async (instance) => {
        if (expired) {
          await instance.terminate();
          return;
        }
        worker = instance;
      });
    await Promise.race([ready, deadline]);
    await Promise.race([
      worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
      }),
      deadline,
    ]);
    const { data } = await Promise.race([
      worker.recognize(canvas, {}, { blocks: true, text: true }),
      deadline,
    ]);
    return (data.blocks || []).flatMap((b) =>
      b.paragraphs.flatMap((p) =>
        p.lines.map((line) => ({
          text: line.text.trim(),
          confidence: line.confidence,
          words: line.words.map((w) => ({
            text: w.text.trim(),
            x: w.bbox.x0 / canvas.width,
          })),
          box: [
            line.bbox.x0 / canvas.width,
            line.bbox.y0 / canvas.height,
            line.bbox.x1 / canvas.width,
            line.bbox.y1 / canvas.height,
          ],
        })),
      ),
    );
  } finally {
    expired = true;
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}
function pdfLines(items, viewport) {
  const groups = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const x = item.transform[4],
      y = item.transform[5];
    const [x0, bottom] = viewport.convertToViewportPoint(x, y);
    const [right, top] = viewport.convertToViewportPoint(
      x + item.width,
      y + item.height,
    );
    const group = groups.find(
      (g) =>
        Math.abs(g.y - bottom) <= Math.max(2, Math.abs(bottom - top) * 0.3),
    );
    const word = { x0, right, top, bottom, text: item.str.trim() };
    if (group) group.words.push(word);
    else groups.push({ y: bottom, words: [word] });
  }
  return groups
    .sort((a, b) => a.y - b.y)
    .map(({ words }) => ({
      text: words
        .sort((a, b) => a.x0 - b.x0)
        .map((w) => w.text)
        .join(" "),
      words: words.map((w) => ({ text: w.text, x: w.x0 / viewport.width })),
      confidence: null,
      box: [
        Math.min(...words.map((w) => w.x0)) / viewport.width,
        Math.min(...words.map((w) => w.top)) / viewport.height,
        Math.max(...words.map((w) => w.right)) / viewport.width,
        Math.max(...words.map((w) => w.bottom)) / viewport.height,
      ],
    }));
}
export async function readHoldingsPage(file, pageNumber = 1, signal) {
  if (!file?.size || file.size > 8 * 1024 * 1024)
    throw Error("Choose a PDF, PNG or JPEG up to 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  let lines = [],
    pages = 1,
    method = "Image OCR";
  if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
    const pdf = await import("./pdf.js");
    pdf.GlobalWorkerOptions.workerSrc = base + "pdf-worker.js";
    const loading = pdf.getDocument({
      data: bytes,
      isEvalSupported: false,
      maxImageSize: maxPixels,
      useSystemFonts: true,
      useWasm: false,
      disableFontFace: true,
      stopAtErrors: true,
    });
    const passwordRequired = new Promise((_, reject) => {
      loading.onPassword = () =>
        reject(
          Error("Unlock the PDF locally or choose a screenshot of the table."),
        );
    });
    try {
      const doc = await Promise.race([loading.promise, passwordRequired]);
      pages = doc.numPages;
      if (pages > 32 || pageNumber < 1 || pageNumber > pages)
        throw Error("Choose one valid page from a PDF of at most 32 pages.");
      const page = await doc.getPage(pageNumber);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(2, 2000 / Math.max(size.width, size.height)),
      });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const content = await page.getTextContent();
      if (content.items.length > 4000)
        throw Error("This page is too dense. Crop the table as an image.");
      lines = pdfLines(content.items, viewport);
      method = "PDF text";
      if (
        lines.length < 3 ||
        !lines.some((l) => /ticker|symbol|\d[\d,]*\.\d{2}/i.test(l.text))
      ) {
        method = "Scanned page OCR";
        lines = await recognize(canvas, signal);
      }
    } finally {
      await loading.destroy();
    }
  } else {
    const png =
      bytes.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    if (!png && !(bytes[0] === 255 && bytes[1] === 216))
      throw Error("Supported files are PDF, PNG and JPEG.");
    const v = new DataView(bytes.buffer);
    checkDimensions(
      ...(png ? [v.getUint32(16), v.getUint32(20)] : jpegDimensions(bytes)),
    );
    const bitmap = await createImageBitmap(file);
    try {
      checkDimensions(bitmap.width, bitmap.height);
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
    } finally {
      bitmap.close();
    }
    lines = await recognize(canvas, signal);
  }
  signal?.throwIfAborted();
  return {
    method,
    pages,
    pageNumber,
    lines,
    preview: canvas.toDataURL("image/png"),
  };
}
