import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InvestorForm, { validProfile } from './InvestorForm';
const profile = {age:30,income:100000,asset:200000,kids:0,married:false,education_level:4,occupation:1,risk:1};
test('profile uses precise monetary inputs and clears stale predictions through its change callback', () => {
    const change = jest.fn();
    render(<InvestorForm features={profile} setFeatures={change}/>);
    fireEvent.change(screen.getByLabelText('Annual household income (USD)'), { target: { value: '42000' } });
    expect(change.mock.calls[0][0](profile)).toEqual({...profile,income:42000});
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.getByText('A yes/no survey input, not a 0–100 risk score')).toBeInTheDocument();
});
test('invalid profile values cannot be submitted', () => {
    expect(validProfile(profile)).toBe(true);
    for (const patch of [{age:17},{age:30.5},{income:''},{asset:0},{kids:-1},{kids:1.5}]) expect(validProfile({...profile,...patch})).toBe(false);
});
