import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import Assistant from './index';
import api from '../../api';
jest.mock('../../api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()}}));
const skills=[{id:'allocation_review',title:'Review allocation'},{id:'goal_check',title:'Check goal'},{id:'cap_comparison',title:'Compare cap'}];
beforeEach(()=>{jest.clearAllMocks();api.get.mockResolvedValue({data:{live_enabled:false,skills}});});
test('workflow explicitly labels no LLM and renders verified evidence',async()=>{
 api.post.mockResolvedValue({data:{mode:'workflow',skill:skills[0],notice:'No model was called.',evidence:{context:{start:'2021-10',end:'2026-09',observations:60}},answer:[{id:'v',text:'Estimated volatility: 24.3%.',source:{path:'diagnostics.volatility',calculation_id:'receipt-123'}}],limitations:[{id:'l',text:'Historical results are not forecasts.'}],trace:[],version:'test',elapsed_ms:10}});
 render(<Assistant/>);const button=screen.getByRole('button',{name:'Run research task'});await waitFor(()=>expect(button).not.toBeDisabled());
 fireEvent.click(button);await screen.findByText('Estimated volatility: 24.3%.');expect(screen.getByText(/Evidence: diagnostics.volatility/)).toBeInTheDocument();
 expect(api.post).toHaveBeenCalledWith('/assistant/run',expect.objectContaining({mode:'workflow',question:'',consent:false}),expect.any(Object));
 expect(screen.getByText('Historical results are not forecasts.')).toBeInTheDocument();
});
test('goal controls use explicit real target and errors do not pretend success',async()=>{
 api.post.mockRejectedValue({response:{data:{error:'Recalculate baseline first.'}}});render(<Assistant/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Run research task'})).not.toBeDisabled());
 fireEvent.mouseDown(screen.getByLabelText('Research task'));fireEvent.click(screen.getByRole('option',{name:'Check goal'}));
 fireEvent.change(screen.getByLabelText("Target wealth (today's USD)"),{target:{value:'50000'}});fireEvent.click(screen.getByRole('button',{name:'Run research task'}));
 await screen.findByText('Recalculate baseline first.');expect(api.post).toHaveBeenCalledWith('/assistant/run',expect.objectContaining({skill:'goal_check',goal_amount:50000,years:10}),expect.any(Object));
 expect(screen.queryByRole('button',{name:'Download assistant evidence'})).not.toBeInTheDocument();
});
