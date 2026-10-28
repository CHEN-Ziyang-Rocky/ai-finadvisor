import React from 'react';
import {Box,Typography} from '@mui/material';
const config={
 market:{script:'embed-widget-market-overview.js',options:{colorTheme:'light',dateRange:'12M',showChart:true,locale:'en',width:'100%',height:430,isTransparent:true,showSymbolLogo:true,tabs:[{title:'US markets',symbols:[{s:'FOREXCOM:SPXUSD',d:'US 500 — index CFD'},{s:'FOREXCOM:NSXUSD',d:'US 100 — index CFD'},{s:'FOREXCOM:DJI',d:'US 30 — index CFD'}]}]}},
 news:{script:'embed-widget-timeline.js',options:{feedMode:'all_symbols',isTransparent:true,displayMode:'regular',width:'100%',height:430,colorTheme:'light',locale:'en'}}
};
export default function MarketWidget({kind}){
 const item=config[kind];
 // Direct provider-origin frames can use their own storage, but never the app's origin.
 // Never combine srcDoc with allow-same-origin: that would grant access to account tokens.
 const widget=kind==='market'?'market-overview':'timeline';
 const options={...item.options,utm_source:'finance.imrocky.com',utm_medium:'widget',utm_campaign:widget,'page-uri':'https://finance.imrocky.com/overview'};
 const source=`https://www.tradingview-widget.com/embed-widget/${widget}/?locale=en#${encodeURIComponent(JSON.stringify(options))}`;
 return <Box><iframe title={kind==='market'?'TradingView market overview':'TradingView market news'} src={source} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" style={{width:'100%',height:440,border:0}}/><Typography variant="caption" color="text.secondary">Market information supplied by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a>. Availability and delays depend on the instrument. {kind==='market'?'These are index-linked CFD quotes, not the cash indices. ':''}This feed is separate from the dataset used in portfolio calculations. If unavailable, open the provider link.</Typography></Box>;
}
