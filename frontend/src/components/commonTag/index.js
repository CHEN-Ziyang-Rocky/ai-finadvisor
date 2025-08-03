import React from 'react'
import { Space, Tag } from 'antd';
import './index.css'
import { useSelector, useDispatch } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom';
import { closeTab, setCurrentMenu } from '../../store/reducers/tab'

const CommonTag = () => {
    const tabsList = useSelector(state => state.tab.tabsList)
    const currentMenu = useSelector(state => state.tab.currentMenu)
    const dispatch = useDispatch()
    const action = useLocation()
    const navigate = useNavigate()
    const handleClose = (tag, index) => {
        let length = tabsList.length - 1
        dispatch(closeTab(tag))
        if (tag.path !== action.pathname) {
            return
        }
        if (index === length) {
            const curData = tabsList[index - 1]
            dispatch(setCurrentMenu(curData))
            navigate(curData.path)
        } else {
            if (tabsList.length > 1) {
                const nextData = tabsList[index + 1]
                dispatch(setCurrentMenu(nextData))
                navigate(nextData.path)
            }
        }
    }
    const handleChange = (tag) => {
        dispatch(setCurrentMenu(tag))
        navigate(tag.path)
    }
    const setTag = (flag, item, index) => {
        return (
            flag ?
                <Tag color="#55acee" closeIcon onClose={() => handleClose(item, index)} key={item.name}>{item.label}</Tag>
                :
                <Tag onClick={() => handleChange(item)} key={item.name}>{item.label}</Tag>
        )
    }
    return (
        <Space className="common-tag" size={[0, 8]} wrap>
            {currentMenu && tabsList.map((item, index) => (
                setTag(currentMenu.path === item.path, item, index)
            ))}
        </Space>
    )
}

export default CommonTag