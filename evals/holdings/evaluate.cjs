// Run against the built site's local file reader. Fixtures contain no client information.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  parsePage,
  reviewHoldings,
} = require("../../frontend/src/holdings/review");
const [dir, origin, report] = process.argv.slice(2);
const allowed = new Set(["AAPL", "MSFT"]);
const canon = (s) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

function score(lines, gold) {
  const draft = parsePage(lines.map((text) => ({ text })));
  const fields = [
    [draft.date, gold.date],
    [draft.currency, gold.currency === "USD" ? "USD" : ""],
    [draft.total, gold.total],
  ];
  gold.rows.forEach((row, i) => {
    for (const [key, value] of Object.entries(row))
      fields.push([draft.rows[i]?.[key], value]);
  });
  const matches = fields.filter(
    ([a, b]) =>
      canon(a) === canon(b) ||
      (canon(a) && canon(b) && Number.isFinite(+a) && +a === +b),
  ).length;
  let accepted,
    wrongAmount = false;
  try {
    const portfolio = reviewHoldings(draft, allowed);
    accepted = true;
    wrongAmount =
      portfolio.checked.length !== gold.rows.length ||
      portfolio.checked.some((r, i) => {
        const expected = gold.rows[i];
        return (
          !expected ||
          r.ticker !== expected.ticker ||
          Math.abs(
            r.value - Number(expected.value ?? +expected.qty * +expected.price),
          ) > 0.005
        );
      });
  } catch {
    accepted = false;
  }
  return { matches, fields: fields.length, accepted, wrongAmount };
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(origin + "/manifest.json");
    const rows = [];
    for (const gold of JSON.parse(
      fs.readFileSync(path.join(dir, "gold.json"), "utf8"),
    )) {
      const bytes = fs
        .readFileSync(path.join(dir, gold.file))
        .toString("base64");
      const observed = await page.evaluate(
        async ({ bytes, name }) => {
          const { readHoldingsPage } = await import(
            "/static/holdings-v1/reader.js"
          );
          const file = new File(
            [Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))],
            name,
          );
          const result = await readHoldingsPage(file);
          return {
            method: result.method,
            lines: result.lines.map((l) => l.text),
          };
        },
        { bytes, name: gold.file },
      );
      const actual = score(observed.lines, gold);
      const oracle = score(gold.lines, gold);
      rows.push({
        file: gold.file,
        valid: gold.valid,
        method: observed.method,
        actual,
        oracle,
      });
      console.log(
        gold.file,
        actual.matches + "/" + actual.fields,
        actual.accepted,
      );
    }
    fs.writeFileSync(report, JSON.stringify(rows, null, 2) + "\n");
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
