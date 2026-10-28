// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const sessions = require('../controllers/store');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.match(/^Bearer ([^ ]+)$/)?.[1]; // Extract token from heade
    if (!token) {
        return res.status(401).json({ message: 'No token provided.' }); // Unauthorized
    }
    try { // Verify the token using the secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (typeof decoded.id !== 'string' || !decoded.id) {
            return res.status(403).json({ message: 'Invalid token subject.' });
        }
        const entry = decoded.sid && sessions.get(decoded.sid);
        const session = typeof entry === 'string' ? JSON.parse(entry) : entry;
        if (!session || session.userId !== decoded.id) {
            return res.status(401).json({ message: 'Session expired. Please log in again.' });
        }
        const suppliedSession = req.body?.SessionKeyId || req.query?.SessionKeyId;
        if (suppliedSession && suppliedSession !== decoded.sid) return res.status(403).json({ message: 'Session does not match token.' });
        req.user = decoded; // Attach decoded user information to the request object
        // Extract user's public key
        req.userPublicKey = req.body?.publicKey || req.query?.publicKey;

        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token.' }); // Forbidden
    }
};

module.exports = authMiddleware;


