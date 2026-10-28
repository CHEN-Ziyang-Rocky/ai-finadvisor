import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Alert,Box,Button,LinearProgress,Paper,Typography} from '@mui/material';
import InvestorForm,{validProfile} from '../user/InvestorForm';
import api from '../../api';
const empty={age:'',kids:'',income:'',asset:'',education_level:'',occupation:'',married:'',risk:''};
export default function Profile(){
 const navigate=useNavigate(),[profile,setProfile]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{let active=true;api.get('/overview').then(({data})=>{if(active&&data.profile)setProfile({...data.profile,risk:data.profile.risk??''});}).catch(()=>{if(active)setError('Your profile could not be loaded. Refresh before making changes.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const save=async()=>{setBusy(true);setError('');try{await api.put('/profile',profile);setSaved(true);}catch(e){setError(e.response?.data?.error||'Could not save your profile.');}finally{setBusy(false);}};
 return <div className="research-page"><div className="research-hero"><div><div className="eyebrow">MY PROFILE</div><h1>Your inputs, under your control.</h1><p>Use fictional information for this research demo. Editing these inputs clears the old model score; existing portfolio weights remain saved.</p></div></div><Paper className="research-card">{loading?<LinearProgress/>:<><InvestorForm features={profile} setFeatures={update=>{setProfile(update);setSaved(false);}} disabled={busy}/>{error&&<Alert severity="error" sx={{my:2}}>{error}</Alert>}{saved&&<Alert severity="success" sx={{my:2}}>Profile saved. Re-estimate your score when you next build a portfolio.</Alert>}<Box sx={{display:'flex',gap:2}}><Button variant="contained" disabled={!validProfile(profile)||busy} onClick={save}>{busy?'Saving…':'Save profile'}</Button><Button onClick={()=>navigate('/user')}>Continue to portfolio</Button></Box><Typography variant="caption" display="block" sx={{mt:2}}>Risk willingness is your survey answer. The model's score is an observed-asset-ownership proxy, not an assessment of suitability.</Typography></>}</Paper></div>;
}
