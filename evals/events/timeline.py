"""Reconstruct which source filings from a captured case qualify at a cutoff."""
from datetime import datetime, timezone


def instant(value):
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("Use a timestamp with an explicit UTC offset")
    return stamp.astimezone(timezone.utc)


def visible_filings(snapshot, case, as_of=None, clock="observed"):
    if not snapshot["complete"]:
        raise ValueError("Incomplete seven-issuer capture")
    if clock not in {"observed", "sec"}:
        raise ValueError("Select either observed or sec time")
    cutoff = instant(as_of) if as_of is not None else None
    issuer = case["issuer"]
    if cutoff:
        end = snapshot["through_utc"]
        if cutoff.date().isoformat() < snapshot["from_utc"]:
            raise ValueError("Cutoff predates the captured window")
        if cutoff > instant(snapshot["issuers"][issuer]["checked_utc"]):
            raise ValueError("Cutoff is later than this issuer's capture")
        if clock == "sec" and cutoff.date().isoformat() > end:
            raise ValueError("SEC cutoff is beyond the captured filing window")
    filings = {row["accession"]:row for row in snapshot["filings"] if row["ticker"] == issuer}
    visible = []
    for event in case["inputs"]:
        entry = filings[event["accession"]]
        accepted = instant(entry["accepted_utc"])
        seen = instant(entry["first_seen_utc"])
        if seen < accepted or accepted.date().isoformat() != event["public_date"]:
            raise ValueError("Inconsistent event timing")
        available = seen if clock == "observed" else accepted
        if cutoff is None or available <= cutoff:
            visible.append((event, entry))
    # A delayed backfill of an older disclosure must not supersede the newer one.
    return sorted(visible, key=lambda pair: (instant(pair[1]["accepted_utc"]),pair[1]["accession"]))
