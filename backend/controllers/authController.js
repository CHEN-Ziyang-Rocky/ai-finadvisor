/*
// controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

exports.signup = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }
        const existingUser = await userModel.findUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists.' });
        }        
        await userModel.createUser(username, password); // Create a new user

        return res.status(201).json({ message: 'User registered successfully.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error.' });
    }
};

// Handle user login
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }
        const user = await userModel.findUserByUsername(username); // Find the user by username
        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        const match = await bcrypt.compare(password, user.password); // Verify the password
        if (!match) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        // Generate a JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );
        return res.status(200).json({
            message: 'Login successful!',
            token,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error.' });
    }
};
*/

// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const speakeasy = require('speakeasy');
const crypto = require('crypto');
const { generateKeyPair, verifySignature, decryptMessage, encryptMessage, signMessage, deriveSharedSecret } = require('../utils/cryptoUtils');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PYTHON_SERVICE_URL = 'http://localhost:5002/api';
const secureStore = require('./store');

const longTermPrivateKeyPath = path.join(__dirname, '../keys/privateKey.pem');
const longTermPrivateKey = fs.readFileSync(longTermPrivateKeyPath, 'utf8');
// Convert PEM to DER format
const longTermPrivateKeyDer = Buffer.from(
    longTermPrivateKey
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\n/g, ''),
    'base64'
);
async function addNewVarToSessionKey(userPublicKey, SessionKeyId) {
    const entry = secureStore.get(SessionKeyId);
    if (!entry) throw new Error(`SessionKeyId ${SessionKeyId} not found`);

    let parsedEntry;
    try {
        parsedEntry = JSON.parse(entry); // Parse existing JSON string
    } catch (error) {
        // Handle legacy format (raw private key string)
        parsedEntry = { privateKey: entry };
    }

    parsedEntry.userPK = userPublicKey;
    secureStore.set(SessionKeyId, JSON.stringify(parsedEntry)); // Store as JSON string
}
async function getPrivateKey(SessionKeyId) {
    const entry = secureStore.get(SessionKeyId);
    if (!entry) {
        throw new Error(`SessionKeyId ${SessionKeyId} not found`);
    }

    let privateKey, userPK;

    // Handle encrypted JSON strings
    if (typeof entry === "string") {
        try {
            const parsedEntry = JSON.parse(entry);
            privateKey = parsedEntry.privateKey;
            userPK = parsedEntry.userPK;
        } catch (error) {
            privateKey = entry;
            userPK = null;
        }
    } else if (typeof entry === "object") {
        privateKey = entry.privateKey;
        userPK = entry.userPK;
    }

    if (!privateKey) {
        console.error("Invalid session key structure. Missing privateKey or userPK.");
        return null;
    }

    return { privateKey, userPK };
}

function isStrongPassword(password) {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isNotCommonWord = !/^[a-zA-Z]+$/.test(password);

    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSymbols && isNotCommonWord;
}
exports.generateSessionKeyPair = async (req, res) => {
    try {
        const { publicKey, privateKey } = await generateKeyPair();
        const SessionKeyId = crypto.randomUUID();
        secureStore.set(SessionKeyId, privateKey);
        const signature = await signMessage(publicKey + SessionKeyId, longTermPrivateKeyDer.toString('base64'));

        res.status(200).json({ publicKey, SessionKeyId, signature });
    } catch (error) {
        console.error('Error generating one-time key pair:', error);
        res.status(500).json({ error: 'Failed to generate one-time key pair' });
    }
};
exports.generateQRCode = async (req, res) => {
    try {
        console.log('req.body:', req.body);
        const { encryptedMessage, iv, authTag, clientPublicKey, SessionKeyId } = req.body;

        // Get the server's private key from the store
        const { privateKey: OTserverPrivateKey, publicKey: PublicKey } = await getPrivateKey(SessionKeyId);
        console.log('OTserverPrivateKey:', OTserverPrivateKey);
        if (!OTserverPrivateKey) {
            console.log("key not found");
            return res.status(400).json({ message: 'Invalid or expired SessionKeyId' });
        } else {
            console.log("key found");
        }

        // Derive shared secret using the server's private key and the client's public key
        const sharedSecret = await deriveSharedSecret(OTserverPrivateKey, clientPublicKey);

        // Decrypt the message with the derived shared secret
        const decryptedMessage = await decryptMessage(encryptedMessage, iv, authTag, sharedSecret);

        const { username, publicKey, signature } = decryptedMessage;

        // Hash the username and public key
        const hash = crypto.createHash('sha256').update(publicKey + username).digest('base64');


        // Verify the signature
        const isVerified = verifySignature(hash, signature.signature, publicKey);
        if (!isVerified) {
            return res.status(401).json({ message: 'Invalid signature' });
        } else {
            console.log("Signature verified");
        }

        // Encrypt the response data with the user's public key

        const response = await axios.post(`${PYTHON_SERVICE_URL}/generate-qr`, { username });
        const encryptedResponse = await encryptMessage(response.data, sharedSecret);
        console.log('delete SessionKeyId:', SessionKeyId);
        secureStore.delete(SessionKeyId);
        res.status(response.status).json(encryptedResponse);
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(error.response ? error.response.status : 500).json({ error: 'Failed to generate QR code' });
    }
};

