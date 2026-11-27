import React,{useState} from 'react';
import {Alert,Button,Checkbox,FormControlLabel,Paper,TextField} from '@mui/material';
import api from '../../api';
import {downloadCalculation} from '../../components/research/CalculationRecord';

const reviewExample='Explain turnover in my current allocation.';
const trialExample='Test the holding cap and explain the turnover trade-off.';

export default function ResearchAgent({capabilities,attachment}) {
  const [question,setQuestion]=useState(attachment?'How is this figure calculated?':reviewExample);
  const [allowTrial,setAllowTrial]=useState(false);
  const [cap,setCap]=useState('35');
  const [live,setLive]=useState(false);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setResult(null); setError('');
    try {
      const consent=Boolean(capabilities?.live_enabled && live);
      const {data}=await api.post('/assistant/agent',{
        question:question.trim(),...(attachment?{saved_receipt:attachment.receipt,metric:attachment.metric}:{}),...(allowTrial?{cap_pct:Number(cap)}:{}),allow_trial:allowTrial,consent,mode:consent?'llm':'workflow'
      },{timeout:105000});
      setResult(data);
    } catch(e) {
      setError(e.response?.data?.error || 'Research run unavailable. Please retry.');
    } finally { setBusy(false); }
  }
  return <Paper className="research-card" component="section" id="portfolio-study" sx={{my:2}}>
    <h2>Portfolio research agent</h2>
    <p>Ask about your current allocation or test a holding cap. Each run includes the calculation evidence and a method reference.</p>
    {attachment && <p>Attached calculation {attachment.receipt.slice(0,12)} · {attachment.metric}. To start a new trial, choose “Latest allocation” in the saved report reader.</p>}
    <form onSubmit={submit}>
      <TextField fullWidth label="Research question" value={question} disabled={busy}
        inputProps={{maxLength:500}} onChange={e=>setQuestion(e.target.value)}/>
      <FormControlLabel control={<Checkbox checked={allowTrial} disabled={busy||Boolean(attachment)} onChange={e=>{
        const enabled=e.target.checked;
        setAllowTrial(enabled);
        if (question===(enabled?reviewExample:trialExample)) setQuestion(enabled?trialExample:reviewExample);
      }}/>}
        label="Allow a holding-cap simulation for this run"/>
      {allowTrial && <TextField sx={{my:2}} label="Trial cap (%)" type="number" required value={cap} disabled={busy}
        inputProps={{min:10,max:100,step:'any'}} onChange={e=>setCap(e.target.value)}/>}
      {capabilities?.live_enabled && <FormControlLabel control={<Checkbox checked={live} disabled={busy} onChange={e=>setLive(e.target.checked)}/>}
        label={`Let ${capabilities.provider} plan the steps using this question and computed portfolio metrics`}/>}
      <div><Button variant="outlined" type="submit" disabled={!capabilities||busy||!question.trim()}>{busy?'Running study…':live?'Run with model planner':'Run with local workflow'}</Button></div>
    </form>
    {error && <Alert severity="error">{error}</Alert>}
    {result && <div aria-live="polite">
      <h3>{result.question}</h3>
      <p>{result.model || 'Local workflow'} · {result.status}{result.trace.some(step=>step.step==='compare_cap' && step.receipt) && ` · Simulated cap ${result.cap_pct}%`}</p>
      <Alert severity={result.status==='completed'?'success':'warning'}>{result.reason}</Alert>
      {result.needs_saved_report && <a href="#saved-report">Open saved report reader</a>}
      {result.focus && <div><strong>{result.focus.label} · {result.focus.unit==='percent'?(result.focus.value*100).toFixed(2)+'%':result.focus.value.toFixed(2)}</strong>
        <p>{result.focus.explanation} {result.focus.window.start} – {result.focus.window.end} · {result.focus.window.months} months.</p>
        <small>Attached calculation {result.saved_receipt.slice(0,12)} · {result.focus.path}</small></div>}
      {result.context && <p>Estimation window {result.context.start} – {result.context.end} · {result.context.observations} monthly observations</p>}
      {result.comparison?.some(row=>row.label==='Evaluated annual growth') && <p>
        In the rolling historical comparison, {result.comparison.filter(row=>['Evaluated annual growth','Evaluated annual volatility','Evaluated monthly turnover'].includes(row.label)).map(row=>
          row.label.replace('Evaluated ','')+' '+(Math.abs(row.delta)<0.005?'was unchanged at displayed precision':(row.delta>0?'rose':'fell')+' by '+Math.abs(row.delta).toFixed(2)+' percentage points')).join(', ')}.
      </p>}
      {result.comparison?.length>0 && <div style={{overflowX:'auto'}}><table><caption>Change from the saved allocation</caption><thead><tr><th>Measure</th><th>Saved</th><th>Trial</th><th>Difference</th></tr></thead>
        <tbody>{result.comparison.map(row=>{
          const format=value=>row.unit==='pp'?(value*100).toFixed(2)+'%':value.toFixed(2);
          return <tr key={row.label}><th>{row.label}</th><td>{format(row.baseline.value)}</td><td>{format(row.trial.value)}</td><td>{row.delta.toFixed(2)} {row.unit}</td></tr>;
        })}</tbody></table></div>}
      {result.facts && <details open={!result.comparison?.length}><summary>Verified portfolio figures</summary><ul>{result.facts.map(f=><li key={f.id}>{f.text} <small>{f.source.path}</small></li>)}</ul></details>}
      {result.citation && <p>{result.citation.text} <a href={result.citation.url} target="_blank" rel="noreferrer">{result.citation.title} · {result.citation.locator}</a></p>}
      {result.limitations?.map(item=><p key={item.id}>{item.text}</p>)}
      <details><summary>Run steps and receipts</summary><ol>{result.trace.map((t,i)=><li key={i}>{[t.step,t.selected,t.topic,t.receipt,t.outcome].filter(Boolean).join(' · ')}</li>)}</ol>
        <p>{result.elapsed_ms} ms · {result.usage?.requests || 0} model requests</p></details>
      <Button onClick={()=>downloadCalculation({...result,calculation:{kind:'research-study',calculation_id:result.run_id}})}>Download study record</Button>
    </div>}
  </Paper>;
}
