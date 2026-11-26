"""Generate labeled, fictitious one-page statements. Requires Pillow and ReportLab."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
parser.add_argument("--font", default="Arial.ttf")
args = parser.parse_args()
args.directory.mkdir(parents=True, exist_ok=True)
cases = []
formats = ["text-pdf", "png", "jpeg", "scan-pdf"]
variants = ["standard", "value-only", "reordered", "soft-focus", "duplicate",
            "wrong-total", "missing-price", "foreign-currency", "fractional"]
for index, kind in enumerate(formats):
    for n, variant in enumerate(variants):
        columns = ["ticker", "qty", "price", "value"]
        if variant == "value-only":
            columns = ["ticker", "value"]
        if variant == "reordered":
            columns = ["ticker", "value", "qty", "price"]
        if variant == "missing-price":
            columns = ["ticker", "qty", "price"]
        headings = {"ticker": "Ticker", "qty": "Shares", "price": "Price", "value": "Market Value"}
        currency = "EUR" if variant == "foreign-currency" else "USD"
        matrix = [[f"Holdings   2025-03-31   {currency}"], [headings[c] for c in columns]]
        rows = []
        total = 0
        for j, ticker in enumerate(["AAPL", "MSFT"]):
            qty = 8 + n + index + j + (0.25 if variant == "fractional" else 0)
            price = 104 + j * 22 + n * 0.25
            value = qty * price
            total += value
            row = {"ticker": "AAPL" if variant == "duplicate" else ticker,
                   "qty": str(qty), "price": f"{price:.2f}", "value": f"{value:.2f}"}
            if variant == "missing-price" and j == 1:
                row["price"] = ""
            matrix.append([row[c] for c in columns])
            rows.append({c: row[c] for c in columns})
        stated = total + (5 if variant == "wrong-total" else 0)
        matrix.append(["Total", f"{stated:.2f}"])
        name = f"{kind}-{variant}." + ("pdf" if "pdf" in kind else kind)
        path = args.directory / name
        coords = [44, 350, 630, 880]
        if kind == "text-pdf":
            doc = canvas.Canvas(str(path), pagesize=(625, 180))
            doc.setFont("Helvetica", 13)
            for i, line in enumerate(matrix):
                for x, field in zip(coords, line):
                    doc.drawString(x / 2, 154 - i * 29, field)
            doc.save()
        else:
            image = Image.new("RGB", (1240, 360), "white")
            draw = ImageDraw.Draw(image)
            font = ImageFont.truetype(args.font, 29 if n % 2 else 32)
            for i, line in enumerate(matrix):
                for x, field in zip(coords, line):
                    draw.text((x, 22 + i * 62), field, fill="#202020", font=font)
            if variant == "soft-focus":
                image = image.filter(ImageFilter.GaussianBlur(1.8))
            if kind == "scan-pdf":
                doc = canvas.Canvas(str(path), pagesize=(620, 180))
                doc.drawImage(ImageReader(image), 0, 0, width=620, height=180)
                doc.save()
            else:
                image.save(path)
        cases.append(dict(file=name, rows=rows, date="2025-03-31", currency=currency,
                          total=stated, lines=[" ".join(row).strip() for row in matrix],
                          valid=variant not in {"duplicate", "wrong-total", "missing-price", "foreign-currency"}))
(args.directory / "gold.json").write_text(json.dumps(cases, indent=2))
