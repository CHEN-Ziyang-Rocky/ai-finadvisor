// Parse only labelled columns. Preserve ambiguous values for human correction.
const tickerPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;
function amount(text) {
  const raw = String(text ?? "").trim();
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(raw)) return NaN;
  const value = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(value) && value > 0 && value <= 1e12 ? value : NaN;
}
function header(line) {
  const normalized = line
    .toLowerCase()
    .replace(/market\s+value|position\s+value/g, "value")
    .replace(/unit\s+price|last\s+price/g, "price")
    .replace(/symbol/g, "ticker")
    .replace(/quantity|shares/g, "qty")
    .replace(/\busd\b|[()$]/g, "");
  const columns = normalized.trim().split(/[\s|]+/);
  return columns.includes("ticker") &&
    columns.every((s) => ["ticker", "qty", "price", "value"].includes(s)) &&
    new Set(columns).size === columns.length &&
    (columns.includes("value") ||
      (columns.includes("qty") && columns.includes("price")))
    ? columns
    : null;
}
// Use positions only when the header contains a distinct anchor for every column.
function columnAnchors(words, columns) {
  if (!words?.length) return null;
  const labels =
    /^(ticker|symbol|shares|quantity|qty|unit price|last price|price|market value|position value|value)$/i;
  const anchors = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const pair = word.text + " " + (words[i + 1]?.text || "");
    if (labels.test(pair)) i++;
    else if (!labels.test(word.text)) return null;
    anchors.push(word.x);
  }
  if (
    anchors.length !== columns.length ||
    anchors.some((x, i) => !Number.isFinite(x) || (i && x <= anchors[i - 1]))
  )
    return null;
  return anchors;
}

