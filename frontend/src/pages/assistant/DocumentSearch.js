import React, {useState} from 'react';
import {Alert, Button, Checkbox, FormControlLabel, Paper, TextField, Typography} from '@mui/material';
import api from '../../api';

export default function DocumentSearch({capabilities}) {
  const [question,setQuestion] = useState('');
  const [consent,setConsent] = useState(false);
  const [result,setResult] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const live = Boolean(capabilities?.live_enabled && consent);
      const {data} = await api.post('/assistant/documents', {
        question:question.trim(), mode:live ? 'llm' : 'workflow', consent:live
      });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Document search is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return <Paper component="section" className="research-card" sx={{mt:3}}>
    <Typography variant="h5" component="h2">Ask the research library</Typography>
    <p>Search the portfolio methodology and selected figures from Table 5.4 of the Federal Reserve’s 2024 annual report.</p>
    <form onSubmit={submit}>
      <TextField fullWidth label="Document question" placeholder="How does inflation affect real wealth?" value={question}
        onChange={e=>setQuestion(e.target.value)} disabled={busy} inputProps={{maxLength:500}}/>
      {capabilities?.live_enabled && <FormControlLabel control={<Checkbox checked={consent} disabled={busy}
        onChange={e=>setConsent(e.target.checked)}/>} label={`Let ${capabilities.provider} read this question and public passages to select supporting evidence`}/>}
      <Button type="submit" disabled={busy || !question.trim() || !capabilities}>{busy ? 'Searching…' : consent ? 'Find a cited answer' : 'Search sources'}</Button>
    </form>
    {error && <Alert severity="error">{error}</Alert>}
    {result && <div aria-live="polite"><h3>{result.question}</h3>
      <p>{result.status === 'insufficient' ? 'Insufficient evidence in the indexed documents.' :
        result.mode === 'llm' ? `Supporting passages selected by ${result.model}` : 'Closest source passages · keyword search'}</p>
      {result.evidence.map(p=><div key={p.id}><blockquote>{p.text}</blockquote><a href={p.url} target="_blank" rel="noreferrer">{p.title} · {p.version} · {p.locator}</a></div>)}
    </div>}
  </Paper>;
}
