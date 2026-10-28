"""Research refresh, invoked daily for retries. Source credentials never enter logs.
Activated weekly CSVs use the public downloader; legacy exports use source.json.
"""
import argparse
import csv
from datetime import datetime, timezone
import fcntl
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
import socket
import ipaddress
from market_data import load_market, catalog
from market_snapshot import read_snapshot, publish

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
DATA=HERE.parent/'data'/'market'


def atomic_json(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False) as f:
        json.dump(data,f);f.flush();os.fsync(f.fileno());temp=Path(f.name)
    os.chmod(temp,0o640);os.replace(temp,path)


def source_csv(config):
    source=config.get('csv_source','')
    if source.startswith('https://'):
        address=urlsplit(source)
        if address.username or address.password or address.port not in [None,443]:raise ValueError('Invalid source URL')
        for record in socket.getaddrinfo(address.hostname,443,type=socket.SOCK_STREAM):
            if not ipaddress.ip_address(record[4][0]).is_global:raise ValueError('Source must be public')
        # Do not follow redirects into other hosts or private infrastructure.
        import urllib.request
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):return None
        with urllib.request.build_opener(NoRedirect).open(Request(source,headers={'User-Agent':'FinadvisorResearch/1.0'}),timeout=30) as response:
            content=response.read(100_000_001)
        if len(content)>100_000_000:raise ValueError('CSV exceeds size limit')
        text=content.decode('utf-8-sig')
    else:
        p=Path(source)
        if not p.is_absolute() or p.suffix.lower()!='.csv' or p.stat().st_size>100_000_000:raise ValueError('Expected an absolute CSV path')
        text=p.read_text(encoding='utf-8-sig')
    rows=csv.DictReader(io.StringIO(text))
    if not {'symbol','date','close'}.issubset(rows.fieldnames or []):raise ValueError('CSV requires symbol,date,close')
    bars=[]
    for row in rows:
        if len(bars)>=1_000_000:raise ValueError('Too many price rows')
        bars.append({'symbol':row['symbol'].strip(),'date':row['date'].strip(),'close':float(row['close'])})
    return {'provider':config['provider'],'adjustment':config['adjustment'],'frequency':config.get('frequency','daily'),'currency':'USD','industries':config.get('industries',{}),'bars':bars}


def expected_cutoff():
    import pandas as pd
    today=pd.Timestamp.now(tz='America/New_York').tz_localize(None).normalize()
    return today.replace(day=1)-pd.Timedelta(days=1)


def validate_publication(candidate,current,baseline):
    prices,_=read_snapshot(candidate)
    if prices.index[-1] != expected_cutoff():raise ValueError('The source does not reach the last complete month')
    if Path(current).exists():old,_=read_snapshot(current);required=set(old.columns)
    else:
        old,industry=load_market(baseline)
        required={x['ticker'] for x in catalog(old,industry) if x['eligible']}
    if not required.issubset(prices.columns):raise ValueError('New source would remove existing eligible research symbols')
    return prices


