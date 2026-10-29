import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import SimulationResults,{chartRows} from './SimulationResults';
jest.mock('./PredictionChart',()=>({data,basisLabel})=><div>{basisLabel} last median {data[data.length-1].p50}</div>);
const summary={percentiles:{p5:[110],p25:[110],p50:[110],p75:[110],p95:[110]},expected:[110],goal_success_count:10,
    performance_metrics:{median_real_final:100,median_final:110,terminal_wealth_p5:110,terminal_real_wealth_p5:100,
    probability_goal_met_real:1,avg_investment_max_drawdown:.5,probability_drawdown_30:1,p95_investment_max_drawdown:.5}};
const result={initial_amount:100,scenarios:{baseline:{portfolioResults:{portfolio_1:summary}}},calculation:{calculation_id:'original-id',engine_version:'test',kind:'simulation',inputs:{
    simulation_model:'historical',block_months:3,num_simulations:10,random_seed:42,initial_amount:100,investment_years:1,inflation_rate:10,
    goal_amount:100,rebalancing_frequency:'annually',cashflow_type:'none',portfolios:[{weights:{A:100}}]}}};
test('wealth basis converts every curve point without changing the real goal',()=>{
    expect(chartRows(summary,100,10,true)[0].p50).toBe(100);
    expect(chartRows(summary,100,10,true)[1].p50).toBeCloseTo(100);
    expect(chartRows(summary,100,10,false)[1].p50).toBe(110);
    render(<SimulationResults result={result}/>);
    expect(screen.getByText('Target: $100 in today\'s purchasing power after 1 years.')).toBeInTheDocument();
    expect(screen.getByText('10 of 10 simulated paths; conditional on this model.')).toBeInTheDocument();
    expect(screen.getByText('A 100.00%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Future nominal dollars'}));
    expect(screen.getByText('Future nominal USD last median 110')).toBeInTheDocument();
    expect(screen.getByText('Paths reaching $100 real in 1 years')).toBeInTheDocument();
});
test('record and risk descriptions do not imply certification or a future guarantee',()=>{
    render(<SimulationResults result={result}/>);
    expect(screen.getByText(/A model fraction is not a real-world success guarantee/)).toBeInTheDocument();
    expect(screen.getByText(/not an independent certification/)).toBeInTheDocument();
    expect(screen.getByText('Paths with a drawdown of at least 30%')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Download calculation record'})).toBeInTheDocument();
});
