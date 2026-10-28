"""Gaussian quasi-likelihood GARCH(1,1), fixed sample mean, stationary constraints."""
import numpy as np
from scipy.optimize import minimize


def fit_garch(log_returns):
    x = np.asarray(log_returns, dtype=float)
    if x.ndim != 1 or len(x)<60 or not np.isfinite(x).all():
        raise ValueError('GARCH fitting needs at least 60 finite monthly observations')
    residual = x-x.mean()
    scale = float(residual.std())
    if scale < 1e-7:
        raise ValueError('GARCH is not identifiable for a near-constant series')
    e = residual/scale
    def variances(theta):
        omega,alpha,beta = theta
        h = np.empty(len(e)+1)
        h[0]=1.0
        for t in range(len(e)):
            h[t+1]=omega+alpha*e[t]**2+beta*h[t]
        return h
    def objective(theta):
        h = variances(theta)[:-1]
        return float(.5*np.mean(np.log(h)+e**2/h))
    solutions=[]
    for alpha,beta in [(0.1,0.85),(0.2,0.5),(0.05,0.2)]:
        fit=minimize(objective,[1-alpha-beta,alpha,beta],method='SLSQP',
                     bounds=[(1e-6,10),(0,.995),(0,.995)],
                     constraints=[{'type':'ineq','fun':lambda p:.995-p[1]-p[2]}],
                     options={'maxiter':300,'ftol':1e-9})
        if fit.success and np.isfinite(fit.fun) and fit.x[1]+fit.x[2] <= .995+1e-8:
            solutions.append(fit)
    if not solutions:
        raise ValueError('GARCH fitting did not converge; choose Normal or Historical instead')
    best=min(solutions,key=lambda f:f.fun)
    omega,alpha,beta=best.x
    h=variances(best.x)
    return {'omega':float(omega*scale**2),'alpha':float(alpha),'beta':float(beta),
            'next_variance':float(h[-1]*scale**2), 'sample_months':len(x),
            'persistence':float(alpha+beta), 'objective':float(best.fun),
            'standardized_residuals':e/np.sqrt(h[:-1])}
