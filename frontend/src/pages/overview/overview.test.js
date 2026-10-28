import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import Overview from './index';
import api,{fetchAvailableAssets} from '../../api';
jest.mock('../../api',()=>({__esModule:true,default:{get:jest.fn()},fetchAvailableAssets:jest.fn()}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn()}));
jest.mock('../../components/research/AllocationDonut',()=>()=> <div>Allocation chart</div>);
jest.mock('../../components/research/MarketWidget',()=>()=> <div>Provider widget</div>);
test('overview masks amounts and honestly marks outdated research data',async()=>{
 api.get.mockResolvedValue({data:{profile:{age:30,income:100000,asset:200000,education_level:4,occupation:1,married:false,kids:0,risk:null,risk_tolerance:.3},portfolio:null,latest_run:null}});
 fetchAvailableAssets.mockResolvedValue({as_of:'2025-02-28',freshness:{stale:true,expected_through:'2026-09-30',update_status:'pending_source'}});
 render(<Overview/>);
 expect(await screen.findByText('An ongoing data source is not configured yet.',{exact:false})).toBeInTheDocument();
 expect(screen.queryByText('$100,000')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Show amounts'}));
 expect(screen.getByText('$100,000')).toBeInTheDocument();expect(screen.getByText('Not recorded')).toBeInTheDocument();
});
