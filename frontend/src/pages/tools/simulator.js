import { demoToken } from '../../utils/demo';
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
    Typography, Alert, Button, LinearProgress,
    Tabs,
    Tab,
    Box,
    Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import InvestorForm from './InvestorForm';
import SimulationResults from './SimulationResults';
import QuickSimulation from './QuickSimulation';
import api from '../../api';
import HoldingsImport from '../../holdings/HoldingsImport';
import ModelGuide from '../../components/research/ModelGuide';

// Simple TabPanel helper
const TabPanel = (props) => {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            <Box sx={{ p: { xs: 0, md: 3 } }}>{children}</Box>
        </div>
    );
};

export default function User() {
    const { state } = useLocation();
    const [portfolio, setPortfolio] = useState(state?.portfolio || null);
    const [loadingPortfolio, setLoadingPortfolio] = useState(!state?.portfolio);
    const [portfolioError, setPortfolioError] = useState('');
    useEffect(() => {
        let active = true;
        if (state?.portfolio) { setPortfolio(state.portfolio); setLoadingPortfolio(false); return; }
        api.get('/saved-portfolio').then(({data}) => { if(active) setPortfolio(data.portfolio); })
            .catch(()=>{if(active) setPortfolioError('Saved portfolio could not be loaded. You can return to your profile or try again later.');})
            .finally(()=>{if(active) setLoadingPortfolio(false);});
        return ()=>{active=false;};
    }, [state]);
    const [predictionData, setPredictionData] = useState(null);
    const [activeTab, setActiveTab] = useState(0);
    const [imported,setImported]=useState(null);
    const selected=imported || portfolio;
    const [restored, setRestored] = useState(false);
    const portfolioRevision = useRef(0);
    const renderingRevision = portfolioRevision.current;
    function changePortfolio(next) {
        portfolioRevision.current += 1;
        setImported(next);
        setPredictionData(null);
        setRestored(false);
    }
    useEffect(()=>{if(!demoToken())return;let active=true;api.get('/simulation').then(({data})=>{if(active && portfolioRevision.current === 0){setPredictionData(data.result);setActiveTab(1);setRestored(true);}}).catch(()=>{if(active)setPortfolioError('Saved demo simulation unavailable. Try calculating again.');});return()=>{active=false;};},[]);

    const handlePredictionComplete = (data) => {
        if (renderingRevision !== portfolioRevision.current) return;
        setRestored(false);
        setPredictionData(data);
        setActiveTab(1);
    };

    return (
        <Box className="simulation-page" sx={{ width: '100%' }}>
            <div className="research-hero"><div><div className="eyebrow">SCENARIO LAB</div><h1>Explore possible futures.</h1><p>Compare portfolio paths, cash flows and purchasing power under explicit assumptions.</p></div></div>
            <ModelGuide />
            {restored && <Alert severity="info">Restored saved demo result. Initial results were precomputed with the existing engine; use Configure to run a new calculation.</Alert>}
            <Tabs value={activeTab} onChange={(e, newVal) => setActiveTab(newVal)}>
                <Tab label="Configure" />
                <Tab label="Results" disabled={!predictionData} />
            </Tabs>

            {/* Configuration Form */}
            <TabPanel value={activeTab} index={0}>
                {loadingPortfolio ? <LinearProgress aria-label="Loading saved portfolio"/> : <>
                    {portfolioError && <Alert severity="warning">{portfolioError}</Alert>}
                    <Accordion TransitionProps={{unmountOnExit:true}}><AccordionSummary expandIcon={<span>+</span>}>Import holdings from a file</AccordionSummary><AccordionDetails><HoldingsImport onUse={changePortfolio}/></AccordionDetails></Accordion>
                    {imported && <Alert severity="info">Using reviewed holdings dated {imported.as_of} for this simulation. <Button onClick={()=>changePortfolio(null)}>Clear imported holdings</Button></Alert>}
                    {selected ? <QuickSimulation key={JSON.stringify(selected)} portfolio={selected} onPredictionComplete={handlePredictionComplete}/> : <Box className="research-card" sx={{my:3}}><Typography variant="h5">Start with a portfolio.</Typography><Typography sx={{my:2}}>Choose assets and build your allocation first. It will appear here automatically, including on your next visit.</Typography><Button component={Link} to="/user" variant="contained">Build a portfolio</Button></Box>}
                    <Accordion TransitionProps={{unmountOnExit:true}} sx={{my:2}}><AccordionSummary expandIcon={<span>+</span>}>Advanced lab — models, withdrawals and up to three portfolios</AccordionSummary><AccordionDetails><InvestorForm key={JSON.stringify(selected)} onPredictionComplete={handlePredictionComplete} initialPortfolio={selected}/></AccordionDetails></Accordion>
                </>}
            </TabPanel>

            {/* Results Tab */}
            <TabPanel value={activeTab} index={1}>
                {predictionData?.scenarios && <SimulationResults key={predictionData.calculation?.calculation_id || JSON.stringify(predictionData.scenarios)} result={predictionData}/>}
            </TabPanel>
        </Box>
    );
}
