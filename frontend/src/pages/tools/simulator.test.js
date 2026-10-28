import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import Simulator from './simulator';
import api from '../../api';
jest.mock('react-router-dom',()=>({useLocation:()=>({state:null}),Link:({to,children,...props})=><a href={to} {...props}>{children}</a>}));
jest.mock('../../api',()=>({get:jest.fn(),post:jest.fn()}));
jest.mock('./InvestorForm',()=>()=> <div>Advanced form loaded</div>);
jest.mock('./PredictionChart',()=>()=> <div>Chart</div>);
test('revisit restores server portfolio and keeps advanced controls collapsed',async()=>{
 api.get.mockResolvedValue({data:{portfolio:{tickers:['AAPL','MSFT'],weights:[.4,.6]}}});
 render(<Simulator/>);
 expect(await screen.findByText('AAPL 40.0%')).toBeInTheDocument();
 expect(api.get).toHaveBeenCalledWith('/saved-portfolio');
 expect(screen.queryByText('Advanced form loaded')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Advanced lab/}));
 expect(await screen.findByText('Advanced form loaded')).toBeInTheDocument();
});
test('empty saved portfolio offers a profile link instead of silently picking stocks',async()=>{
 api.get.mockResolvedValue({data:{portfolio:null}});
 render(<Simulator/>);
 expect(await screen.findByRole('link',{name:'Build a portfolio'})).toHaveAttribute('href','/user');
 expect(screen.queryByRole('button',{name:'Explore outcomes'})).not.toBeInTheDocument();
});
