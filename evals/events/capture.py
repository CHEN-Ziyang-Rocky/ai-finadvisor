"""On-demand Magnificent Seven EDGAR capture. Only public filing metadata is stored."""
import argparse
import json
import re
import sqlite3
import sys
import time
from datetime import date, datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import quote
from urllib.request import Request, urlopen

ISSUERS = {"AAPL":320193,"MSFT":789019,"AMZN":1018724,"GOOGL":1652044,
           "META":1326801,"NVDA":1045810,"TSLA":1318605}
FORMS = {"8-K","10-Q","10-K"}
ITEMS = {"5.02":"officers, directors or compensation","2.02":"results of operations",
         "1.05":"material cybersecurity incidents","1.01":"material agreements",
         "2.05":"exit or disposal costs","8.01":"other events"}
COLUMNS = ("form","accessionNumber","acceptanceDateTime","reportDate","items","primaryDocument")


def utc(value):
    moment = datetime.fromisoformat(value.replace("Z","+00:00"))
    if moment.tzinfo is None:
        raise ValueError("SEC acceptance time missing timezone")
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


def records(data, ticker, start, end):
    cik = ISSUERS[ticker]
    if int(data["cik"]) != cik or ticker not in data["tickers"]:
        raise ValueError("Unexpected issuer")
    recent = data["filings"]["recent"]
    if len({len(recent[k]) for k in COLUMNS}) != 1:
        raise ValueError("Misaligned SEC columns")
    times = [utc(t) for t in recent["acceptanceDateTime"]]
    if not times or min(times)[:10] > start:
        raise ValueError("Selected period extends beyond the recent filings index")
    emitted = set()
    for form, accession, timestamp, period, items, document in zip(*(recent[k] for k in COLUMNS),strict=True):
        accepted = utc(timestamp)
        if form.removesuffix("/A") not in FORMS or not start <= accepted[:10] <= end:
            continue
        if not re.fullmatch(r"[0-9]{10}-[0-9]{2}-[0-9]{6}",accession):
            raise ValueError("Invalid accession number")
        if not document or PurePosixPath(document).name != document or document in {".",".."}:
            raise ValueError("Invalid primary document")
        if accession in emitted:
            continue
        emitted.add(accession)
        tags = [ITEMS[i] for i in re.findall(r"\b\d\.\d{2}\b",items) if i in ITEMS]
        yield {"ticker":ticker,"accession":accession,"form":form,"report_date":period,
               "accepted_utc":accepted,"item_codes":items,"categories":tags,
               "source":f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-','')}/{quote(document,safe='')}"}


def capture(args):
    issuers = {}
    results = []
    with sqlite3.connect(args.database) as db:
        db.execute("CREATE TABLE IF NOT EXISTS sightings (ticker TEXT, accession TEXT, first_seen TEXT NOT NULL, PRIMARY KEY (ticker, accession))")
        for ticker,cik in ISSUERS.items():
            url = f"https://data.sec.gov/submissions/CIK{cik:010d}.json"
            try:
                request = Request(url,headers={"User-Agent":"Rocky Finance research (https://finance.imrocky.com)"})
                with urlopen(request,timeout=15) as response:
                    data = json.load(response)
                seen = datetime.now(timezone.utc).isoformat(timespec="seconds")
                rows = list(records(data,ticker,args.start,args.end))
                for row in rows:
                    key = (ticker,row["accession"])
                    db.execute("INSERT OR IGNORE INTO sightings VALUES (?,?,?)",(*key,seen))
                    row["first_seen_utc"] = db.execute("SELECT first_seen FROM sightings WHERE ticker=? AND accession=?",key).fetchone()[0]
                db.commit()
                issuers[ticker] = {"source":url,"checked_utc":seen,"count":len(rows),"status":"ok"}
                results.extend(rows)
            except (OSError,ValueError,KeyError,TypeError) as error:
                db.rollback()
                issuers[ticker] = {"source":url,"status":"unavailable","reason":type(error).__name__}
            time.sleep(.25)
    complete = all(row["status"]=="ok" for row in issuers.values())
    return {"from_utc":args.start,"through_utc":args.end,"complete":complete,"issuers":issuers,
            "filings":sorted(results,key=lambda r:(r["accepted_utc"],r["accession"]),reverse=True)}


if __name__=="__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start",required=True)
    parser.add_argument("--end",required=True)
    parser.add_argument("--database",required=True,help="Local SQLite path for persistent first sightings")
    args = parser.parse_args()
    if date.fromisoformat(args.start)>date.fromisoformat(args.end) or date.fromisoformat(args.end)>datetime.now(timezone.utc).date():
        parser.error("Use a historical UTC date range up to today")
    report = capture(args)
    json.dump(report,sys.stdout,ensure_ascii=False,indent=2)
    print()
    sys.exit(0 if report["complete"] else 1)
