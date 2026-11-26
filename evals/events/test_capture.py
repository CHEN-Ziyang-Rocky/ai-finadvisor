import unittest

from capture import records


class FilingTests(unittest.TestCase):
    def fixture(self):
        columns = {
            "form":["4","8-K","8-K","8-K/A"],"accessionNumber":["old","0001045810-26-000082","0001045810-26-000082","0001045810-26-000090"],
            "acceptanceDateTime":["2026-10-01T01:00:00Z","2026-11-12T13:52:41Z","2026-11-12T13:52:41Z","2026-11-23T08:57:54-05:00"],
            "reportDate":["2026-09-30","2026-11-11","2026-11-11","2026-11-22"],
            "items":["","5.02","5.02","5.02"],"primaryDocument":["x.htm","a.htm","a.htm","b.htm"]}
        return {"cik":1045810,"tickers":["NVDA"],"filings":{"recent":columns}}

    def read(self,data,end="2026-11-25"):
        return list(records(data,"NVDA","2026-11-01",end))

    def test_filters_on_public_filing_time_not_report_date(self):
        self.assertEqual(self.read(self.fixture(),"2026-11-11"),[])

    def test_deduplicates_accessions_and_retains_amendment(self):
        rows = self.read(self.fixture())
        self.assertEqual([r["form"] for r in rows],["8-K","8-K/A"])
        self.assertEqual(rows[1]["accepted_utc"],"2026-11-23T13:57:54+00:00")

    def test_unusable_sources_are_not_empty_success(self):
        for key in ("items","primaryDocument"):
            data = self.fixture()
            data["filings"]["recent"][key].pop()
            with self.assertRaises(ValueError):
                self.read(data)
        data = self.fixture()
        data["cik"]=1
        with self.assertRaises(ValueError):
            self.read(data)


if __name__=="__main__":
    unittest.main()
