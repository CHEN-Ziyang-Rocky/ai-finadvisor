// client/src/router/routerAuth.js
import { demoToken } from '../utils/demo'
import { Navigate } from 'react-router-dom'
import { getValidClaims } from '../utils/auth'

export const RouterAuth = ({ children }) => {
    const token = localStorage.getItem('token')
    if (!demoToken() && !getValidClaims(token)) {
        return <Navigate to='/login' replace />
    }
    return (
        children
    )
}