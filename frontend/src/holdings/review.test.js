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

const positioned = (text, cells) => ({
  text,
  words: cells.map(([text, x]) => ({ text, x })),
});
const heading = positioned("Ticker Shares Price Market Value", [
  ["Ticker", 0.04],
  ["Shares", 0.29],
  ["Price", 0.52],
  ["Market Value", 0.76],
]);
test.each([
  [
    positioned("AAPL 5", [
      ["AAPL", 0.04],
      ["5", 0.29],
    ]),
    "5",
    "",
    "",
  ],
  [
    positioned("AAPL 120 600", [
      ["AAPL", 0.04],
      ["120", 0.52],
      ["600", 0.76],
    ]),
    "",
    "120",
    "600",
  ],
  [
    positioned("AAPL 5", [
      ["AAPL", 0.04],
      ["5", 0.41],
    ]),
    "",
    "",
    "",
  ],
])(
  "retains only clearly aligned values on an incomplete row",
  (line, qty, price, value) => {
    const draft = parsePage([heading, line]);
    expect(draft.rows[0]).toMatchObject({
      ticker: "AAPL",
      qty,
      price,
      value,
      needsReview: true,
    });
  },
);
test("ignores unrelated page totals and currencies on unsupported layouts", () => {
  const draft = parse([
    "July 31, 2015",
    "Description Quantity Price per Unit Ending Market Value Cost Basis",
    "EXAMPLE ORD USD 1.00",
    "Total Stocks 9,500.00 300.00",
  ]);
  expect(draft).toMatchObject({
    manualLayout: true,
    rows: [],
    currency: "",
    total: "",
  });
});
test.each([
  ["Total 400.00 2.40"],
  ["Total Common Stock 400"],
  ["Total 400", "Grand Total 400"],
])("ambiguous subtotals require manual entry", (...totals) => {
  const draft = parse([...lines.slice(0, 4), ...totals]);
  expect(draft.total).toBe("");
  expect(() => reviewHoldings(draft, eligible)).toThrow(/subtotal/);
});
test("keeps separate holdings tables out of a single draft", () => {
  expect(parse([...lines, ...lines])).toMatchObject({
    manualLayout: true,
    rows: [],
    total: "",
  });
});
