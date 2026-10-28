import React, {useState} from 'react';
import {Box, Typography, ToggleButton, ToggleButtonGroup} from '@mui/material';
import {PieChart,Pie,Cell,ResponsiveContainer,Tooltip} from 'recharts';
const colors=['#087f80','#667caa','#b58835','#97729d','#648f70','#bd796b','#517ba4','#8b8f5f','#8b6a50','#758a96'];
export default function AllocationDonut({tickers,weights,industries}){
 const [mode,setMode]=useState('stocks');
 const items=(mode==='industry'&&industries?Object.entries(industries):tickers.map((t,i)=>[t,weights[i]])).filter(([,w])=>w>1e-8).map(([name,value])=>({name,value}));
 return <Box sx={{my:2}}>
 {industries&&<ToggleButtonGroup size="small" exclusive value={mode} onChange={(_,v)=>v&&setMode(v)} aria-label="Allocation breakdown"><ToggleButton value="stocks">Stocks</ToggleButton><ToggleButton value="industry">Industries</ToggleButton></ToggleButtonGroup>}
 <Box className="donut-layout">
 <Box sx={{height:270,position:'relative',minWidth:0}} role="img" aria-label={`Allocation: ${items.map(i=>`${i.name} ${(i.value*100).toFixed(1)}%`).join(', ')}`}>
 <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={items} dataKey="value" nameKey="name" innerRadius={75} outerRadius={110} paddingAngle={items.length>1?2:0} isAnimationActive={false}>{items.map((i,n)=><Cell key={i.name} fill={colors[n%colors.length]}/>)}</Pie><Tooltip formatter={v=>`${(v*100).toFixed(2)}%`}/></PieChart></ResponsiveContainer>
 <Box sx={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',pointerEvents:'none'}}><Typography variant="h5">{items.length}</Typography><Typography variant="body2" color="text.secondary">{mode==='stocks'?'holdings':'industries'}</Typography></Box>
 </Box>
 <Box>{items.map((item,n)=><Box key={item.name} sx={{display:'flex',gap:1,alignItems:'center',py:.8,borderBottom:'1px solid #edf1f3'}}><span style={{background:colors[n%colors.length],width:10,height:10,borderRadius:3,flexShrink:0}}/><Typography sx={{flex:1}}>{item.name}</Typography><strong>{(item.value*100).toFixed(1)}%</strong></Box>)}</Box>
 </Box></Box>;
}
