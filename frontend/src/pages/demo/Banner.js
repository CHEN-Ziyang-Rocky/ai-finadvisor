import React,{useState} from 'react';
import {Alert,Button} from '@mui/material';
import {demoToken,demoRequest,exitDemo} from '../../utils/demo';
export default function DemoBanner(){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmReset,setConfirmReset]=useState(false);
 if(!demoToken())return null;
 async function action(reset){setBusy(true);try{if(reset){await demoRequest('/reset');window.location.reload();}else await exitDemo();}catch{setError('Action failed. Please retry.');setBusy(false);}}
 return <><Alert severity="info" sx={{mb:2}}>Demo mode · Sample data. First results are precomputed; calculations use a frozen historical sample through 2026-09-30. Research only, not investment advice. Demo limits: 500 paths, 20 years, two portfolios.<Button disabled={busy} onClick={()=>setConfirmReset(true)}>Reset demo</Button>{confirmReset&&<span>Restore the initial fictional profile and precomputed results? <Button disabled={busy} onClick={()=>action(true)}>Confirm reset</Button><Button onClick={()=>setConfirmReset(false)}>Cancel</Button></span>}<Button disabled={busy} onClick={()=>action(false)}>Exit demo</Button></Alert>{error&&<Alert severity="error">{error}</Alert>}</>;
}
