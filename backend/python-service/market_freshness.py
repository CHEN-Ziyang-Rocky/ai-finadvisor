import json
from pathlib import Path
import pandas as pd


def freshness(prices,status_path):
    today=pd.Timestamp.now(tz='America/New_York').tz_localize(None).normalize()
    expected=today.replace(day=1)-pd.Timedelta(days=1)
    try:status=json.loads(Path(status_path).read_text())
    except (OSError,ValueError):status={}
    state=status.get('state','pending_source')
    if state not in ['pending_source','running','current','success','failed']:state='unknown'
    return {'expected_through':str(expected.date()),'stale':bool(prices.index[-1]<expected),
            'update_status':state,'last_attempt':status.get('last_attempt'),'last_success':status.get('last_success')}
