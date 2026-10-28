"""Shared raw-feature contract used by training and HTTP inference."""
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

FEATURES = ['AGE', 'EDCL', 'MARRIED', 'KIDS', 'OCCAT1', 'INCOME', 'YESFINRISK', 'ASSET']


class CappedLogTransformer(TransformerMixin, BaseEstimator):
    """Learn caps on the training fold only; never refit them during inference."""
    def fit(self, X, y=None):
        values = np.asarray(X, dtype=float)
        self.lower_ = np.quantile(values, 0.01, axis=0)
        self.upper_ = np.quantile(values, 0.99, axis=0)
        return self

    def transform(self, X):
        return np.log(np.clip(np.asarray(X, dtype=float), self.lower_, self.upper_))


def make_pipeline():
    preprocessing = ColumnTransformer([
        ('money', CappedLogTransformer(), ['INCOME', 'ASSET']),
        ('categories', OneHotEncoder(
            categories=[[1, 2, 3, 4], [1, 2], [1, 2, 3, 4], [0, 1]],
            handle_unknown='error', sparse_output=False),
         ['EDCL', 'MARRIED', 'OCCAT1', 'YESFINRISK']),
        ('numeric', 'passthrough', ['AGE', 'KIDS']),
    ])
    return Pipeline([
        ('preprocessing', preprocessing),
        ('regressor', ExtraTreesRegressor(n_estimators=100, min_samples_leaf=2,
                                         random_state=42, n_jobs=2)),
    ])


def feature_frame(features):
    if not isinstance(features, list) or len(features) != len(FEATURES):
        raise ValueError('Expected 8 raw features: ' + ', '.join(FEATURES))
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in features):
        raise ValueError('Features must be numeric')
    values = np.asarray(features, dtype=float)
    if not np.isfinite(values).all():
        raise ValueError('Features must be finite')
    age, education, married, kids, occupation, income, risk, asset = values
    if not (18 <= age <= 120 and age.is_integer() and kids >= 0 and kids.is_integer()):
        raise ValueError('Invalid age or number of children')
    if education not in (1, 2, 3, 4) or married not in (1, 2) or occupation not in (1, 2, 3, 4) or risk not in (0, 1):
        raise ValueError('Invalid categorical feature code')
    if income <= 0 or asset <= 0:
        raise ValueError('Income and assets must be positive for this model')
    return pd.DataFrame([values], columns=FEATURES)


def explain_prediction(model, frame, metrics):
    """Expose aggregate validation and preprocessing limits, not fake confidence intervals."""
    warnings = []
    money = getattr(model, 'named_steps', {}).get('preprocessing')
    if money is not None:
        transform = money.named_transformers_['money']
        for i, field in enumerate(['INCOME', 'ASSET']):
            value = float(frame[field].iloc[0])
            if value < transform.lower_[i] or value > transform.upper_[i]:
                warnings.append(f'{field.title()} is outside the training 1st–99th percentile range and is capped by preprocessing.')
    return {
        'target': 'Observed risky-asset share in the 2022 US household survey',
        'interpretation': 'A research proxy, not a psychological assessment or an allocation recommendation.',
        'holdout_mae': metrics.get('mae'), 'holdout_r2': metrics.get('r2'),
        'validation': 'Household-separated, unweighted holdout; MAE is an aggregate error, not an individual confidence interval.',
        'warnings': warnings,
    }
