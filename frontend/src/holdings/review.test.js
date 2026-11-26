const { parsePage, reviewHoldings, exportCsv } = require("./review");
const eligible = new Set(["AAPL", "MSFT"]);
const lines = [
  "USD 2025-03-31",
  "Ticker Shares Price Market Value",
  "AAPL 2 150 300",
  "MSFT 1 100 100",
  "Total 400",
];
const parse = (source) => parsePage(source.map((text) => ({ text })));
const check = (source) => reviewHoldings(parse(source), eligible);

test("maps verified USD values to weights and canonical CSV", () => {
  const result = check(lines);
  expect(result.weights).toEqual([0.75, 0.25]);
  expect(exportCsv(result)).toContain("2025-03-31,USD,AAPL,2,150,300,0.75");
});
test.each([
  ["Total 400", "Total 401"],
  ["USD", "EUR"],
  ["USD", "USD in thousands"],
  ["2025-03-31", "2025-02-30"],
  ["MSFT", "AAPL"],
  ["150 300", "150 (300)"],
  ["150 300", "155 300"],
  ["MSFT", "=MSFT"],
  ["USD", "USD in cents"],
])("blocks invalid substitution %s → %s", (from, to) => {
  expect(() => check(lines.map((line) => line.replace(from, to)))).toThrow();
});
test("incomplete rows retain their source line and require review", () => {
  const draft = parse(lines.map((line) => line.replace("2 150 300", "2 300")));
  expect(draft.rows[0]).toMatchObject({
    line: 2,
    needsReview: true,
    value: "",
  });
  expect(() => reviewHoldings(draft, eligible)).toThrow();
});
