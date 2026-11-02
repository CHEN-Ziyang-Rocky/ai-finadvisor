import React,{useState} from 'react';
import {Alert,Box,Button,Stack,Typography} from '@mui/material';
import {demoToken,demoRequest,exitDemo} from '../../utils/demo';
export const DEMO_DESCRIPTION = 'First results are precomputed; calculations use a frozen historical sample through 2026-09-30. Research only, not investment advice. Use fictional personal inputs. Demo limits: 500 paths, 20 years, two portfolios.';
export default function DemoBanner(){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmReset,setConfirmReset]=useState(false);
 if(!demoToken())return null;
 async function action(reset){setBusy(true);try{if(reset){await demoRequest('/reset');window.location.reload();}else await exitDemo();}catch{setError('Action failed. Please retry.');setBusy(false);}}
 return <><Box role="region" aria-label="Demo controls" sx={{px:{xs:1.5,md:3},py:0.75,bgcolor:'#eaf5fb',borderBottom:'1px solid #dce8ee'}}>
  <Stack direction="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1}>
   <Box><Typography sx={{fontSize:12,fontWeight:600}}>Demo mode · Sample data</Typography><Typography sx={{fontSize:11,color:'#526f7c'}}>Not investment advice</Typography></Box>
   <Stack direction="row" sx={{'& .MuiButton-root':{minWidth:0,minHeight:44,px:1,fontSize:11}}}><Button disabled={busy} onClick={()=>setConfirmReset(true)}>Reset demo</Button><Button disabled={busy} onClick={()=>action(false)}>Exit demo</Button></Stack>
  </Stack>
  {confirmReset&&<Box sx={{py:1}}><Typography variant="body2">Restore the initial fictional profile and precomputed results?</Typography><Button disabled={busy} onClick={()=>action(true)}>Confirm reset</Button><Button onClick={()=>setConfirmReset(false)}>Cancel</Button></Box>}
 </Box>{error&&<Alert severity="error">{error}</Alert>}</>;
}
