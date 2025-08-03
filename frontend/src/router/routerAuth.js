// client/src/router/routerAuth.js
import { Navigate } from 'react-router-dom'

export const RouterAuth = ({ children }) => {
    const token = localStorage.getItem('token')
    if (!token) {
        return <Navigate to='/signup' replace /> // signup
    }
    return (
        children
    )
}