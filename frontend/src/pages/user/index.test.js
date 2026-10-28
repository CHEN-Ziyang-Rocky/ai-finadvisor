import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import User from './index';
import api, { fetchAvailableAssets, fetchRiskTolerance } from '../../api';
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('../../api', () => ({ __esModule:true, default:{post:jest.fn(),get:jest.fn()}, fetchAvailableAssets:jest.fn(), fetchRiskTolerance:jest.fn() }));
jest.mock('./EfficientFrontierChart', () => () => null);
beforeEach(() => {
    api.get.mockResolvedValue({data:{profile:null,portfolio:null,latest_run:null}});
    fetchAvailableAssets.mockResolvedValue({ as_of:'2025-02-28', catalog:['AAPL','MSFT','JNJ','JPM'].map(ticker=>({ticker,industry:'Fixture',eligible:true,months:60})) });
    fetchRiskTolerance.mockResolvedValue({data:{risk_tolerance:.373,model_info:{holdout_mae:.1927,holdout_r2:.317,warnings:[]}}});
    api.post.mockRejectedValue({response:{data:{error:'fixture allocation stop'}}});
});
test('profile score initializes a separate editable preference; changing profile invalidates allocation', async () => {
    render(<User/>);
    const estimate = screen.getByRole('button', { name:'Estimate profile score' });
    await waitFor(()=>expect(estimate).not.toBeDisabled());
    fireEvent.click(estimate);
    await screen.findByRole('slider', {name:'Research return preference'});
    fireEvent.click(screen.getByRole('button', {name:'Load four-stock example'}));
    fireEvent.change(screen.getByRole('slider', {name:'Research return preference'}), {target:{value:'60'}});
    fireEvent.click(screen.getByRole('button', {name:'Optimize & compare'}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/allocate',expect.objectContaining({risk_tolerance:.6,stock_tickers:['AAPL','MSFT','JNJ','JPM'],method:'target_return'})));
    await screen.findByText('fixture allocation stop');
    fireEvent.change(screen.getByLabelText('Age'), {target:{value:'35'}});
    expect(screen.getByRole('button', {name:'Optimize & compare'})).toBeDisabled();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});
