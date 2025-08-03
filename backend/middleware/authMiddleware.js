// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from heade
    if (!token) {
        return res.status(401).json({ message: 'No token provided.' }); // Unauthorized
    }
    try { // Verify the token using the secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach decoded user information to the request object
        // Extract user's public key
        req.userPublicKey = req.body.publicKey || req.query.publicKey;

        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token.' }); // Forbidden
    }
};

module.exports = authMiddleware;


