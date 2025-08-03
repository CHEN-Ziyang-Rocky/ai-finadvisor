const crypto = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

// Generate ECDHE key pair
exports.generateKeyPair = async () => {
    return new Promise((resolve, reject) => {
        crypto.generateKeyPair('ec', {
            namedCurve: 'prime256v1', 
            publicKeyEncoding: {
                type: 'spki',
                format: 'der'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'der'
            }
        }, (err, publicKey, privateKey) => {
            if (err) {
                reject(err);
            } else {
                const publicKeyBase64 = publicKey.toString('base64');
                const privateKeyBase64 = privateKey.toString('base64');
                resolve({
                    publicKey: publicKeyBase64,
                    privateKey: privateKeyBase64
                });
            }
        });
    });
};

exports.deriveSharedSecret = async (privateKeyBase64, peerPublicKeyBase64) => {
    try {
        // Decode the private key from base64
        const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');
        const privateKey = crypto.createPrivateKey({
            key: privateKeyBuffer,
            format: 'der',
            type: 'pkcs8'
        });

        // Decode the peer public key from base64
        const peerPublicKeyBuffer = Buffer.from(peerPublicKeyBase64, 'base64');
        const peerPublicKey = crypto.createPublicKey({
            key: peerPublicKeyBuffer,
            format: 'der',
            type: 'spki'
        });

        // Derive the shared secret
        const sharedSecret = crypto.diffieHellman({
            privateKey,
            publicKey: peerPublicKey
        });
        // Hash the shared secret to ensure it is 32 bytes long
        const hashedSharedSecret = crypto.createHash('sha256').update(sharedSecret).digest();
        const hashedSharedSecretBase64 = hashedSharedSecret.toString('base64');
        console.log('hashed shared secret');
        return hashedSharedSecretBase64;
    } catch (error) {
        console.error('Error deriving shared secret:', error);
        throw error;
    }
};
// Sign message with ECDSA private key
exports.signMessage = async (message, privateKeyBase64) => {
    try {
    const privateKey = crypto.createPrivateKey({
        key: Buffer.from(privateKeyBase64, 'base64'),
        format: 'der',
        type: 'pkcs8'
    });

    const sign = crypto.createSign('SHA256');
    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    sign.update(messageString);
    sign.end();

    const signature = sign.sign(privateKey);
    return signature.toString('base64');
    } catch (error) {
        console.error('Error signing message:', error);
        throw error;
    }
};

// Verify signature with ECDSA public key
exports.verifySignature = async (message, signatureBase64, publicKeyBase64) => {
    try {   
    const publicKey = crypto.createPublicKey({
        key: Buffer.from(publicKeyBase64, 'base64'),
        format: 'der',
        type: 'spki'
    });

    const verify = crypto.createVerify('SHA256');
    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    verify.update(messageString);
    verify.end();

    const isValid = verify.verify(publicKey, Buffer.from(signatureBase64, 'base64'));
    return isValid;
    }catch (error) {
        console.error('Error verifying signature:', error);
        throw error;
    }
};

// Encrypt message with AES key
exports.encryptMessage = async (message, hashedsharedSecret) => {
    // Hash the shared secret to ensure it is 32 bytes long
    const aesKey = crypto.createSecretKey(Buffer.from(hashedsharedSecret, 'base64'));
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

    let encryptedMessage = cipher.update(JSON.stringify(message), 'utf8', 'base64');
    encryptedMessage += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');
    console.log('IV:', iv);
    console.log('Auth Tag:', authTag);
    return {
        encryptedMessage,
        iv: iv.toString('base64'),
        authTag
    };
};

// Decrypt message with AES key
exports.decryptMessage = async (encryptedMessageBase64, ivBase64, authTagBase64, hashedSharedSecretBase64) => {
    try {
        // Convert the hashed shared secret from base64 to Buffer
        const hashedSharedSecretBuffer = Buffer.from(hashedSharedSecretBase64, 'base64');

        const aesKey = crypto.createSecretKey(hashedSharedSecretBuffer);
        console.log('AES Key (Base64):', hashedSharedSecretBase64);

        const iv = Buffer.from(ivBase64, 'base64');
        const authTag = Buffer.from(authTagBase64, 'base64');
        const encryptedMessage = Buffer.from(encryptedMessageBase64, 'base64');

        console.log('IV:', iv);
        console.log('Auth Tag:', authTag);
        console.log('Encrypted Message:', encryptedMessage);

        const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
        decipher.setAuthTag(authTag);

        let decryptedMessage = decipher.update(encryptedMessage, 'base64', 'utf8');
        decryptedMessage += decipher.final('utf8');

        return JSON.parse(decryptedMessage);
    } catch (error) {
        console.error('Error decrypting message:', error);
        throw error;
    }
};

// Safe Base64 conversion helpers
const arrayBufferToBase64 = buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return Buffer.from(binary, 'binary').toString('base64');
};

const base64ToArrayBuffer = base64 => {
    const binaryString = Buffer.from(base64, 'base64').toString('binary');
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

exports.arrayBufferToBase64 = arrayBufferToBase64;
exports.base64ToArrayBuffer = base64ToArrayBuffer;