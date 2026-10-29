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
test('three scenario summaries remain visible while detail charts switch',async()=>{
 api.get.mockResolvedValue({data:{portfolio:{tickers:['AAPL'],weights:[1]}}});
 const summary={percentiles:{p5:[1],p25:[2],p50:[3],p75:[4],p95:[5]},expected:[3],
  probability_intervals:{probability_goal_met_real:[.4,.6]},
  performance_metrics:{median_real_final:10000,probability_goal_met_real:.5,terminal_wealth_p5:1000}};
 api.post.mockResolvedValue({data:{scenarios:Object.fromEntries(['baseline','optimistic','pessimistic'].map(s=>[s,{portfolioResults:{portfolio_1:summary}}]))}});
 render(<Simulator/>);
 fireEvent.click(await screen.findByRole('button',{name:'Explore outcomes'}));
 expect(await screen.findByRole('button',{name:'Mean +1 pp scenario'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Mean −1 pp scenario'})).toBeInTheDocument();
 expect(screen.getByText('Baseline scenario · portfolios')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Mean −1 pp details'}));
 expect(screen.getByText('Mean −1 pp scenario · portfolios')).toBeInTheDocument();
 expect(screen.queryByText('Baseline scenario · portfolios')).not.toBeInTheDocument();
 expect(screen.getByText(/95% simulation sampling interval/)).toHaveTextContent('40.0% – 60.0%');
});
