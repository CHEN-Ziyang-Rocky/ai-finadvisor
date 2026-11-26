// Inputs are official fictitious samples. Retain only checksums and layout observations.
const { chromium } = require("playwright");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { parsePage } = require(
  process.env.HOLDINGS_PARSER || "../../frontend/src/holdings/review",
);
const [directory, origin] = process.argv.slice(2);
const cases = [
  [
    "fa4-source-fidelity.pdf",
    7,
    "36a166a5a13e6d6d86b391233023f83f6f7b4d268a4a23fbae01cb81290e3b96",
  ],
  [
    "fa4-source-2011.pdf",
    5,
    "1adfac7dfa21e754f51e936b6e8bf3a395355fd585899866153b51a5a24c26c1",
  ],
];
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.goto(origin + "/manifest.json");
    const observations = [];
    for (const [file, pageNumber, sha256] of cases) {
      const bytes = fs.readFileSync(path.join(directory, file));
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== sha256)
        throw Error("Publisher sample version changed: " + file);
      const result = await page.evaluate(
        async ({ data, pageNumber }) => {
          const { readHoldingsPage } = await import(
            "/static/holdings-v1/reader.js"
          );
          const file = new File(
            [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
            "sample.pdf",
          );
          const { method, lines } = await readHoldingsPage(file, pageNumber);
          return { method, lines };
        },
        { data: bytes.toString("base64"), pageNumber },
      );
      const draft = parsePage(result.lines);
      if (
        !process.env.HOLDINGS_PARSER &&
        (!draft.manualLayout ||
          draft.rows.length ||
          draft.currency ||
          draft.total ||
          !result.lines.length)
      ) {
        throw Error(
          "Expected source text and an empty manual draft for " + file,
        );
      }
      observations.push({
        file,
        sha256,
        pageNumber,
        method: result.method,
        sourceLines: result.lines.length,
        draftHoldings: draft.rows.length,
        subtotalPrefilled: draft.total !== "",
        currencyPrefilled: draft.currency !== "",
        manualLayout: draft.manualLayout === true,
      });
    }
    console.log(JSON.stringify(observations, null, 2));
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
