// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const crypto = require('crypto');
const { generateKeyPair, verifySignature, decryptMessage, encryptMessage, signMessage, deriveSharedSecret } = require('../utils/cryptoUtils');
const fs = require('fs');
const path = require('path');
const secureStore = require('./store');

const longTermPrivateKeyPath = process.env.SIGNING_PRIVATE_KEY_PATH || path.join(__dirname, '../keys/privateKey.pem');
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

    return typeof password === 'string' && password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSymbols && isNotCommonWord;
}
exports.generateSessionKeyPair = async (req, res) => {
    try {
        const { publicKey, privateKey } = await generateKeyPair();
        const SessionKeyId = crypto.randomUUID();
        secureStore.set(SessionKeyId, privateKey);
        const signature = await signMessage(publicKey + SessionKeyId, longTermPrivateKeyDer.toString('base64'));

        res.status(200).json({ publicKey, SessionKeyId, signature });
    } catch (error) {
        console.error('Session setup failed:', error.code || error.name);
        res.status(500).json({ error: 'Failed to generate one-time key pair' });
    }
};
exports.register = async (req, res) => {
    try {
        const { encryptedMessage, iv, authTag, clientPublicKey, SessionKeyId } = req.body;

        // Get the server's private key from the store
        const { privateKey: OTserverPrivateKey, publicKey: PublicKey } = await getPrivateKey(SessionKeyId);
        if (!OTserverPrivateKey) {
            return res.status(400).json({ message: 'Invalid or expired SessionKeyId' });
        }

        // Derive shared secret using the server's private key and the client's public key
        const sharedSecret = await deriveSharedSecret(OTserverPrivateKey, clientPublicKey);
        // Decrypt the message with the derived shared secret
        const decryptedMessage = await decryptMessage(encryptedMessage, iv, authTag, sharedSecret);
        const {
            username,
            password,
            publicKey,
            signature
        } = decryptedMessage;
        const validUsername = typeof username === 'string' && username.length >= 3 && username.length <= 50 &&
            (/^[a-zA-Z0-9_.-]+$/.test(username) || /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(username));
        if (!validUsername) {
            return res.status(400).json({ message: 'Enter a username or email address (3-50 characters).' });
        }
        if (!isStrongPassword(password)) {
            return res.status(400).json({ message: 'Password does not meet the security requirements.' });
        }


        // Hash the username and public key
        const hash = crypto.createHash('sha256').update(publicKey + username).digest('base64');

        // Verify the signature
        const isVerified = await verifySignature(hash, signature.signature, publicKey);
        if (!isVerified) {
            return res.status(401).json({ message: 'Invalid signature' });
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

        // Create a password-only account; legacy TOTP data is left unchanged.
        await userModel.createUser(username, hashedPassword);
        secureStore.delete(SessionKeyId);
        res.status(201).json(encryptedResponse);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This username or email is already registered. Please log in.' });
        }
        // Avoid logging database query parameters or authentication payloads.
        console.error('Registration failed:', error.code || error.name);
        res.status(400).json({ message: 'Registration failed. Please try again.' });
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
            return res.status(400).json({ message: 'Invalid or expired SessionKeyId' });
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

        const { username, password } = message;
        if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }

        // Concatenate the values and hash them
        const concatenatedMessage = username + password + userPublicKey;
        const messageHash = crypto.createHash('sha256').update(concatenatedMessage).digest('hex');

        const { signature } = signedMessage;
        // Verify the signature
        const isVerified = await verifySignature(messageHash, signature, userPublicKey);
        if (!isVerified) {
            return res.status(401).json({ message: 'Invalid signature' });
        }

        const user = await userModel.findUserByUsername(username);
        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const entry = JSON.parse(secureStore.get(SessionKeyId));
        entry.userId = user.id;
        secureStore.set(SessionKeyId, JSON.stringify(entry));
        const token = jwt.sign({ id: user.id, sid: SessionKeyId }, process.env.JWT_SECRET, { expiresIn: '2h' });

        // Define the response payload
        const responsePayload = { token };

        // Encrypt the response
        const encryptedResponse = await encryptMessage(responsePayload, sharedSecret);


        res.json(encryptedResponse);
    } catch (err) {
        console.error('Login failed:', err.code || err.name);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.logout = async (req, res) => {
    try {
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

        if (sessionKeyId !== SessionKeyId) {
            return res.status(403).json({ message: 'Session does not match' });
        }
        secureStore.delete(SessionKeyId);
        const deletedEntry = secureStore.get(sessionKeyId);
        if (deletedEntry) {
            console.error('Session cleanup failed');
            return res.status(500).json({ message: 'Failed to delete session key' });
        }
        return res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Account request failed:', err.code || err.name);
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
        console.error('Account request failed:', err.code || err.name);
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
        console.error('Account request failed:', err.code || err.name);
        return res.status(500).json({ message: 'Server error.' });
    }
};

exports.getGoals = async (req, res) => {
    try {
        const userid = req.user.id;
        const goals = await userModel.getGoals(userid);
        return res.status(200).json(goals);
    } catch (err) {
        console.error('Account request failed:', err.code || err.name);
        return res.status(500).json({ message: 'Server error.' });
    }
};
