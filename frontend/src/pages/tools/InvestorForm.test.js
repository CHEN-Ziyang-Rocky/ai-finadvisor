import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InvestorForm from './InvestorForm';
import api from '../../api';

jest.mock('../../api', () => ({ post: jest.fn() }));

test('precise optimizer weights remain browser-valid and are submitted without rounding', async () => {
    const weights = [.13678725791637858, .3252483891779136, .31117777018504437, .2267865827206635];
    api.post.mockResolvedValue({ data: { scenarios: {} } });
    const completed = jest.fn();
    render(<InvestorForm initialPortfolio={{ tickers: ['AAPL', 'MSFT', 'JNJ', 'JPM'], weights, as_of: '2025-02-28' }} onPredictionComplete={completed} />);
    const inputs = screen.getAllByRole('spinbutton', { name: 'Portfolio 1 (%)', exact: true });
    inputs.forEach((input, i) => {
        expect(input.checkValidity()).toBe(true);
        expect(input.value).toBe((weights[i] * 100).toFixed(2));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run Simulation' }));
    await waitFor(() => expect(completed).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload.calibration).toBe('historical');
    expect(payload.portfolios[0].weights.AAPL).toBe(weights[0] * 100);
    expect(payload.portfolios[1].weights).toEqual({ AAPL: 25, MSFT: 25, JNJ: 25, JPM: 25 });
});

test('adding an asset to an imported portfolio preserves edited weights', () => {
    render(<InvestorForm initialPortfolio={{ tickers: ['AAPL','MSFT'], weights: [.4,.6] }} onPredictionComplete={jest.fn()} />);
    const first = screen.getAllByRole('spinbutton', { name: 'Portfolio 1 (%)', exact: true });
    fireEvent.change(first[0], { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Asset' }));
    const after = screen.getAllByRole('spinbutton', { name: 'Portfolio 1 (%)', exact: true });
    expect(after).toHaveLength(3);
    expect(after[0]).toHaveValue(35);
    expect(after[1]).toHaveValue(60);
    expect(after[2]).toHaveValue(0);
});