exports.register = async (req, res) => {
    try {
        console.log('register:', req.body);
        const { encryptedMessage, iv, authTag, clientPublicKey, SessionKeyId } = req.body;

        // Get the server's private key from the store
        const { privateKey: OTserverPrivateKey, publicKey: PublicKey } = await getPrivateKey(SessionKeyId);
        console.log('OTserverPrivateKey:', OTserverPrivateKey);
        if (!OTserverPrivateKey) {
            console.log("key not found");
            return res.status(400).json({ message: 'Invalid or expired SessionKeyId' });
        } else {
            console.log("key found");
        }

        // Derive shared secret using the server's private key and the client's public key
        const sharedSecret = await deriveSharedSecret(OTserverPrivateKey, clientPublicKey);
        // Decrypt the message with the derived shared secret
        const decryptedMessage = await decryptMessage(encryptedMessage, iv, authTag, sharedSecret);
        const {
            username,
            password,
            totp_secret,
            publicKey,
            signature
        } = decryptedMessage;
        if (!isStrongPassword(password)) {
            console.log('Password does not meet the security requirements.');
            return res.status(400).json({ message: 'Password does not meet the security requirements.' });
        }


        // Hash the username and public key
        const hash = crypto.createHash('sha256').update(publicKey + username + totp_secret).digest('base64');

        // Verify the signature
        const isVerified = verifySignature(hash, signature.signature, publicKey);
        if (!isVerified) {
            return res.status(401).json({ message: 'Invalid signature' });
        } else {
            console.log("Signature verified");
        }

        // Validate TOTP secret
        if (!totp_secret || totp_secret.length !== 32) {
            return res.status(400).json({ message: 'Invalid TOTP secret.' });
        }
        // Validate password
        if (typeof password !== 'string' || password.trim() === '') {
            return res.status(400).json({ message: 'Invalid password format.' });
        }

        // Hash password and log
        const hashedPassword = await bcrypt.hash(password, 10);


        const responsePayload = { message: 'User registered successfully' };

        // Encrypt the response data with the user's public key
        const encryptedResponse = await encryptMessage(responsePayload, sharedSecret);

        // Create user in the database with TOTP secret
        await userModel.createUser(username, hashedPassword, totp_secret);
        secureStore.delete(SessionKeyId);
        res.status(201).json(encryptedResponse);
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(400).json({ error: 'Invalid request' });
    }
};
exports.login = async (req, res) => {
    try {
        const { encryptedMessage, clientPublicKey, iv, authTag, SessionKeyId } = req.body;

        // Add the clientPublicKey to the session data
        await addNewVarToSessionKey(clientPublicKey, SessionKeyId);
        // Get the server's private key and public key from the store
        const { privateKey: SessionserverPrivateKey, userPK: PublicKey } = await getPrivateKey(SessionKeyId);

        if (!SessionserverPrivateKey) {
            console.log("key not found");
            return res.status(400).json({ message: 'Invalid or expired SessionKeyId' });
        } else {
            console.log("key found");
        }

        // Derive shared secret using the server's private key and the client's public key
        const sharedSecret = await deriveSharedSecret(SessionserverPrivateKey, PublicKey);

        // Decrypt the message with the derived shared secret
        const decryptedMessage = await decryptMessage(encryptedMessage, iv, authTag, sharedSecret);
        // Extract the inner message and signature
        const { message, signedMessage } = decryptedMessage;
        const { publicKey: userPublicKey } = decryptedMessage;
        if (!message || !signedMessage) {
            return res.status(400).json({ message: 'Decrypted message is missing.' });
        }

        const { username, password, totp_code } = message;

        // Concatenate the values and hash them
        const concatenatedMessage = username + password + totp_code + userPublicKey;
        const messageHash = crypto.createHash('sha256').update(concatenatedMessage).digest('hex');

        const { signature } = signedMessage;
        // Verify the signature
        const isVerified = verifySignature(messageHash, signature, userPublicKey);
        if (!isVerified) {
            return res.status(401).json({ message: 'Invalid signature' });
        } else {
            console.log("Signature verified");
        }

        if (!username || !password || !totp_code) {
            console.log('Missing required fields.');
            return res.status(400).json({ message: 'Missing required fields.' });
        }

        const user = await userModel.findUserByUsername(username);
        if (!user) {
            console.log('Invalid username .');
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            console.log('Invalid password.');
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const isTotpValid = speakeasy.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token: totp_code
        });

        if (!isTotpValid) {
            console.log('Invalid TOTP code.');
            return res.status(401).json({ message: 'Invalid TOTP code.' });
        }

        console.log('passed all checks');

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });

        // Define the response payload
        const responsePayload = { token };

        // Encrypt the response
        const encryptedResponse = await encryptMessage(responsePayload, sharedSecret);


        res.json(encryptedResponse);
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.logout = async (req, res) => {
    try {
        console.log('logout:', req.body);
        const { encryptedMessage, iv, authTag, clientPublicKey, SessionKeyId } = req.body;

        if (!SessionKeyId) {
            return res.status(400).json({ message: 'Session key ID is required' });
        }

        // Get the server's private key and user public key from the store
        const { privateKey: serverPrivateKey, userPK: userPublicKey } = await getPrivateKey(SessionKeyId);
        if (!serverPrivateKey) {
            return res.status(400).json({ message: 'Invalid or expired SessionKeyId' });
        }

        if (!userPublicKey) {
            return res.status(400).json({ message: 'User public key is required' });
        }

        // Derive shared secret using the server's private key and the user's public key
        const sharedSecret = await deriveSharedSecret(serverPrivateKey, userPublicKey);

        // Decrypt the message with the derived shared secret
        const decryptedMessage = await decryptMessage(encryptedMessage, iv, authTag, sharedSecret);

        const { sessionKeyId } = decryptedMessage;
        if (!sessionKeyId) {
            return res.status(400).json({ message: 'Session key ID is required' });
        }

        secureStore.delete(sessionKeyId);
        console.log('Session key deleted:', sessionKeyId);
        const deletedEntry = secureStore.get(sessionKeyId);
        if (deletedEntry) {
            console.error('Failed to delete session key:', sessionKeyId);
            return res.status(500).json({ message: 'Failed to delete session key' });
        } else {
            console.log('Session key successfully deleted:', sessionKeyId);
        }
        return res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error.' });
    }
};
// Add new routes to read and write to the table
exports.getExpenseIncome = async (req, res) => {
    try {
        const user_id = req.user.id; // Get user ID from JWT token
        const expenses_income = await userModel.getExpenseIncome(user_id);
        return res.status(200).json(expenses_income);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error.' });
    }
};

exports.setGoal = async (req, res) => {
    try {
        const { goalType, goalAmount, startDate, endDate } = req.body;
        const userid = req.user.id;
        await userModel.setGoal(userid, goalType, goalAmount, startDate, endDate);
        return res.status(201).json({ message: 'Data added successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error.' });
    }
};

exports.getGoals = async (req, res) => {
    try {
        const userid = req.user.id;
        const goals = await userModel.getGoals(userid);
        return res.status(200).json(goals);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error.' });
    }
};