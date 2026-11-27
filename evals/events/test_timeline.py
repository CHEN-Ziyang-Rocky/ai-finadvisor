import json
import unittest
from pathlib import Path

from timeline import visible_filings

HERE = Path(__file__).resolve().parent
CASE = json.loads((HERE/"nvda-case.json").read_text())
SNAPSHOT = json.loads((HERE.parents[1]/"docs/evals/phase5-seven-issuer-filings.json").read_text())


def at(timestamp, clock):
    return [event["state"] for event, _ in visible_filings(SNAPSHOT, CASE, timestamp, clock)]


class TimelineTests(unittest.TestCase):
    def test_first_disclosure_boundary(self):
        self.assertEqual(at("2026-11-12T13:52:40Z","sec"), [])
        self.assertEqual(at("2026-11-12T08:52:41-05:00","sec"), ["interim_ceo"])

    def test_reinstatement_changes_state_at_acceptance(self):
        self.assertEqual(at("2026-11-23T13:57:53Z","sec"), ["interim_ceo"])
        self.assertEqual(at("2026-11-23T13:57:54Z","sec"), ["interim_ceo","ceo_reinstated"])

    def test_historical_backfill_was_not_a_live_alert(self):
        self.assertEqual(at("2026-11-23T14:00:00Z","observed"), [])
        self.assertEqual(at("2026-11-26T13:44:57Z","observed"), [])
        self.assertEqual(at("2026-11-26T13:44:58Z","observed"), ["interim_ceo","ceo_reinstated"])

    def test_cutoffs_outside_evidence(self):
        for timestamp, clock in [("2026-11-23T12:00:00","sec"), ("2026-11-01T01:00:00Z","other"),
                                 ("2026-10-31T15:00:00Z","sec"), ("2026-11-26T10:00:00Z","sec"),
                                 ("2026-11-27T14:00:00Z","observed")]:
            with self.subTest(timestamp=timestamp,clock=clock), self.assertRaises(ValueError):
                at(timestamp, clock)
