import importlib.util
import json
import io
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch
from datetime import date, datetime
import numpy as np
import pandas as pd
from download_market_history import (NY, chart_frame, download_one, export_csv, last_friday,
    overlap_check, universe, archive_history, activate_csv, automatic_history_enabled, refresh_automatic_history, rebuild)
from market_data import load_market, monthly_panel


def sample_frame(index):
    values=100*np.exp(np.sin(np.arange(len(index))*.3)*.05+np.arange(len(index))*.0001)
    return pd.DataFrame({'open':values,'high':values*1.01,'low':values*.99,
        'close':values,'adj_close':values*.8,'volume':1000},index=index)


class DownloadHistoryTests(unittest.TestCase):
    def test_weekly_cutoff_is_a_completed_friday(self):
        self.assertEqual(last_friday(date(2026,10,29)),date(2026,10,23))
        self.assertEqual(last_friday(date(2026,10,30)),date(2026,10,23))
        self.assertEqual(last_friday(date(2026,10,31)),date(2026,10,30))

    def test_chart_requires_identity_daily_frequency_and_adjusted_prices(self):
        stamp=int(datetime(2026,10,23,9,30,tzinfo=NY).timestamp())
        value={'meta':dict(symbol='A',currency='USD',instrumentType='EQUITY',dataGranularity='1d'),
            'timestamp':[stamp], 'indicators':{'quote':[dict(open=[100],high=[101],low=[99],close=[100],volume=[1000])],
                'adjclose':[{'adjclose':[80]}]}}
        payload={'chart':{'result':[value]}}
        frame,_=chart_frame(payload,'A',date(2026,10,1),date(2026,10,23))
        self.assertEqual(frame.index[-1],pd.Timestamp('2026-10-23'));self.assertEqual(frame.adj_close.iloc[0],80)
        value['meta']['dataGranularity']='1mo'
        with self.assertRaisesRegex(ValueError,'frequency'):chart_frame(payload,'A',date(2026,10,1),date(2026,10,23))
        value['meta']['dataGranularity']='1d';value['meta']['currency']='EUR'
        with self.assertRaisesRegex(ValueError,'USD'):chart_frame(payload,'A',date(2026,10,1),date(2026,10,23))

    def test_recycled_ticker_is_rejected_before_any_request(self):
        with patch('download_market_history.request_json') as request:
            with self.assertRaisesRegex(ValueError,'recycled'):
                download_one('PARA',date(2010,1,1),date(2026,10,23),Path('/not-used'),pd.Series(dtype=float))
            request.assert_not_called()

    def test_impossible_intraday_range_is_quarantined_without_changing_close(self):
        stamp=int(datetime(2026,10,23,9,30,tzinfo=NY).timestamp())
        payload={'chart':{'result':[{'meta':dict(symbol='A',currency='USD',instrumentType='EQUITY',dataGranularity='1d'),
            'timestamp':[stamp],'indicators':{'quote':[dict(open=[100],high=[110],low=[105],close=[108],volume=[1000])],
                'adjclose':[{'adjclose':[90]}]}}]}}
        frame,_=chart_frame(payload,'A',date(2026,10,1),date(2026,10,23))
        self.assertEqual(frame.adj_close.iloc[0],90)
        self.assertTrue(frame[['open','high','low']].isna().all().all())
        self.assertEqual(frame.attrs['quarantined_ohlc_dates'],['2026-10-23'])

    def test_overlap_rejects_wrong_security_and_truncated_archive(self):
        frame=sample_frame(pd.bdate_range('2020-01-01',periods=100))
        legacy=frame.adj_close.copy()
        self.assertGreater(overlap_check(frame,legacy)['overlap_return_correlation'],.999)
        with self.assertRaisesRegex(ValueError,'latest known'):overlap_check(frame.iloc[:-1],legacy)
        wrong=frame.copy();wrong['adj_close']=100+np.arange(100)
        with self.assertRaisesRegex(ValueError,'different security'):overlap_check(wrong,legacy)

    def test_full_csv_preserves_nulls_and_scales_ohlc_consistently(self):
        index=pd.bdate_range('2020-01-01',periods=100);frame=sample_frame(index)
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'history.csv'
            export_csv({'A':frame,'B':frame.iloc[20:]},['A','B'],{'A':'Tech','B':'Health'},p)
            names,industries=universe(p);self.assertEqual(names,['A','B']);self.assertEqual(industries['B'],'Health')
            raw=pd.read_csv(p,low_memory=False)
            self.assertTrue(pd.isna(raw['Close.1'].iloc[3]))
            self.assertAlmostEqual(float(raw['Close'].iloc[3]),frame.adj_close.iloc[0])
            self.assertAlmostEqual(float(raw['High'].iloc[3]),frame.high.iloc[0]*.8)

    def test_loader_excludes_partial_month_and_checks_provenance(self):
        now=pd.Timestamp.now(tz='America/New_York').tz_localize(None).normalize()
        index=pd.bdate_range(now-pd.DateOffset(years=6),now-pd.Timedelta(days=1))
        frame=sample_frame(index)
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'history.csv';_,sha=export_csv({'A':frame},['A'],{'A':'Tech'},p)
            meta={'complete':True,'csv_sha256':sha,'currency':'USD','price_adjustment':'total_return',
                'provider':'Test only','requested_through':str(index[-1].date()),'inactive_or_stale_symbols':['A']}
            sidecar=Path(str(p)+'.metadata.json');sidecar.write_text(json.dumps(meta))
            prices,_=load_market(p)
            self.assertEqual(prices.index[-1],now.replace(day=1)-pd.Timedelta(days=1))
            self.assertEqual(prices.attrs['price_adjustment'],'total_return')
            with self.assertRaisesRegex(ValueError,'retired or stale'):monthly_panel(prices,['A'])
            meta['csv_sha256']='wrong';sidecar.write_text(json.dumps(meta))
            with self.assertRaisesRegex(ValueError,'checksum'):load_market(p)

    def test_friday_holiday_uses_actual_last_trade_and_rejects_a_stale_week(self):
        frame=sample_frame(pd.bdate_range('2020-01-01','2020-12-31'))
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);baseline=root/'baseline.csv';candidate=root/'candidate.csv'
            export_csv({'AAPL':frame,'B':frame.iloc[:-20]},['AAPL','B'],{'AAPL':'Tech','B':'Health'},baseline)
            def history(ticker,*args):
                return (frame if ticker=='AAPL' else frame.iloc[:-20]),{'provider':'Test only'}
            with patch('download_market_history.DATA',root/'data'),patch('download_market_history.download_one',side_effect=history):
                report=rebuild(baseline,candidate,date(2020,1,1),date(2021,1,1),progress=lambda _:None)
                self.assertEqual(report['source_as_of'],'2020-12-31')
                self.assertEqual(report['active_symbols'],1)
                self.assertEqual(report['inactive_or_stale_symbols'],['B'])
                stale=root/'stale.csv'
                with self.assertRaisesRegex(ValueError,'unresolved'):
                    rebuild(baseline,stale,date(2020,1,1),date(2021,1,8),progress=lambda _:None)
                self.assertFalse(stale.exists())

    def test_activation_failure_restores_csv_and_metadata(self):
        now=pd.Timestamp.now(tz=NY).tz_localize(None).normalize()
        cutoff=now.replace(day=1)-pd.Timedelta(days=1)
        prices=pd.DataFrame({'A':[100]},index=[cutoff])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);baseline=root/'active.csv';baseline.write_text('old CSV')
            original_meta=Path(str(baseline)+'.metadata.json');original_meta.write_text('old metadata')
            candidate=root/'new.csv';candidate.write_text('new CSV')
            Path(str(candidate)+'.metadata.json').write_text(json.dumps({'csv_sha256':'fixture','requested_through':str(cutoff.date())}))
            with patch('download_market_history.DATA',root/'data'),patch('market_data.load_market',return_value=(prices,{})),patch('market_data.catalog',return_value=[{'eligible':True}]),patch('download_market_history.universe',return_value=(['A'],{})),patch('download_market_history.subprocess.run',side_effect=[subprocess.CalledProcessError(1,['pm2']),None]):
                with self.assertRaises(subprocess.CalledProcessError):activate_csv(candidate,baseline)
            self.assertEqual(baseline.read_text(),'old CSV');self.assertEqual(original_meta.read_text(),'old metadata')

    def test_activation_preserves_original_and_records_the_matching_version(self):
        now=pd.Timestamp.now(tz=NY).tz_localize(None).normalize();cutoff=now.replace(day=1)-pd.Timedelta(days=1)
        prices=pd.DataFrame({'A':[100]},index=[cutoff])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);baseline=root/'active.csv';baseline.write_text('original')
            candidate=root/'new.csv';candidate.write_text('new CSV')
            Path(str(candidate)+'.metadata.json').write_text(json.dumps({'csv_sha256':'fixture','requested_through':str(cutoff.date())}))
            with patch('download_market_history.DATA',root/'data'),patch('market_data.load_market',return_value=(prices,{})),patch('market_data.catalog',return_value=[{'eligible':True}]),patch('download_market_history.universe',return_value=(['A'],{})):
                result=activate_csv(candidate,baseline,restart=False)
            self.assertEqual(baseline.read_text(),'new CSV')
            self.assertEqual((Path(result['backup'])/'active.csv').read_text(),'original')
            self.assertEqual(json.loads((root/'data/update-status.json').read_text())['dataset_id'],'fixture')

    def test_weekly_opt_in_does_not_read_legacy_source_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);sidecar=Path(str(root/'stock_data_with_sector.csv')+'.metadata.json')
            sidecar.write_text(json.dumps({'complete':True,'automatic_weekly_refresh':True}))
            (root/'source.json').write_text('not parsed by the replacement downloader')
            with patch('download_market_history.HERE',root):self.assertTrue(automatic_history_enabled(root))

    def test_current_week_skips_download_and_month_boundary_reloads_worker(self):
        now=pd.Timestamp.now(tz=NY).tz_localize(None).normalize();cutoff=now.replace(day=1)-pd.Timedelta(days=1)
        prices=pd.DataFrame({'A':[100]},index=[cutoff])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);data=root/'data';data.mkdir();baseline=root/'stock_data_with_sector.csv';baseline.write_text('unchanged')
            metadata={'requested_through':str(last_friday()),'requested_start':'2010-01-01','csv_sha256':'fixture'}
            Path(str(baseline)+'.metadata.json').write_text(json.dumps(metadata))
            response=lambda:io.BytesIO(json.dumps({'as_of':str((cutoff-pd.offsets.MonthEnd()).date()),'dataset':{'dataset_id':'fixture'}}).encode())
            with patch('download_market_history.HERE',root),patch('download_market_history.DATA',data),patch('market_data.load_market',return_value=(prices,{})),patch('download_market_history.rebuild') as build,patch('download_market_history.urlopen',side_effect=lambda *a,**k:response()),patch('download_market_history.activate_csv') as activate:
                self.assertEqual(refresh_automatic_history(True),'current');build.assert_not_called()
                activate.assert_called_once_with(baseline,baseline,restart=True,weekly=True)

    def test_failed_weekly_download_keeps_active_csv(self):
        now=pd.Timestamp.now(tz=NY).tz_localize(None).normalize();cutoff=now.replace(day=1)-pd.Timedelta(days=1)
        prices=pd.DataFrame({'A':[100]},index=[cutoff])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);data=root/'data';data.mkdir();baseline=root/'stock_data_with_sector.csv';baseline.write_text('retained')
            from datetime import timedelta
            metadata={'requested_through':str(last_friday()-timedelta(days=7)),'requested_start':'2010-01-01','csv_sha256':'fixture'}
            Path(str(baseline)+'.metadata.json').write_text(json.dumps(metadata))
            with patch('download_market_history.HERE',root),patch('download_market_history.DATA',data),patch('market_data.load_market',return_value=(prices,{})),patch('download_market_history.rebuild',side_effect=ValueError('missing security')),patch('download_market_history.activate_csv') as activate:
                with self.assertRaises(ValueError):refresh_automatic_history(True)
                activate.assert_not_called()
            self.assertEqual(baseline.read_text(),'retained')
            self.assertEqual(json.loads((data/'update-status.json').read_text())['state'],'failed')

    @unittest.skipUnless(importlib.util.find_spec('duckdb'),'Optional archive dependency not installed')
    def test_paramount_archive_never_splices_in_post_merger_prices(self):
        import duckdb
        frame=sample_frame(pd.bdate_range('2025-01-01','2025-08-20'))
        frame.loc[frame.index[1],'low']=frame.high.iloc[1]*2
        frame=frame.reset_index(names='date');frame['ticker']='PSKY';frame['source']='yahoo'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'fixture.parquet'
            with duckdb.connect() as con:
                con.register('fixture',frame);con.execute('COPY fixture TO ? (FORMAT PARQUET)',[str(p)])
            legacy=frame.set_index('date').adj_close.loc[:'2025-02-28']
            result,details=archive_history(p,'PARA',date(2025,1,1),date(2025,8,20),legacy)
            self.assertEqual(result.index[-1],pd.Timestamp('2025-08-06'))
            self.assertEqual(details['source_symbol'],'PSKY')
            self.assertTrue(result[['open','high','low']].iloc[1].isna().all())
            self.assertEqual(details['quarantined_ohlc_dates'],['2025-01-02'])
