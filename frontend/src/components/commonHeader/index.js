// client/src/components/commonHeader/index.js
import React from 'react'
import { Button, Layout, Dropdown, Avatar } from 'antd';
import { MenuUnfoldOutlined, MenuFoldOutlined, UserOutlined } from '@ant-design/icons';
import './index.css'
import { useDispatch } from "react-redux";
import { collapseMenu } from '../../store/reducers/tab'
import { useNavigate } from 'react-router-dom'
import { getKeyFromIndexedDB, deleteKeyFromIndexedDB } from '../../utils/cryptoUtils';
import { Logout } from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const { Header } = Layout

const CommonHeader = ({ collapsed }) => {
  const { logout: clearAuth } = useAuth();
  const dispatch = useDispatch()
  const setCollapsed = () => {
    dispatch(collapseMenu())
  }
  const navigate = useNavigate()
  const logout = async () => {
    try {
      const sessionKeyId = await getKeyFromIndexedDB('SessionKeyId');
      if (sessionKeyId) await Logout(sessionKeyId);
    } catch (error) {
      console.warn('Session already unavailable', error.message);
    } finally {
      clearAuth();
      await Promise.all(['publicKey', 'privateKey', 'wrappingKey', 'SessionserverPublicKey', 'SessionKeyId'].map(deleteKeyFromIndexedDB));
      navigate('/login');
    }
  }
  const items = [
    {
      key: '1',
      label: (
        <Button type="text" onClick={() => navigate("/user")}>
          User Portrait
        </Button>
      ),
    },
    {
      key: '2',
      label: (
        <Button type="text" onClick={logout}>
          Exit
        </Button>
      ),
    }
  ]


  return (
    <Header className="header-container">
      <Button
        type="text"
        aria-label="Toggle navigation"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed(!collapsed)}
        style={{
          fontSize: '16px',
          width: 64,
          height: 32,
          backgroundColor: '#fff'
        }}
      />
      <span className="header-label">RESEARCH / WORKSPACE</span>
      <Dropdown
        trigger={['click']}
        menu={{ items }}
      >
        <Button type="text" aria-label="Account menu">
          <Avatar size={32} icon={<UserOutlined />} style={{background:"#e5f1ef",color:"#087f80"}} />
        </Button>
      </Dropdown>
    </Header>
  )
}

export default CommonHeader