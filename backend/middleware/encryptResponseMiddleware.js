const cryptoUtils = require('../utils/cryptoUtils');
const secureStore = require('../controllers/store');

/**
 * Retrieves the private key from the secure store.
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
 * Middleware to encrypt outgoing responses.
 */
const encryptResponseMiddleware = async (req, res, next) => {
    const originalSend = res.send;

    res.send = function (body) {
        if (this._isEncrypted) {
            return originalSend.call(this, body);
        }

        (async () => {
            try {
                // Check multiple context sources
                const contextSources = [
                    req.body?._security,
                    req.query?._security,
                    res.locals.encryptionContext,
                ];

                // Find first valid context
                const context = contextSources.find((ctx) => ctx?.SessionKeyId);
                console.log('Encryption context:', context);
                if (!context) {
                    console.log('Encryption bypassed - no valid context found');
                    return originalSend.call(this, body);
                }

                const { SessionKeyId } = context;

                // Convert response body
                const responseBody = typeof body === 'object' ? JSON.stringify(body) : String(body);

                // Retrieve the private and public keys
                const { privateKey, publicKey } = await getKey(SessionKeyId).catch((error) => {
                    console.error('Key retrieval failed:', error);
                    secureStore.purge(SessionKeyId); // Clean invalid keys
                    throw new Error('Failed to retrieve keys');
                });

                // Derive shared secret
                const sharedSecret = await cryptoUtils.deriveSharedSecret(privateKey, publicKey);

                // Encrypt response
                const encryptedResponse = await cryptoUtils.encryptMessage(responseBody, sharedSecret);

                // Send encrypted response
                this._isEncrypted = true;
                return originalSend.call(this, encryptedResponse);
            } catch (error) {
                console.error('Encryption failed:', error);
                return originalSend.call(this, {
                    error: 'Secure response failed',
                    details: error.message,
                });
            }
        })();
    };

    next();
};

module.exports = encryptResponseMiddleware;