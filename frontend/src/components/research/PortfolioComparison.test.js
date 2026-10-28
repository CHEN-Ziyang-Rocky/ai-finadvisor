import React from 'react';
import {render,screen} from '@testing-library/react';
import Comparison from './PortfolioComparison';
import MarketWidget from './MarketWidget';
test('comparison explicitly shows worse growth and larger drawdown',()=>{
 const estimate={estimated_annual_return:.1,estimated_annual_volatility:.2,effective_holdings:3,largest_weight:.5};
 render(<Comparison report={{comparison:{equal_weight:estimate,optimized:estimate},validation:{test_months:24,metrics:{optimized:{cagr:.05,annual_volatility:.25,max_drawdown:-.3},equal_weight:{cagr:.1,annual_volatility:.2,max_drawdown:-.2}}}}}/>);
 expect(screen.getByText('5.0 pp lower')).toBeInTheDocument();expect(screen.getByText('10.0 pp larger')).toBeInTheDocument();
});
test('external widget scripts cannot access the account origin',()=>{
 render(<MarketWidget kind="market"/>);
 const frame=screen.getByTitle('TradingView market overview');
 expect(frame.hasAttribute('srcdoc')).toBe(false);
 expect(new URL(frame.src).origin).toBe('https://www.tradingview-widget.com');
 expect(frame.src).not.toContain('income');expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
 expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
});
