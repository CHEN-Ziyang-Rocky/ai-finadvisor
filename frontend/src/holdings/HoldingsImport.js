import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  TextField,
} from "@mui/material";
import { fetchAvailableAssets } from "../api";
import { demoToken } from "../utils/demo";
import { parsePage, reviewHoldings, exportCsv } from "./review";

const emptyRow = () => ({
  ticker: "",
  qty: "",
  price: "",
  value: "",
  line: null,
  needsReview: true,
});
export default function HoldingsImport({ onUse }) {
  const [file, setFile] = useState(null),
    [page, setPage] = useState(null),
    [draft, setDraft] = useState(null);
  const [eligible, setEligible] = useState(null),
    [focus, setFocus] = useState(null),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const job = useRef(null),
    picker = useRef(null);
  useEffect(() => () => job.current?.abort(), []);
  function clear() {
    job.current?.abort();
    job.current = null;
    setFile(null);
    setPage(null);
    setDraft(null);
    setFocus(null);
    setConfirmed(false);
    setBusy(false);
    setError("");
    if (picker.current) picker.current.value = "";
  }
  async function read(selected, number = 1) {
    job.current?.abort();
    const controller = new AbortController();
    job.current = controller;
    setFile(selected);
    setBusy(true);
    setPage(null);
    setDraft(null);
    setError("");
    setConfirmed(false);
    setFocus(null);
    try {
      const runtime = "/static/holdings-v1/reader.js?layout=2";
      const { readHoldingsPage } = await import(
        /* webpackIgnore: true */ runtime
      );
      const [data, catalog] = await Promise.all([
        readHoldingsPage(selected, number, controller.signal),
        fetchAvailableAssets(),
      ]);
      if (controller.signal.aborted) return;
      const approved = new Set(
        (catalog.catalog || []).filter((a) => a.eligible).map((a) => a.ticker),
      );
      if (!approved.size)
        throw Error("Eligible stock list is unavailable. Please try again.");
      setEligible(approved);
      setPage(data);
      setDraft(parsePage(data.lines));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e.message || "Could not read this file.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function edit(patch) {
    setConfirmed(false);
    setDraft({ ...draft, ...patch });
  }
  function editRow(i, key, value) {
    edit({
      rows: draft.rows.map((r, j) => (i === j ? { ...r, [key]: value } : r)),
    });
  }
  let verified = null,
    issue = "";
  if (draft)
    try {
      verified = reviewHoldings(draft, eligible, demoToken() ? 7 : 10);
    } catch (e) {
      issue = e.message;
    }
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportCsv(verified)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "reviewed-holdings.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const box = page?.lines[focus]?.box;
  return (
    <Paper component="section" className="research-card" sx={{ my: 2 }}>
      <h2>Import holdings</h2>
      <p>
        Choose a USD stock table with English headers such as Ticker, Quantity,
        Price or Market Value. Review one page at a time. The file is processed
        in this tab.
      </p>
      <p>
        <a href="/examples/holdings-sample.png" download>
          Download a fictional sample statement (PNG)
        </a>
      </p>
      <input
        ref={picker}
        type="file"
        aria-label="Holdings statement"
        accept=".png,.jpg,.jpeg,.pdf"
        onChange={(e) => {
          if (e.target.files[0]) read(e.target.files[0]);
        }}
      />
      {(file || busy) && <Button onClick={clear}>Discard file</Button>}
      {busy && <p role="status">Reading the page locally…</p>}
      {error && <Alert severity="error">{error}</Alert>}
      {draft && page && (
        <>
          <p>
            {page.method} · Page {page.pageNumber} of {page.pages}
          </p>
          {page.pages > 1 && (
            <label>
              Statement page{" "}
              <select
                value={page.pageNumber}
                onChange={(e) => read(file, Number(e.target.value))}
              >
                {Array.from({ length: page.pages }, (_, i) => (
                  <option key={i}>{i + 1}</option>
                ))}
              </select>
            </label>
          )}
          <div style={{ position: "relative", maxWidth: 800 }}>
            <img
              src={page.preview}
              alt="Original holdings page for verification"
              style={{ display: "block", width: "100%" }}
            />
            {box && (
              <div
                style={{
                  position: "absolute",
                  left: box[0] * 100 + "%",
                  top: box[1] * 100 + "%",
                  width: (box[2] - box[0]) * 100 + "%",
                  height: (box[3] - box[1]) * 100 + "%",
                  outline: "2px solid #078484",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
          {draft.manualLayout && (
            <Alert severity="info">
              This page needs manual column review. Select a source line below
              to add a holding. Enter the statement date, currency and the
              printed market-value subtotal for the same stock holdings. Pages
              with short positions cannot be simulated as a long-only portfolio.
            </Alert>
          )}
          <details key={page.pageNumber}>
            <summary>Recognized source text</summary>
            <ol style={{ paddingLeft: 32 }}>
              {page.lines.map((l, i) => (
                <li key={i} style={{ overflowWrap: "anywhere" }}>
                  {l.text}{" "}
                  <Button
                    size="small"
                    disabled={
                      draft.rows.length >= 50 ||
                      draft.rows.some((r) => r.line === i)
                    }
                    onClick={() => {
                      edit({
                        rows: [...draft.rows, { ...emptyRow(), line: i }],
                      });
                      setFocus(i);
                    }}
                    aria-label={"Add holding from line " + (i + 1)}
                  >
                    Use line {i + 1}
                  </Button>
                </li>
              ))}
            </ol>
          </details>
          <p>
            Check every stock row against the page. Exclude cash from the
            holdings subtotal. Blank market values are calculated from quantity
            × price.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              margin: "16px 0",
            }}
          >
            {Object.entries({
              date: "Statement date",
              currency: "Currency",
              total: "Source holdings subtotal (USD)",
            }).map(([key, label]) => (
              <TextField
                size="small"
                key={key}
                label={label}
                type={key === "date" ? "date" : "text"}
                InputLabelProps={{ shrink: true }}
                value={draft[key]}
                onChange={(e) => edit({ [key]: e.target.value })}
              />
            ))}
          </div>
          {draft.rows.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
              onFocus={() => setFocus(r.line)}
            >
              {Object.entries({
                ticker: "Ticker",
                qty: "Quantity",
                price: "Price (USD)",
                value: "Market value (USD)",
              }).map(([key, label]) => (
                <TextField
                  key={key}
                  size="small"
                  sx={{ width: 150 }}
                  label={label + " · " + (i + 1)}
                  value={r[key]}
                  onChange={(e) => editRow(i, key, e.target.value)}
                />
              ))}
              {r.line !== null && r.needsReview && (
                <small style={{ flexBasis: "100%" }}>
                  Source line {r.line + 1} · {page.lines[r.line]?.text}
                </small>
              )}
              {r.line !== null && (
                <Button onClick={() => setFocus(r.line)}>
                  {r.needsReview ? "Check source" : "Source"} · line{" "}
                  {r.line + 1}
                </Button>
              )}
              <Button
                onClick={() =>
                  edit({ rows: draft.rows.filter((_, j) => j !== i) })
                }
              >
                Remove row {i + 1}
              </Button>
            </div>
          ))}
          <Button
            disabled={draft.rows.length >= 50}
            onClick={() => edit({ rows: [...draft.rows, emptyRow()] })}
          >
            Add missing row
          </Button>
          {issue && <Alert severity="warning">{issue}</Alert>}
          {verified && (
            <p>
              {verified.tickers
                .map(
                  (t, i) =>
                    t + " " + (100 * verified.weights[i]).toFixed(2) + "%",
                )
                .join(" · ")}
            </p>
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={confirmed}
                disabled={!verified}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
            }
            label="I checked every holding, currency, date and subtotal against the source."
          />
          <div>
            <Button
              disabled={!confirmed || !verified}
              variant="contained"
              onClick={() => {
                onUse(verified);
                clear();
              }}
            >
              Use reviewed holdings
            </Button>
            <Button disabled={!confirmed || !verified} onClick={download}>
              Export reviewed CSV
            </Button>
          </div>
        </>
      )}
    </Paper>
  );
}
