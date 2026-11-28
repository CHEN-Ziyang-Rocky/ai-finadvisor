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

test('live model mode requires explicit consent and sends the selected question',async()=>{
 api.get.mockResolvedValue({data:{live_enabled:true,provider:'deepseek',skills}});
 api.post.mockRejectedValue({response:{data:{error:'Fixture stopped before provider.'}}});
 render(<Assistant/>);const run=screen.getByRole('button',{name:'Run research task'});await waitFor(()=>expect(run).not.toBeDisabled());
 fireEvent.mouseDown(screen.getByLabelText('Execution mode'));fireEvent.click(screen.getByRole('option',{name:'Live model · function calling'}));
 expect(run).toBeDisabled();fireEvent.change(screen.getByLabelText('Question about the selected task'),{target:{value:'Explain concentration'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Send this question/}));expect(run).not.toBeDisabled();fireEvent.click(run);
 await screen.findByText('Fixture stopped before provider.');
 expect(api.post).toHaveBeenCalledWith('/assistant/run',expect.objectContaining({mode:'llm',consent:true,question:'Explain concentration'}),expect.any(Object));
});

test('library search shows passage citations and sends only the public question',async()=>{
 api.post.mockResolvedValue({data:{question:'How is turnover calculated?',mode:'workflow',status:'matches',evidence:[{id:'turnover',title:'Methods',version:'v1',locator:'Line 21',text:'Gross turnover formula.',url:'https://example.org/method#L21'}]}});
 render(<Assistant/>);
 fireEvent.change(screen.getByLabelText('Document question'),{target:{value:'How is turnover calculated?'}});
 const search=screen.getByRole('button',{name:'Search sources'});
 await waitFor(()=>expect(search).not.toBeDisabled());fireEvent.click(search);
 expect(await screen.findByRole('link',{name:'Methods · v1 · Line 21'})).toHaveAttribute('href','https://example.org/method#L21');
 expect(api.post).toHaveBeenCalledWith('/assistant/documents',{question:'How is turnover calculated?',mode:'workflow',consent:false});
});

test('multi-step study sends the displayed cap and offers correction after clarification',async()=>{
 api.post.mockResolvedValue({data:{run_id:'run123',mode:'workflow',question:'Test 25%',cap_pct:35,status:'clarify',reason:'Align the percentages.',elapsed_ms:1,trace:[]}});
 render(<Assistant/>);const run=screen.getByRole('button',{name:'Run with local workflow'});
 await waitFor(()=>expect(run).not.toBeDisabled());
 fireEvent.click(screen.getByLabelText('Allow a holding-cap simulation for this run'));
 fireEvent.change(screen.getByLabelText('Research question'),{target:{value:'Test 25%'}});
 fireEvent.click(run);
 expect(await screen.findByText('Align the percentages.')).toBeInTheDocument();
 expect(api.post).toHaveBeenCalledWith('/assistant/agent',{question:'Test 25%',cap_pct:35,allow_trial:true,mode:'workflow',consent:false},expect.any(Object));
 expect(run).not.toBeDisabled();
});

test('opening a metric pins its receipt and shows its evaluation window without a planning call',async()=>{
 const receipt='b'.repeat(64);
 window.history.replaceState({},'',`/tools/assistant?receipt=${receipt}&metric=drawdown`);
 try{
  api.get.mockImplementation(async path=>({data:path.endsWith(receipt)?{receipt,figures:[
   {id:'drawdown',label:'Backtested maximum drawdown',value:-.16,unit:'percent',explanation:'Monthly closes',window:{start:'2024-10-31',end:'2026-09-30',months:24},path:'validation.metrics.optimized.max_drawdown'}
  ]}:path.endsWith('/reports')?{reports:[]}:{live_enabled:false,skills}}));
  render(<Assistant/>);
  expect(await screen.findByText('Backtested maximum drawdown · -16.00%')).toBeInTheDocument();
  expect(screen.getByText(/2024-10-31 – 2026-09-30 · 24 months/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
 }finally{window.history.replaceState({},'','/');}
});

test('an insufficient-evidence response explains why there are no answer figures',async()=>{
 api.post.mockResolvedValue({data:{status:'insufficient_evidence',mode:'llm',provider:'fixture',model:'fixture',skill:skills[0],
  notice:'No recorded figure answers this question.',evidence:{context:{start:'2025-01',end:'2026-01',observations:12}},
  answer:[],limitations:[],trace:[],version:'fixture',elapsed_ms:1}});
 render(<Assistant/>);const run=screen.getByRole('button',{name:'Run research task'});
 await waitFor(()=>expect(run).not.toBeDisabled());fireEvent.click(run);
 expect(await screen.findByText('Insufficient evidence')).toBeInTheDocument();
 expect(screen.getByText('No recorded figure answers this question.')).toBeInTheDocument();
});
