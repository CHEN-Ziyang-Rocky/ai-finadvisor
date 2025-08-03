const cryptoUtils = require('../utils/cryptoUtils');
const secureStore = require('../controllers/store');

/**
 * Retrieves the private and public keys from the secure store.
 * @param {string} SessionKeyId - The session key ID.
 * @returns {Promise<{ privateKey: string, publicKey: string }>} - The private and public keys.
 */
async function getKey(SessionKeyId) {
    const entry = secureStore.get(SessionKeyId);
    if (!entry) {
        throw new Error('Invalid or expired SessionKeyId');
    }

    // Parse the entry as JSON
    let data;
    try {
        data = JSON.parse(entry); // Parse as JSON
    } catch (error) {
        // If parsing fails, assume the entry is a raw private key
        data = { privateKey: entry };
    }

    // Ensure privateKey and publicKey are strings
    const privateKey = typeof data.privateKey === 'object' ? data.privateKey.privateKey : data.privateKey;
    const publicKey = data.userPK || data.publicKey; // Extract publicKey (userPK)



    if (!privateKey) {
        throw new Error('Invalid or expired SessionKeyId');
    }

    return { privateKey, publicKey };
}

/**
 * Middleware to decrypt incoming requests.
 */
const decryptRequestMiddleware = async (req, res, next) => {
    const originalParams = req.method === 'GET' ? { ...req.query } : { ...req.body };
    console.log('Original parameters:', originalParams);

    try {
        const { encryptedMessage, iv, authTag, SessionKeyId } = originalParams;

        // Enhanced parameter validation
        if (!encryptedMessage || !iv || !authTag || !SessionKeyId ) {
            console.log('Skipping decryption - missing parameters:', {
                encrypted: !!encryptedMessage,
                iv: iv ? `${iv.slice(0, 2)}...` : 'missing',
                authTag: authTag ? `${authTag.slice(0, 2)}...` : 'missing',
                SessionKeyId: SessionKeyId ? 'present' : 'missing',
            });
            return next();
        }

        // Retrieve the private and public keys
        const { privateKey, publicKey } = await getKey(SessionKeyId).catch((error) => {
            console.error('Key retrieval failed:', error);
            secureStore.purge(SessionKeyId); // Clean invalid keys
            throw new Error('Failed to retrieve keys');
        });

        // Derive the shared secret
        const sharedSecret = await cryptoUtils.deriveSharedSecret(privateKey, publicKey);

        // Decrypt the message
        const decryptedData = await cryptoUtils.decryptMessage(encryptedMessage, iv, authTag, sharedSecret);

        // Preserve original parameters with decrypted data
        const user_id = decryptedData.user_id 
        const finalData = {
            ...decryptedData,
            _security: {
                SessionKeyId,
                expires: Date.now() + 300000, // 5-minute expiration
                publicKey, // Include the public key for auditing
            },
        };

        // Maintain original parameters for tracing
        if (req.method === 'GET') {
            req.query = { ...originalParams, ...finalData };
        } else {
            req.body = { ...originalParams, ...finalData };
        }
        // Store context in three locations
        res.locals.encryptionContext = { SessionKeyId, user_id };
        
        req.encryptionContext = { SessionKeyId, user_id };
        next();
    } catch (error) {
        console.error('Decryption pipeline failed:', {
            error: error.message,
            stack: error.stack,
        });

        // Restore with security audit trail
        const errorPayload = {
            ...originalParams,
            _security: {
                error: 'DECRYPTION_FAILED',
                timestamp: Date.now(),
                details: error.message,
            },
        };

        if (req.method === 'GET') {
            req.query = errorPayload;
        } else {
            req.body = errorPayload;
        }
        
        res.status(500).json({
            error: 'Secure processing failed',
            code: 'DECRYPTION_FAILURE',
            reference: `ERR-${Date.now()}`,
        });
    }
};

module.exports = decryptRequestMiddleware;