def refresh(data_dir=DATA,activate=False):
    data_dir=Path(data_dir);data_dir.mkdir(parents=True,exist_ok=True)
    status_path=data_dir/'update-status.json';config_path=data_dir/'source.json';current=data_dir/'current.json'
    try: old_status=json.loads(status_path.read_text())
    except (OSError, ValueError): old_status={}
    if not isinstance(old_status,dict): old_status={}
    status={'state':'running','last_attempt':datetime.now(timezone.utc).isoformat(),'last_success':old_status.get('last_success')}
    if not config_path.exists():
        atomic_json(status_path,{**status,'state':'pending_source','message':'Waiting for an owner-configured history source.'});return 'pending_source'
    try:
        config=json.loads(config_path.read_text())
        if not isinstance(config,dict): raise ValueError('Configuration must be an object')
    except (OSError,ValueError):
        atomic_json(status_path,{**status,'state':'failed','message':'Invalid source configuration; active data unchanged.'})
        raise RuntimeError('Invalid source configuration') from None
    if config.get('usage_confirmed') is not True:
        atomic_json(status_path,{**status,'state':'pending_source','message':'Source usage has not been confirmed.'});return 'pending_source'
    if current.exists():
        current_prices,_=read_snapshot(current)
        if current_prices.index[-1]==expected_cutoff():
            atomic_json(status_path,{**status,'state':'current','as_of':str(current_prices.index[-1].date())});return 'current'
    atomic_json(status_path,status)
    try:
        payload=source_csv(config)
        # Canonical normalization is shared with the SQL importer; this step writes no database rows.
        code="const s=require('./services/marketStore');let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(s.normalizeDataset(JSON.parse(b)))));"
        normalized=subprocess.run(['node','-e',code],cwd=HERE.parent,input=json.dumps(payload),text=True,capture_output=True,check=True).stdout
        data=json.loads(normalized)
        candidate=data_dir/(data['dataset_id']+'.json')
        if candidate.exists() and candidate.read_text()!=normalized:raise ValueError('Existing version differs')
        if not candidate.exists():candidate.write_text(normalized);os.chmod(candidate,0o640)
        prices=validate_publication(candidate,current,HERE/'stock_data_with_sector.csv')
        subprocess.run(['node',str(HERE.parent/'scripts'/'market-data.js'),'import',str(candidate),str(data_dir)],cwd=ROOT,capture_output=True,check=True)
        csv_version=data_dir/(data['dataset_id']+'.csv')
        prices.to_csv(csv_version,index_label='date');os.chmod(csv_version,0o640)
        prior=current.read_bytes() if current.exists() else None
        try:
            publish(candidate,current)
            if activate:
                subprocess.run(['pm2','restart','finadvisor-python'],capture_output=True,check=True)
                import time
                active=False
                for attempt in range(10):
                    try:
                        with urlopen('http://127.0.0.1:5002/assets',timeout=5) as response:active=json.load(response).get('dataset',{}).get('dataset_id')==data['dataset_id']
                        if active:break
                    except Exception:pass
                    time.sleep(1)
                if not active:raise RuntimeError('New version did not become active')
            # Stable CSV export for owners; the engine reads the matching versioned JSON.
            with tempfile.NamedTemporaryFile(dir=data_dir,delete=False) as export:
                export.write(csv_version.read_bytes());export.flush();os.fsync(export.fileno());export_path=Path(export.name)
            os.chmod(export_path,0o640);os.replace(export_path,data_dir/'current.csv')
        except Exception:
            if prior is not None:
                with tempfile.NamedTemporaryFile(dir=data_dir,delete=False) as f:f.write(prior);backup=Path(f.name)
                os.chmod(backup,0o640);os.replace(backup,current)
            else:current.unlink(missing_ok=True)
            if activate:subprocess.run(['pm2','restart','finadvisor-python'],capture_output=True)
            raise
        atomic_json(status_path,{**status,'state':'success','last_success':datetime.now(timezone.utc).isoformat(),'as_of':str(prices.index[-1].date()),'dataset_id':data['dataset_id']})
        return 'success'
    except Exception:
        atomic_json(status_path,{**status,'state':'failed','message':'Refresh failed validation, import or activation. Previous active version retained.'})
        raise RuntimeError('Market refresh failed; previous version retained') from None


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--activate',action='store_true')
    parser.add_argument('--download-history',action='store_true',help='Rebuild a full private research CSV from free public sources')
    parser.add_argument('--through',help='Completed daily cutoff YYYY-MM-DD (default: previous Friday)')
    parser.add_argument('--output',help='New complete CSV output path')
    parser.add_argument('--weekly',action='store_true',help='Enable weekly rebuilding via this existing refresh entry after activation')
    args=parser.parse_args()
    if args.download_history:
        from download_market_history import main as download_history
        forwarded=[]
        if args.through:forwarded+=['--through',args.through]
        if args.output:forwarded+=['--output',args.output]
        if args.activate:forwarded+=['--activate']
        if args.weekly:forwarded+=['--weekly']
        download_history(forwarded)
        raise SystemExit(0)
    if args.through or args.output or args.weekly:parser.error('--through, --output and --weekly require --download-history')
    from download_market_history import automatic_history_enabled, refresh_automatic_history
    if automatic_history_enabled(DATA):
        try:print(refresh_automatic_history(activate=args.activate))
        except Exception:raise SystemExit('Weekly history refresh failed; previous version retained. No credentials are logged.')
        raise SystemExit(0)
    DATA.mkdir(parents=True,exist_ok=True)
    with (DATA/'refresh.lock').open('w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise SystemExit('Another market update is running')
        try:print(refresh(activate=args.activate))
        except Exception:raise SystemExit('Market refresh failed. Check the owner-configured source; no credentials are logged.')
