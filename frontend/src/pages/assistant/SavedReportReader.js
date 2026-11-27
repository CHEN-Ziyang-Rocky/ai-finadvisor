import React,{useEffect,useRef,useState} from 'react';
import {Alert,Paper} from '@mui/material';
import api from '../../api';

const formatted = f => f.unit==='percent' ? (f.value*100).toFixed(2)+'%' : f.value.toFixed(2);
const errorText = err => err.response?.data?.error || 'The saved report could not be loaded.';

function readDownloadedTrial(data) {
  if (data?.calculation?.kind!=='research-study' || data.status!=='completed' ||
      !Array.isArray(data.comparison) || !data.comparison.length || !Array.isArray(data.receipts)) {
    throw Error('Choose a completed holding-cap study exported with Download study record.');
  }
  const [saved,trial]=data.receipts;
  if (!saved?.calculation_id || !trial?.calculation_id || !Number.isFinite(trial.inputs?.max_weight)) throw Error('The comparison receipts are incomplete.');
  const rows=data.comparison.map(row=>{
    if (!row || typeof row.label!=='string' || !['pp','holdings'].includes(row.unit) ||
        ![row.baseline?.value,row.trial?.value].every(Number.isFinite) ||
        row.baseline.source?.calculation_id!==saved.calculation_id || row.trial.source?.calculation_id!==trial.calculation_id) {
      throw Error('The figures do not match the receipts in this file.');
    }
    return {label:row.label,unit:row.unit==='pp'?'percent':'count',saved:row.baseline.value,trial:row.trial.value};
  });
  return {cap:trial.inputs.max_weight,receipt:trial.calculation_id,rows,context:data.context};
}

export default function SavedReportReader({onContext}) {
  const params=new URLSearchParams(window.location.search);
  const [receipt,setReceipt]=useState(()=>params.get('receipt')||'');
  const [metric,setMetric]=useState(()=>params.get('metric')||'mean');
  useEffect(()=>{onContext?.(receipt?{receipt,metric}:null);},[onContext,receipt,metric]);
  const [reports,setReports]=useState([]);
  const [report,setReport]=useState(null);
  const [listError,setListError]=useState(''),[error,setError]=useState('');
  const [fileResult,setFileResult]=useState(null),[fileError,setFileError]=useState('');
  useEffect(()=>{
    let active=true;
    api.get('/assistant/reports').then(({data})=>{
      if(active) setReports((data.reports||[]).filter((r,i,all)=>all.findIndex(other=>other.receipt===r.receipt)===i));
    }).catch(e=>{if(active)setListError(errorText(e));});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!receipt)return;
    let active=true;
    api.get('/assistant/reports/'+encodeURIComponent(receipt)).then(({data})=>{
      if(active && data.receipt===receipt)setReport(data);
      else if(active)setError('The response did not match the selected calculation.');
    }).catch(e=>{if(active)setError(errorText(e));});
    return ()=>{active=false;};
  },[receipt]);
  useEffect(()=>{
    if(window.location.hash==='#saved-report') document.getElementById('saved-report')?.scrollIntoView?.();
  },[]);
  const fileVersion=useRef(0);
  async function openFile(event) {
    const version=++fileVersion.current;
    const input=event.target,file=input.files?.[0];
    setFileError('');setFileResult(null);
    if(!file)return;
    try{
      if(file.size>2*1024*1024)throw Error('Choose a study record under 2 MB.');
      const trial=readDownloadedTrial(JSON.parse(await file.text()));
      if(version===fileVersion.current)setFileResult(trial);
    }catch(e){if(version===fileVersion.current)setFileError(e instanceof SyntaxError?'This file is not a JSON study record.':e.message);}
    if(version===fileVersion.current)input.value='';
  }
  const figure=report?.figures?.find(f=>f.id===metric);
  return <Paper component="section" id="saved-report" className="research-card" sx={{my:2}}>
    <h2>Saved report reader</h2>
    <label>Saved allocation <select style={{maxWidth:'100%'}} value={receipt} onChange={e=>{setReceipt(e.target.value);setReport(null);setError('');}}>
      <option value="">Latest allocation (no pinned report)</option>
      {receipt && !reports.some(r=>r.receipt===receipt) && <option value={receipt}>Linked calculation · {receipt.slice(0,12)}</option>}
      {reports.map(r=><option key={r.receipt} value={r.receipt}>{new Date(r.saved_at).toLocaleString()} · {r.tickers?.join(', ')} · cap {r.cap==null?'unavailable':Math.round(r.cap*10000)/100+'%'} · {r.receipt.slice(0,8)}</option>)}
    </select></label>
    {listError && <Alert severity="warning">{listError}</Alert>}
    {!listError && !reports.length && <p>Saved allocations with calculation receipts appear here when available.</p>}
    {error && <Alert severity="warning">{error}</Alert>}
    {report && <div aria-live="polite">
      <label>Report metric <select value={metric} onChange={e=>setMetric(e.target.value)}>
        {!figure && <option value={metric}>Choose an available metric</option>}
        {report.figures.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
      </select></label>
      {figure ? <div><h3>{figure.label} · {formatted(figure)}</h3><p>{figure.explanation}</p>
        <p>{figure.window.start} – {figure.window.end} · {figure.window.months} months</p>
        <small>Calculation {report.receipt.slice(0,12)} · {figure.path}</small></div> :
        <p>This metric is unavailable in the selected report.</p>}
    </div>}
    <details><summary>Open a downloaded cap trial</summary>
      <p>Choose the JSON from Download study record. Your browser reads it locally. These figures reflect the copy you provide.</p>
      <input type="file" accept="application/json,.json" aria-label="Downloaded cap trial" onChange={openFile}/>
      {fileError && <Alert severity="warning">{fileError}</Alert>}
      {fileResult && <div><h3>Downloaded trial · {(fileResult.cap*100).toFixed(2)}% cap</h3>
        {typeof fileResult.context?.start==='string' && typeof fileResult.context?.end==='string' &&
          <p>Estimation window {fileResult.context.start} – {fileResult.context.end}</p>}
        <small>Trial calculation {String(fileResult.receipt).slice(0,12)}</small>
        <table><thead><tr><th>Metric</th><th>Saved</th><th>Trial</th></tr></thead><tbody>
          {fileResult.rows.map(row=><tr key={row.label}><th>{row.label}</th><td>{formatted({value:row.saved,unit:row.unit})}</td><td>{formatted({value:row.trial,unit:row.unit})}</td></tr>)}
        </tbody></table></div>}
    </details>
  </Paper>;
}
