// client/src/components/commonHeader/index.js
import React from 'react'
import { Button, Layout, Dropdown, Avatar, Space } from 'antd';
import { MenuUnfoldOutlined, MenuFoldOutlined } from '@ant-design/icons';
import './index.css'
import { useDispatch } from "react-redux";
import { collapseMenu } from '../../store/reducers/tab'
import { useNavigate } from 'react-router-dom'
import { getKeyFromIndexedDB, deleteKeyFromIndexedDB } from '../../utils/cryptoUtils';
import { Logout } from '../../api';

const { Header } = Layout

const CommonHeader = ({ collapsed }) => {
  const dispatch = useDispatch()
  const setCollapsed = () => {
    dispatch(collapseMenu())
  }
  const navigate = useNavigate()
  const items = [
    {
      key: '1',
      label: (
        <a target="_blank" rel="noopener noreferrer">
          User Portrait
        </a>
      ),
    },
    {
      key: '2',
      label: (
        <a onClick={() => logout(!collapsed)} target="_blank" rel="noopener noreferrer" >
          Exit
        </a>
      ),
    }
  ]

  const logout = async () => {
    const sessionKeyId = await getKeyFromIndexedDB('SessionKeyId');
    const response = await Logout(sessionKeyId);
    console.log('Server logout response:', response);
    localStorage.removeItem('token')
    await deleteKeyFromIndexedDB('publicKey');
    await deleteKeyFromIndexedDB('privateKey');
    await deleteKeyFromIndexedDB('SessionserverPublicKey');
    await deleteKeyFromIndexedDB('SessionKeyId');
    navigate('/login')
  }
  return (
    <Header className="header-container">
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed(!collapsed)}
        style={{
          fontSize: '16px',
          width: 64,
          height: 32,
          backgroundColor: '#fff'
        }}
      />
      <Dropdown
        menu={{ items }}
      >
        <a onClick={(e) => e.preventDefault()}>
          <Avatar size={36} src={<img src={require("../../assets/images/user.jpg")} />} />
        </a>
      </Dropdown>
    </Header>
  )
}

export default CommonHeader