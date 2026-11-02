import DemoBanner, { DEMO_DESCRIPTION } from './demo/Banner'
import { demoToken } from '../utils/demo'
import { ThemeProvider } from '@mui/material/styles'
import researchTheme from './researchTheme'
import './research.css'
import React from 'react'
import { Outlet } from 'react-router-dom';
import { Layout, Grid } from 'antd'
import CommonHeader from '../components/commonHeader'
import CommonAside from '../components/commonAside';
import { useSelector } from 'react-redux'
import { RouterAuth } from '../router/routerAuth'

const { Content } = Layout

const Main = () => {
  const menuCollapsed = useSelector(state => state.tab.isCollapse)
  const screens = Grid.useBreakpoint()
  const collapsed = menuCollapsed || !screens.md

  return (
    <RouterAuth>
      <ThemeProvider theme={researchTheme}><Layout className="main-container research-shell">
        <CommonAside collapsed={collapsed} />
        <Layout style={{ minWidth: 0 }}>
          <div className="app-chrome" data-app-chrome>
            <CommonHeader collapsed={collapsed} />
            <DemoBanner />
          </div>

          <Content
            style={{
              padding: screens.md ? 24 : 12,
              margin: 0,
              minHeight: 280
            }}
          >
            <p className="research-notice">{demoToken() ? DEMO_DESCRIPTION : 'Research demo · Use fictional personal inputs; results are historical or simulated and are not investment advice.'}</p>
            <Outlet />
          </Content>

        </Layout>
      </Layout></ThemeProvider>
    </RouterAuth>
  )
}

export default Main
