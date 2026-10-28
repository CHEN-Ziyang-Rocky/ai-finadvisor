"""Rebuild the project's full daily CSV without an API key. Never forward-fill prices.

Yahoo supplies active histories. A checksum-pinned public Parquet archive recovers
retired securities; its provenance is recorded, never presented as Yahoo data.
Activation is explicit, backed up and limited to the Finance Python service.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import fcntl
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import shutil
import subprocess
import threading
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'data' / 'market'
NY = ZoneInfo('America/New_York')
FIELDS = ('Close', 'High', 'Low', 'Open', 'Volume')
# Same legal issuer, supported by exchange / issuer notices. Preserve original CSV IDs.
ALIASES = {'FI': 'FISV', 'MMC': 'MRSH', 'BK':'BNY', 'EQR':'VMRK'}
ALIAS_SOURCES = {
    'FI': 'https://nasdaqtrader.com/TraderNews.aspx?id=DTN2025-32',
    'MMC': 'https://www.marsh.com/en/corp/about/news/marsh-mclennan-to-change-nyse-symbol-to-mrsh.html',
    'BK': 'https://www.bny.com/corporate/global/en/about-us/newsroom/press-release/bny-announces-planned-change-of-stock-ticker-symbol-to-bny-130465.html',
    'EQR': 'https://investors.equityapartments.com/news-events/press-releases-news/news-details/2026/Equity-Residential-and-AvalonBay-Announce-Vivmark-Residential-as-Name-of-Combined-Company/default.aspx',
}
# PARA now identifies a different issuer. A merger is not a rename into the acquirer.
ARCHIVE_ONLY = {'PARA','DHR'}
ARCHIVE_NOTES = {
    'PARA':'Known recycled ticker; recover the original issuer only',
    'DHR':'Yahoo adjusted-close discontinuity at the 2016 Fortive distribution; use the archive corporate-action series',
}
ARCHIVE_IDENTITIES = {
    # Archive uses PSKY for the predecessor history too. Only the original security's
    # own trading period may enter PARA; post-merger PSKY observations are excluded.
    'PARA': {'symbol':'PSKY','last_trade':'2025-08-06',
             'notice':'https://classic.nasdaqtrader.com/TraderNews.aspx?id=ECA2025-414'},
}
ARCHIVE_API = 'https://api.github.com/repos/Johnbrick123/sp500-data/releases/tags/data'
_RATE_LOCK = threading.Lock()
_LAST_REQUEST = 0.


def last_friday(today=None):
    today = today or datetime.now(NY).date()
    return today-timedelta(days=(today.weekday()-4) % 7 or 7)


def atomic_json(path, data):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as f:
        json.dump(data, f, sort_keys=True, allow_nan=False); temporary = Path(f.name)
    os.replace(temporary, path)


def universe(path):
    with Path(path).open(newline='', encoding='utf-8-sig') as f:
        rows = [next(csv.reader(f)) for _ in range(4)]
    header, industry, tickers, _ = rows
    columns = [i for i, value in enumerate(header) if value == 'Close' or value.startswith('Close.')]
    names = [tickers[i] for i in columns]
    if not names or len(names) != len(set(names)):
        raise ValueError('Legacy CSV must have distinct Close tickers')
    return names, {tickers[i]: industry[i] for i in columns}


def request_json(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 FinadvisorResearch/1.0'}), timeout=35) as r:
        data = r.read(20_000_001)
    if len(data) > 20_000_000:
        raise ValueError('Provider response exceeds the per-symbol size limit')
    return json.loads(data)


def chart_frame(payload, symbol, start, through):
    result = payload.get('chart', {}).get('result')
    if not result or len(result) != 1:
        raise ValueError('No chart history')
    value = result[0]; meta = value['meta']
    if meta.get('currency') != 'USD' or meta.get('instrumentType') != 'EQUITY':
        raise ValueError('Expected a USD equity')
    if meta.get('symbol') != symbol or meta.get('dataGranularity') != '1d':
        raise ValueError('Ticker identity or daily frequency mismatch')
    stamps = value.get('timestamp', [])
    prices = value['indicators']['quote'][0]
    adjusted = value['indicators']['adjclose'][0]['adjclose']
    if not stamps or len(adjusted) != len(stamps):
        raise ValueError('Missing dividend-adjusted close')
    index = pd.to_datetime(stamps, unit='s', utc=True).tz_convert(NY).tz_localize(None).normalize()
    frame = pd.DataFrame({key: prices[key] for key in ('open','high','low','close','volume')}, index=index)
    frame['adj_close'] = adjusted
    frame = frame.loc[str(start):str(through)]
    if frame.empty or frame.index.duplicated().any() or (frame.index.dayofweek >= 5).any():
        raise ValueError('Empty, duplicate or weekend observations')
    # Null bars represent no observation; remove them, never fill them with yesterday's price.
    frame = frame.dropna(subset=['close','adj_close'])
    numeric = frame[['open','high','low','close','adj_close']]
    if frame.empty or not np.isfinite(numeric).all().all() or (numeric <= 0).any().any():
        raise ValueError('Invalid OHLC / adjusted prices')
    bad_ohlc=(frame['high']+1e-7 < frame[['open','low','close']].max(axis=1)) | (frame['low']-1e-7 > frame[['open','high','close']].min(axis=1))
    # A provider can publish an impossible intraday range. Keep its valid adjusted
    # close, but quarantine ALL auxiliary O/H/L cells rather than inventing a repair.
    frame.attrs['quarantined_ohlc_dates']=[str(d.date()) for d in frame.index[bad_ohlc]]
    frame.loc[bad_ohlc,['open','high','low']]=np.nan
    if not np.isfinite(frame.volume).all() or (frame.volume < 0).any():
        raise ValueError('Invalid volume')
    return frame.sort_index(), meta


def overlap_check(fresh, legacy):
    if legacy.dropna().empty or fresh.index[-1] < legacy.dropna().index[-1]:
        raise ValueError('Downloaded history would discard the latest known baseline observations')
    overlap = pd.concat([fresh['adj_close'], legacy], axis=1, join='inner').dropna()
    if len(overlap) < min(60, max(2, int(legacy.notna().sum()*.5))):
        raise ValueError('Insufficient overlap to verify issuer identity against the original CSV')
    returns = overlap.pct_change(fill_method=None).dropna()
    # Recent overlap verifies the continuing issuer without letting one known,
    # corrected old corporate-action error dominate the entire identity check.
    returns = returns.tail(756)
    correlation = float(returns.corr().iloc[0,1])
    if not np.isfinite(correlation) or correlation < .95:
        raise ValueError('Return overlap suggests a recycled ticker or a different security')
    return {'overlap_days': len(overlap), 'overlap_return_observations':len(returns), 'overlap_return_correlation': correlation}


def download_one(ticker, start, through, cache, legacy):
    global _LAST_REQUEST
    if ticker in ARCHIVE_ONLY:
        raise ValueError(ARCHIVE_NOTES[ticker])
    symbol = ALIASES.get(ticker, ticker)
    query = {'period1': int(datetime.combine(start, datetime.min.time(), NY).timestamp()),
             'period2': int(datetime.combine(through+timedelta(days=1), datetime.min.time(), NY).timestamp()),
             'interval': '1d', 'events': 'div,splits'}
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/'+quote(symbol, safe='')+'?'+urlencode(query)
    name = hashlib.sha256(url.encode()).hexdigest()+'.json'
    path = cache/name
    payload = None
    if path.exists() and time.time()-path.stat().st_mtime < 86400:
        try: payload = json.loads(path.read_text())
        except (OSError, ValueError): pass
    if payload is None:
        for attempt in range(3):
            try:
                with _RATE_LOCK:
                    time.sleep(max(0., .25-(time.monotonic()-_LAST_REQUEST)))
                    _LAST_REQUEST = time.monotonic()
                payload = request_json(url)
                break
            except HTTPError as error:
                if error.code in (401,403,404): raise
                if attempt == 2: raise
                time.sleep(min(60, max(2**attempt, int(error.headers.get('Retry-After', '0')))))
            except (OSError, ValueError):
                if attempt == 2: raise
                time.sleep(2**attempt)
    frame, meta = chart_frame(payload, symbol, start, through)
    details = overlap_check(frame, legacy.loc[:str(through)])
    atomic_json(path, payload)
    return frame, {'provider':'Yahoo Finance chart','source_symbol':symbol,
                   'issuer':meta.get('longName') or meta.get('shortName'), **details,
                   'quarantined_ohlc_dates':frame.attrs.get('quarantined_ohlc_dates',[]),
                   **({'alias_notice':ALIAS_SOURCES[ticker]} if ticker in ALIASES else {})}


def download_archive(directory):
    directory.mkdir(parents=True, exist_ok=True)
    release = request_json(ARCHIVE_API)
    asset = next(a for a in release['assets'] if a['name']=='prices.parquet')
    digest = asset.get('digest', '')
    if not digest.startswith('sha256:'):
        raise ValueError('Archive must have a GitHub-provided SHA-256 digest')
    target = directory/'prices.parquet'
    valid = target.exists() and target.stat().st_size==asset['size'] and hashlib.sha256(target.read_bytes()).hexdigest()==digest[7:]
    if not valid:
        part = directory/'prices.parquet.part'; hashed=hashlib.sha256(); count=0
        with urlopen(Request(asset['browser_download_url'], headers={'User-Agent':'FinadvisorResearch/1.0'}),timeout=60) as response, part.open('wb') as out:
            while True:
                block=response.read(1024*1024)
                if not block: break
                out.write(block); hashed.update(block); count+=len(block)
        if count!=asset['size'] or hashed.hexdigest()!=digest[7:]:
            part.unlink(missing_ok=True); raise ValueError('Archive size / checksum mismatch')
        os.replace(part,target)
    meta = {'repository':'Johnbrick123/sp500-data','release_tag':release['tag_name'],
            'asset_id':asset['id'],'updated_at':asset['updated_at'],'sha256':digest[7:],
            'url':asset['browser_download_url'],'use':'Fallback history only; not an independent exchange feed'}
    atomic_json(directory/'archive-provenance.json',meta)
    return target, meta


def archive_history(path, ticker, start, through, legacy):
    import duckdb
    identity=ARCHIVE_IDENTITIES.get(ticker,{})
    source_symbol=identity.get('symbol',ALIASES.get(ticker,ticker))
    through=min(through,date.fromisoformat(identity['last_trade'])) if identity.get('last_trade') else through
    with duckdb.connect() as connection:
        names = connection.execute('SELECT DISTINCT ticker FROM read_parquet(?) WHERE ticker = ? OR starts_with(ticker, ?)',[str(path),source_symbol,source_symbol+'-']).fetchall()
        candidates=[]
        for (name,) in names:
            raw=connection.execute('SELECT date,open,high,low,close,volume,adj_close,source FROM read_parquet(?) WHERE ticker = ? AND date BETWEEN ? AND ? ORDER BY date',[str(path),name,str(start),str(through)]).fetchdf()
            if raw.empty: continue
            raw.index=pd.to_datetime(raw.pop('date'))
            try: check=overlap_check(raw,legacy.loc[:str(through)])
            except ValueError: continue
            candidates.append((check['overlap_days'],raw,check,name))
    if not candidates:
        raise ValueError('No archive security matches the original return history')
    _,frame,check,name=max(candidates,key=lambda x:x[0])
    if frame.index.duplicated().any() or not np.isfinite(frame.adj_close).all() or (frame.adj_close<=0).any():
        raise ValueError('Invalid archive adjusted closes')
    # Archive carried patches are not actual trades and must remain missing.
    carried=frame.source.str.contains('carried',case=False,na=False)
    frame=frame.loc[~carried]
    if frame.empty or (frame.index.dayofweek >= 5).any():
        raise ValueError('Empty or non-daily archive history')
    if (not np.isfinite(frame[['open','high','low','close','volume']]).all().all()
            or (frame[['open','high','low','close']]<=0).any().any() or (frame.volume<0).any()):
        raise ValueError('Invalid archive OHLC / volume')
    bad_ohlc=(frame['high']+1e-7 < frame[['open','low','close']].max(axis=1)) | (frame['low']-1e-7 > frame[['open','high','close']].min(axis=1))
    quarantined=[str(d.date()) for d in frame.index[bad_ohlc]]
    frame.loc[bad_ohlc,['open','high','low']]=np.nan
    sources=sorted(frame.pop('source').dropna().unique().tolist())
    return frame, {'provider':'Public S&P 500 archive','source_symbol':name,'upstream_sources':sources,
                   'excluded_carried_rows':int(carried.sum()),'quarantined_ohlc_dates':quarantined,**check,
                   **({'corporate_action_notice':'https://investors.danaher.com/2016-07-02-Danaher-Corporation-Completes-Separation-of-Fortive-Corporation'} if ticker=='DHR' else {}),
                   **({'identity_notice':identity['notice'],'original_security_last_trade':identity['last_trade']} if identity else {})}


def export_csv(frames, tickers, industries, destination):
    # Match the existing five-field multi-header format; prices are dividend+split adjusted.
    index=pd.DatetimeIndex(sorted(set().union(*(set(frame.index) for frame in frames.values()))))
    blocks=[]
    for field in FIELDS:
        values=[]
        for ticker in tickers:
            frame=frames[ticker]
            series=frame['volume'] if field=='Volume' else (frame['adj_close'] if field=='Close' else frame[field.lower()]*(frame['adj_close']/frame['close']))
            values.append(series.reindex(index).to_numpy())
        blocks.append(np.column_stack(values))
    matrix=np.concatenate(blocks,axis=1)
    destination=Path(destination); destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',dir=destination.parent,newline='',delete=False) as f:
        temporary=Path(f.name); writer=csv.writer(f)
        writer.writerow(['Price']+[field for field in FIELDS for _ in tickers])
        writer.writerow(['Industry']+[industries[t] for _ in FIELDS for t in tickers])
        writer.writerow(['Ticker']+tickers*len(FIELDS)); writer.writerow(['Date']+['']*(len(tickers)*len(FIELDS)))
        for when,row in zip(index,matrix):
            writer.writerow([when.date().isoformat()]+[format(value,'.12g') if np.isfinite(value) else '' for value in row])
        f.flush();os.fsync(f.fileno())
    os.replace(temporary,destination)
    return len(index), hashlib.sha256(destination.read_bytes()).hexdigest()


def rebuild(baseline, destination, start, through, workers=3, progress=print):
    tickers,industries=universe(baseline)
    raw=pd.read_csv(baseline,usecols=lambda c:c=='Price' or c.startswith('Close'),low_memory=False)
    old=raw.iloc[3:,1:].apply(pd.to_numeric,errors='coerce');old.columns=tickers
    old.index=pd.to_datetime(raw.iloc[3:,0],errors='coerce');old=old.loc[old.index.notna()]
    cache=DATA/'downloads'/'yahoo';cache.mkdir(parents=True,exist_ok=True)
    frames,details,errors={},{},{}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures={pool.submit(download_one,t,start,through,cache,old[t]):t for t in tickers}
        for i,future in enumerate(as_completed(futures),1):
            ticker=futures[future]
            try: frames[ticker],details[ticker]=future.result()
            except Exception as error: errors[ticker]=type(error).__name__+(': '+str(error) if isinstance(error,ValueError) else '')
            if i%25==0 or i==len(tickers):progress(f'Yahoo checked {i}/{len(tickers)}; accepted {len(frames)}, archive candidates {len(errors)}')
    archive_meta=None
    if errors:
        archive,archive_meta=download_archive(DATA/'downloads')
        for ticker in list(errors):
            try:
                frames[ticker],details[ticker]=archive_history(archive,ticker,start,through,old[ticker])
                details[ticker]['fallback_reason']=errors.pop(ticker)
                progress(f'Archive recovered {ticker} as {details[ticker]["source_symbol"]}')
            except Exception as error:errors[ticker]+='; archive: '+type(error).__name__+(': '+str(error) if isinstance(error,ValueError) else '')
    # A Friday exchange holiday has no quote. Compare coverage with the reference
    # stock's last actual trading day, while refusing an archive a week out of date.
    reference=frames.get('AAPL',next(iter(frames.values()),None))
    source_as_of=reference.index[-1].date() if reference is not None else through
    if not errors and not through-timedelta(days=4)<=source_as_of<=through:
        errors['_market_cutoff']='Reference history does not reach the requested week'
    report={'schema_version':1,'downloaded_at':datetime.now(timezone.utc).isoformat(),
            'requested_start':str(start),'requested_through':str(through),'requested_symbols':len(tickers),
            'source_as_of':str(source_as_of),
            'complete':not errors,'errors':errors,'archive':archive_meta,'symbols':{},
            'price_adjustment':'total_return','currency':'USD','source_frequency':'daily',
            'provider':'Yahoo Finance + explicitly identified public archive recoveries',
            'limitations':['Personal research download; no market-data redistribution license is granted.',
                'Current fixed 2025 universe has survivorship / selection bias; not point-in-time membership.',
                'Adjusted prices are restated as of retrieval; not a historical point-in-time vintage.',
                'Blank cells are missing / pre-listing / retired observations, never forward-filled.',
                'Acquired securities stop at their own last trade; acquirer returns are never spliced in.']}
    for ticker,frame in frames.items():
        trading_dates=frames.get('AAPL',frame).index
        expected=trading_dates[(trading_dates>=frame.index[0])&(trading_dates<=frame.index[-1])]
        missing=expected.difference(frame.index)
        large=frame.adj_close.pct_change(fill_method=None)
        large=large.loc[large.abs()>.5]
        report['symbols'][ticker]={**details[ticker],'first_date':str(frame.index[0].date()),
            'last_date':str(frame.index[-1].date()),'observations':len(frame),
            'current_through_requested':frame.index[-1].date()==source_as_of,
            'missing_ohlcv_rows':int(frame[['open','high','low','close','volume']].isna().any(axis=1).sum()),
            'internal_missing_dates':[str(d.date()) for d in missing],
            'moves_over_50pct':[{'date':str(d.date()),'return':float(v)} for d,v in large.items()]}
    metadata=Path(str(destination)+'.metadata.json')
    if errors:
        atomic_json(Path(str(destination)+'.failed.json'),report)
        raise ValueError(f'{len(errors)} unresolved symbols; no complete CSV was published')
    rows,sha=export_csv(frames,tickers,industries,destination)
    report.update(csv_sha256=sha,csv_rows=rows,csv_columns=1+len(tickers)*len(FIELDS),
        active_symbols=sum(v['current_through_requested'] for v in report['symbols'].values()),
        inactive_or_stale_symbols=[t for t,v in report['symbols'].items() if not v['current_through_requested']],
        dataset_id=sha)
    atomic_json(metadata,report)
    Path(str(destination)+'.failed.json').unlink(missing_ok=True)
    return report


def activate_csv(candidate, baseline=HERE/'stock_data_with_sector.csv', restart=True, weekly=False):
    DATA.mkdir(parents=True,exist_ok=True)
    with (DATA/'refresh.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('Another market publication is running') from None
        return _activate_csv(candidate,baseline,restart,weekly)


def _activate_csv(candidate, baseline, restart, weekly):
    """Install a validated full CSV; roll back both data and provenance on failure."""
    from market_data import load_market, catalog
    candidate,baseline=Path(candidate),Path(baseline)
    if (HERE.parent/'data/market/current.json').exists():
        raise ValueError('An active JSON snapshot would shadow this CSV; migrate that version explicitly first')
    prices,industries=load_market(candidate)
    cutoff=pd.Timestamp.now(tz=NY).tz_localize(None).normalize().replace(day=1)-pd.Timedelta(days=1)
    if prices.index[-1]!=cutoff:
        raise ValueError('Candidate does not reach the latest complete model month')
    required,_=universe(baseline)
    if set(required)!=set(prices.columns):
        raise ValueError('The full existing ticker universe must be preserved')
    if not any(item['eligible'] for item in catalog(prices,industries)):
        raise ValueError('Candidate has no eligible research assets')
    sidecar=Path(str(candidate)+'.metadata.json');target_meta=Path(str(baseline)+'.metadata.json')
    metadata=json.loads(sidecar.read_text())
    metadata['automatic_weekly_refresh']=weekly
    backup=DATA/'releases'/('before-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ'))
    backup.mkdir(parents=True,exist_ok=False)
    shutil.copy2(baseline,backup/baseline.name)
    prior_metadata=target_meta.exists()
    if prior_metadata:shutil.copy2(target_meta,backup/target_meta.name)
    def replace(source,target):
        with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as out:
            temporary=Path(out.name)
            with Path(source).open('rb') as inp:shutil.copyfileobj(inp,out)
            out.flush();os.fsync(out.fileno())
        os.chmod(temporary,0o640);os.replace(temporary,target)
    try:
        replace(candidate,baseline);atomic_json(target_meta,metadata)
        if restart:
            subprocess.run(['pm2','restart','finadvisor-python'],check=True,capture_output=True)
            active=False
            for _ in range(20):
                try:
                    with urlopen('http://127.0.0.1:5002/assets',timeout=5) as response:
                        data=json.load(response)
                    if (data.get('dataset',{}).get('dataset_id')==metadata['csv_sha256'] and
                            data.get('as_of')==str(prices.index[-1].date())):
                        active=True;break
                except Exception:pass
                time.sleep(.5)
            if not active:raise RuntimeError('New CSV version did not become active')
    except Exception:
        replace(backup/baseline.name,baseline)
        if prior_metadata:replace(backup/target_meta.name,target_meta)
        else:target_meta.unlink(missing_ok=True)
        if restart:subprocess.run(['pm2','restart','finadvisor-python'],capture_output=True)
        raise
    atomic_json(DATA/'update-status.json',{'state':'success','last_attempt':datetime.now(timezone.utc).isoformat(),
        'last_success':datetime.now(timezone.utc).isoformat(),'as_of':str(prices.index[-1].date()),
        'source_as_of':metadata.get('source_as_of',metadata['requested_through']),'dataset_id':metadata['csv_sha256']})
    return {'backup':str(backup),'model_through':str(prices.index[-1].date()),'dataset_id':metadata['csv_sha256']}


def automatic_history_enabled(data_dir=DATA):
    # Explicit opt-in on the activated dataset selects the replacement downloader.
    # Do not read the legacy source configuration (it may contain credentials).
    sidecar=Path(str(HERE/'stock_data_with_sector.csv')+'.metadata.json')
    if not sidecar.exists():return False
    try:metadata=json.loads(sidecar.read_text())
    except (OSError,ValueError):return False
    return metadata.get('complete') is True and metadata.get('automatic_weekly_refresh') is True


def refresh_automatic_history(activate=False):
    from market_data import load_market
    baseline=HERE/'stock_data_with_sector.csv';metadata=json.loads(Path(str(baseline)+'.metadata.json').read_text())
    prices,_=load_market(baseline);through=last_friday()
    status_path=DATA/'update-status.json'
    try:prior=json.loads(status_path.read_text())
    except (OSError,ValueError):prior={}
    state={'last_attempt':datetime.now(timezone.utc).isoformat(),'last_success':prior.get('last_success'),
           'as_of':str(prices.index[-1].date()),'source_as_of':metadata.get('source_as_of',metadata['requested_through']),'dataset_id':metadata['csv_sha256']}
    try:
        if date.fromisoformat(metadata['requested_through'])>=through:
            # At a calendar-month boundary, the same Friday CSV may now contain a
            # completed month that was partial when the worker last loaded it.
            if activate:
                with urlopen('http://127.0.0.1:5002/assets',timeout=10) as response:active=json.load(response)
                if active.get('as_of')!=state['as_of'] or active.get('dataset',{}).get('dataset_id')!=state['dataset_id']:
                    activate_csv(baseline,baseline,restart=True,weekly=True)
            atomic_json(status_path,{**state,'state':'current'});return 'current'
        with (DATA/'download.lock').open('a') as lock:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise RuntimeError('Another history rebuild is running') from None
            candidate=DATA/f'stock_data_with_sector_{through}.csv'
            rebuild(baseline,candidate,date.fromisoformat(metadata['requested_start']),through,progress=lambda s:print(s,flush=True))
        if activate:
            activate_csv(candidate,baseline,restart=True,weekly=True);return 'success'
        atomic_json(status_path,{**state,'state':'candidate_ready'});return 'candidate_ready'
    except Exception:
        atomic_json(status_path,{**state,'state':'failed','message':'Weekly history refresh failed; previous version retained.'})
        raise


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path,default=HERE/'stock_data_with_sector.csv')
    parser.add_argument('--output',type=Path)
    parser.add_argument('--start',type=date.fromisoformat,default=date(2010,1,1))
    parser.add_argument('--through',type=date.fromisoformat,default=last_friday())
    parser.add_argument('--workers',type=int,choices=range(1,5),default=3)
    parser.add_argument('--activate',action='store_true',help='Back up and activate the validated CSV; restart only finadvisor-python')
    parser.add_argument('--weekly',action='store_true',help='Allow the existing refresh entry to rebuild weekly after activation')
    args=parser.parse_args(argv)
    if args.weekly and not args.activate:parser.error('--weekly requires --activate')
    if not args.start<args.through<datetime.now(NY).date():parser.error('Use completed historical dates')
    output=args.output or DATA/f'stock_data_with_sector_{args.through}.csv'
    if output.resolve()==args.baseline.resolve():parser.error('Write a new candidate; never overwrite the baseline while downloading')
    DATA.mkdir(parents=True,exist_ok=True)
    with (DATA/'download.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('Another history rebuild is running') from None
        report=rebuild(args.baseline,output,args.start,args.through,args.workers,lambda s:print(s,flush=True))
    activation=activate_csv(output,args.baseline,weekly=args.weekly) if args.activate else None
    print(json.dumps({'csv':str(output.resolve()),'metadata':str(Path(str(output)+'.metadata.json').resolve()),
                     'symbols':report['requested_symbols'],'daily_rows':report['csv_rows'],
                     'current_symbols':report['active_symbols'],'through':report['requested_through'],'sha256':report['csv_sha256'],
                     'activation':activation}))


if __name__=='__main__':main()
