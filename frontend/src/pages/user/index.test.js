import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import User from './index';
import api, { fetchAvailableAssets, fetchRiskTolerance } from '../../api';
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('../../api', () => ({ __esModule:true, default:{post:jest.fn(),get:jest.fn()}, fetchAvailableAssets:jest.fn(), fetchRiskTolerance:jest.fn() }));
jest.mock('./EfficientFrontierChart', () => () => null);
jest.mock('../../components/research/AllocationDonut', () => () => null);
beforeEach(() => {
    api.get.mockResolvedValue({data:{profile:null,portfolio:null,latest_run:null}});
    fetchAvailableAssets.mockResolvedValue({ as_of:'2026-09-30', dataset:{dataset_id:'current'}, catalog:['AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA'].map(ticker=>({ticker,industry:'Fixture',eligible:true,months:60})) });
    fetchRiskTolerance.mockResolvedValue({data:{risk_tolerance:.373,model_info:{holdout_mae:.1927,holdout_r2:.317,warnings:[]}}});
    api.post.mockRejectedValue({response:{data:{error:'fixture allocation stop'}}});
});
test('profile score initializes a separate editable preference; changing profile invalidates allocation', async () => {
    render(<User/>);
    const estimate = screen.getByRole('button', { name:'Estimate profile score' });
    await waitFor(()=>expect(estimate).not.toBeDisabled());
    fireEvent.click(estimate);
    await screen.findByRole('slider', {name:'Research return preference'});
    fireEvent.click(screen.getByRole('button', {name:'Load Magnificent Seven'}));
    expect(screen.getByText('7 / 10 selected · at least 36 common months required')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', {name:'Research return preference'}), {target:{value:'60'}});
    fireEvent.click(screen.getByRole('button', {name:'Optimize & compare'}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/allocate',expect.objectContaining({risk_tolerance:.6,stock_tickers:['AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA'],method:'target_return'})));
    await screen.findByText('fixture allocation stop');
    fireEvent.change(screen.getByLabelText('Age'), {target:{value:'35'}});
    expect(screen.getByRole('button', {name:'Optimize & compare'})).toBeDisabled();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});

test('an unavailable member never silently loads an incomplete seven-stock example', async () => {
    fetchAvailableAssets.mockResolvedValue({as_of:'2026-09-30',catalog:['AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA'].map(ticker=>({ticker,eligible:ticker!=='TSLA'}))});
    render(<User/>);
    expect(await screen.findByText(/full seven-stock example is unavailable/)).toHaveTextContent('TSLA');
    expect(screen.getByRole('button',{name:'Load Magnificent Seven'})).toBeDisabled();
    expect(screen.getByText('0 / 10 selected · at least 36 common months required')).toBeInTheDocument();
});

const savedReport = {
    stock_tickers:['AAPL'],allocations:[1],data_context:{start:'2021-10-31',end:'2026-09-30',observations:60,dataset_id:'old'},
    policy:{method:'target_return',max_weight:1,lookback_months:60,cost_bps:10,risk_score:.3},
    diagnostics:{estimated_annual_return:.1,estimated_annual_volatility:.2,effective_holdings:1,warnings:[],industry_weights:{}},
    frontier:{efficient_curve:[]},validation:{available:false,reason:'Fixture evaluation unavailable'}
};
test('saved reports warn on a changed dataset even when the monthly cutoff is unchanged', async () => {
    api.get.mockResolvedValue({data:{profile:null,portfolio:null,latest_run:{report:savedReport}}});
    render(<User/>);
    expect(await screen.findByText(/Saved calculation uses a different data version/)).toBeInTheDocument();
});

test('editing a saved profile leaves its historical calculation clearly marked', async () => {
    api.get.mockResolvedValue({data:{profile:{age:30,income:100000,asset:200000,education_level:4,married:false,kids:0,occupation:1,risk:1,risk_tolerance:null,updated_at:'2026-10-29T10:00:00Z'},portfolio:null,latest_run:{created_at:'2026-10-28T10:00:00Z',report:savedReport}}});
    render(<User/>);
    expect(await screen.findByText(/profile was edited after this saved calculation/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Optimize & compare'})).toBeDisabled();
});

test('retired saved selections must be removed before allocating', async () => {
    api.get.mockResolvedValue({data:{profile:{age:30,income:100000,asset:200000,education_level:4,married:false,kids:0,occupation:1,risk:1,risk_tolerance:.3},portfolio:{tickers:['OLD'],weights:[1]},latest_run:null}});
    fetchAvailableAssets.mockResolvedValue({as_of:'2026-09-30',catalog:[{ticker:'OLD',eligible:false}]});
    render(<User/>);
    expect(await screen.findByText(/Remove stocks without current research history/)).toHaveTextContent('OLD');
    expect(screen.getByRole('button',{name:'Optimize & compare'})).toBeDisabled();
});