function recoverAlignedCells(words, columns, anchors) {
  if (!anchors || !words?.length) return {};
  const gap = Math.min(...anchors.slice(1).map((x, i) => x - anchors[i]));
  const fields = {};
  for (const { text, x } of words) {
    const i = anchors.findIndex((start) => Math.abs(x - start) < gap * 0.22);
    if (i < 0 || columns[i] in fields || /\s/.test(text)) return {};
    fields[columns[i]] = text;
  }
  return fields;
}
function parsePage(lines) {
  const combined = lines.map((l) => l.text).join("\n");
  const currency = /\bUSD\b|US dollars/i.test(combined) ? "USD" : "";
  const blocked =
    /\b(?:EUR|GBP|JPY|CNY|RMB|HKD|CAD|AUD|CHF|NZD|SGD|INR|KRW|TWD|pence|cents?|thousands?|millions?|billions?|000s)\b|[€£¥]|千元|万元|百万/i.test(
      combined,
    );
  const date = combined.match(/\b\d{4}-\d\d-\d\d\b/)?.[0] || "";
  let columns = null,
    anchors = null,
    tables = 0;
  const subtotals = [];
  const rows = [];
  for (const [line, source] of lines.entries()) {
    const tokens = source.text
      .replace(/\$\s+(?=\d)/g, "$")
      .trim()
      .split(/[\s|]+/);
    if (
      /^(?:portfolio\s+|holdings\s+|grand\s+)?total\b/i.test(source.text.trim())
    ) {
      // A brokerage total may include cost, market value, income and yield.
      const single = source.text
        .trim()
        .match(
          /^(?:(?:portfolio|holdings|grand)\s+)?total\s*:?\s+((?:\$\s*)?[\d,.]+)$/i,
        );
      if (columns) subtotals.push(single ? single[1].replace(/\s/g, "") : "");
      continue;
    }
    const schema = header(source.text);
    if (schema) {
      tables++;
      columns = schema;
      anchors = columnAnchors(source.words, columns);
      continue;
    }
    if (!columns || !tokens.some((t) => /\d/.test(t))) continue;
    const symbol = tokens[columns.indexOf("ticker")] || "";
    // A malformed row remains visible for review, never silently shifts columns.
    const fields =
      tokens.length === columns.length
        ? Object.fromEntries(columns.map((c, i) => [c, tokens[i]]))
        : recoverAlignedCells(source.words, columns, anchors);
    rows.push({
      ticker:
        fields.ticker ||
        (columns[0] === "ticker" && tickerPattern.test(symbol) ? symbol : ""),
      qty: fields.qty || "",
      price: fields.price || "",
      value: fields.value || "",
      line,
      needsReview:
        (source.confidence != null && source.confidence < 85) ||
        tokens.length !== columns.length,
    });
  }
  return {
    rows: tables === 1 ? rows.slice(0, 50) : [],
    manualLayout: tables !== 1,
    total:
      tables === 1 &&
      subtotals.length === 1 &&
      Number.isFinite(amount(subtotals[0]))
        ? subtotals[0]
        : "",
    date: tables === 1 ? date : "",
    currency: tables === 1 ? currency : "",
    blocked: blocked || rows.length > 50,
  };
}
function reviewHoldings(draft, eligible, limit = 10) {
  if (draft.blocked)
    throw Error(
      "Use a table in unscaled USD with a single currency and at most 50 source rows.",
    );
  if (draft.currency !== "USD")
    throw Error("Verify the table currency is USD.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    !Number.isFinite(Date.parse(draft.date)) ||
    new Date(draft.date).toISOString().slice(0, 10) !== draft.date
  )
    throw Error("Enter the statement date as YYYY-MM-DD.");
  if (!draft.rows.length || draft.rows.length > limit)
    throw Error(`Use 1–${limit} supported stock rows.`);
  const seen = new Set();
  const checked = draft.rows.map((row, i) => {
    const ticker = row.ticker.trim().toUpperCase();
    if (!tickerPattern.test(ticker) || !eligible.has(ticker))
      throw Error(`Row ${i + 1}: select an eligible stock ticker.`);
    if (seen.has(ticker))
      throw Error(
        `Row ${i + 1}: duplicate ticker ${ticker}. Reconcile duplicate rows.`,
      );
    seen.add(ticker);
    const quantity = row.qty.trim() ? amount(row.qty) : null,
      price = row.price.trim() ? amount(row.price) : null;
    if (
      (quantity !== null && !Number.isFinite(quantity)) ||
      (price !== null && !Number.isFinite(price))
    )
      throw Error(`Row ${i + 1}: check quantity and price.`);
    const computed =
      quantity !== null && price !== null ? quantity * price : null;
    const value = row.value.trim() ? amount(row.value) : computed;
    if (!Number.isFinite(value) || value <= 0 || value > 1e12)
      throw Error(
        `Row ${i + 1}: enter market value, or both quantity and price.`,
      );
    if (computed !== null && Math.abs(computed - value) > 0.0100001)
      throw Error(
        `Row ${i + 1}: quantity × price differs from market value. Verify the source precision.`,
      );
    return { ticker, quantity, price, value };
  });
  const expected = amount(draft.total),
    total = checked.reduce((sum, r) => sum + r.value, 0);
  if (!Number.isFinite(expected) || Math.abs(expected - total) > 0.0100001)
    throw Error(
      "Enter the independent holdings subtotal from the source. Row values must reconcile within one cent.",
    );
  if (total < 1 || total > 1e9)
    throw Error("Supported simulation starting amounts are $1 to $1 billion.");
  return {
    as_of: draft.date,
    source: "reviewed_import",
    tickers: checked.map((r) => r.ticker),
    weights: checked.map((r) => r.value / total),
    total,
    checked,
  };
}
function exportCsv(portfolio) {
  return [
    "date,currency,ticker,quantity,price,market_value_usd,weight",
    ...portfolio.checked.map((r, i) =>
      [
        portfolio.as_of,
        "USD",
        r.ticker,
        r.quantity ?? "",
        r.price ?? "",
        r.value,
        portfolio.weights[i],
      ].join(","),
    ),
  ].join("\r\n");
}
module.exports = { parsePage, reviewHoldings, exportCsv };
