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
function parsePage(lines) {
  const combined = lines.map((l) => l.text).join("\n");
  const currency = /\bUSD\b|US dollars/i.test(combined) ? "USD" : "";
  const blocked =
    /\b(?:EUR|GBP|JPY|CNY|RMB|HKD|CAD|AUD|CHF|NZD|SGD|INR|KRW|TWD|pence|cents?|thousands?|millions?|billions?|000s)\b|[€£¥]|千元|万元|百万/i.test(
      combined,
    );
  const date = combined.match(/\b\d{4}-\d\d-\d\d\b/)?.[0] || "";
  let columns = null,
    total = "";
  const rows = [];
  for (const [line, source] of lines.entries()) {
    const tokens = source.text
      .replace(/\$\s+(?=\d)/g, "$")
      .trim()
      .split(/[\s|]+/);
    if (/^(?:portfolio\s+|holdings\s+|grand\s+)?total\b/i.test(source.text)) {
      const candidate = tokens.at(-1);
      if (Number.isFinite(amount(candidate))) total = candidate;
      continue;
    }
    const schema = header(source.text);
    if (schema) {
      columns = schema;
      continue;
    }
    if (!columns || !tokens.some((t) => /\d/.test(t))) continue;
    const symbol = tokens[columns.indexOf("ticker")] || "";
    // A malformed row remains visible for review, never silently shifts columns.
    const fields =
      tokens.length === columns.length
        ? Object.fromEntries(columns.map((c, i) => [c, tokens[i]]))
        : {};
    rows.push({
      ticker: fields.ticker || symbol,
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
    rows: rows.slice(0, 50),
    total,
    date,
    currency,
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
