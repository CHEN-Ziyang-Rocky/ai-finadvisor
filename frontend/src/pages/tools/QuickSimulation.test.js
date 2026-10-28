import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import QuickSimulation,{quickPayload} from './QuickSimulation';
import api from '../../api';
jest.mock('../../api',()=>({post:jest.fn()}));
const portfolio={tickers:['AAPL','MSFT'],weights:[.4,.6]};
test('quick defaults use saved weights, three scenarios and one portfolio',()=>{
 const p=quickPayload(portfolio,'10000','10','200',false,'15000');
 expect(p.portfolios).toEqual([{weights:{AAPL:40,MSFT:60}}]);
 expect(p.scenarios).toEqual(['baseline','optimistic','pessimistic']);expect(p.contribution_frequency).toBe('monthly');
 expect(p.cashflow_type).toBe('contribute_fixed');expect(p.inflation_adjusted).toBe(false);
 expect(quickPayload(portfolio,10000,10,0,true,10000).portfolios[1].weights).toEqual({AAPL:50,MSFT:50});
});
test('quick input rejects missing values, fractional years and malformed weights',()=>{
 expect(()=>quickPayload(portfolio,'',10,0,false,0)).toThrow();
 expect(()=>quickPayload(portfolio,10000,1.5,0,false,0)).toThrow();
 expect(()=>quickPayload({...portfolio,weights:[.3,.6]},10000,10,0,false,0)).toThrow();
});
test('quick form submits once and handles a rate-limited request',async()=>{
 api.post.mockRejectedValue({response:{status:429}});
 render(<QuickSimulation portfolio={portfolio} onPredictionComplete={jest.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Explore outcomes'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Too many calculations'));
 expect(api.post).toHaveBeenCalledTimes(1);
});
