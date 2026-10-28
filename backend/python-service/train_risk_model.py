"""Run from any directory. Saves preprocessing + estimator together."""
import argparse
import hashlib
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit
from risk_model import FEATURES, make_pipeline

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=Path, default=HERE.parents[1] / 'SCFP2022.xlsx')
    parser.add_argument('--output', type=Path, default=HERE / 'risk_pipeline.pkl')
    args = parser.parse_args()
    columns = FEATURES + ['YY1', 'LIQ', 'CDS', 'SAVBND', 'CASHLI', 'NMMF', 'STOCKS', 'BOND']
    data = pd.read_excel(args.data, usecols=columns)
    risky = data[['NMMF', 'STOCKS', 'BOND']].sum(axis=1, min_count=3)
    safe = data[['LIQ', 'CDS', 'SAVBND', 'CASHLI']].sum(axis=1, min_count=4)
    data['RT'] = risky / (risky + safe)
    data = data.replace([np.inf, -np.inf], np.nan).dropna()
    data = data[(data.INCOME > 0) & (data.ASSET > 0) & data.RT.between(0, 1)]
    # YY1 identifies households; Y1 distinguishes their repeated imputations.
    split = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train, test = next(split.split(data, groups=data.YY1))
    train_groups, test_groups = set(data.iloc[train].YY1), set(data.iloc[test].YY1)
    assert not train_groups & test_groups
    model = make_pipeline()
    model.fit(data.iloc[train][FEATURES], data.iloc[train].RT)
    prediction = model.predict(data.iloc[test][FEATURES])
    metrics = {
        'dataset_sha256': hashlib.sha256(args.data.read_bytes()).hexdigest(),
        'sklearn_version': sklearn.__version__, 'seed': 42,
        'split': 'GroupShuffleSplit by YY1, test_size=0.2',
        'train_rows': len(train), 'test_rows': len(test),
        'train_households': len(train_groups), 'test_households': len(test_groups),
        'household_overlap': 0,
        'r2': r2_score(data.iloc[test].RT, prediction),
        'mae': mean_absolute_error(data.iloc[test].RT, prediction),
        'rmse': float(np.sqrt(mean_squared_error(data.iloc[test].RT, prediction))),
        'mean_baseline_mae': mean_absolute_error(data.iloc[test].RT,
                                               np.repeat(data.iloc[train].RT.mean(), len(test))),
        'limitations': 'Unweighted household holdout; proxy target is observed risky-asset share, not future returns or validated psychological risk tolerance.',
    }
    with args.output.open('wb') as f:
        pickle.dump(model, f)
    args.output.with_suffix('.metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    main()
