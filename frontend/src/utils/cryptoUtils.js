// Non-extractable wrapping key is stored as a CryptoKey via IndexedDB structured clone.
// This protects exported key material at rest; it does not protect against same-origin XSS.
function openKeyDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('cryptoKeysDB', 3);
        request.onupgradeneeded = () => {
            const db = request.result;
            // Invalidate the old format, which derived a fixed key from a Promise string.
            if (db.objectStoreNames.contains('keys')) db.deleteObjectStore('keys');
            db.createObjectStore('keys', { keyPath: 'keyName' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function storeKeyInIndexedDB(keyName, key) {
    const db = await openKeyDB();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction('keys', 'readwrite');
            tx.objectStore('keys').put({ keyName, key, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Key storage aborted'));
        });
    } finally { db.close(); }
}

export async function getKeyFromIndexedDB(keyName) {
    const db = await openKeyDB();
    let record;
    try {
        record = await new Promise((resolve, reject) => {
            const request = db.transaction('keys', 'readonly').objectStore('keys').get(keyName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally { db.close(); }
    if (!record || record.expiresAt <= Date.now()) return null;
    if (keyName !== 'privateKey') return record.key;
    const wrappingKey = await getKeyFromIndexedDB('wrappingKey');
    if (!wrappingKey) throw new Error('Session expired. Please log in again.');
    const decoded = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(record.key.iv) },
        wrappingKey, base64ToArrayBuffer(record.key.encryptedPrivateKey));
    return new TextDecoder().decode(decoded);
}

export async function deleteKeyFromIndexedDB(keyName) {
    const db = await openKeyDB();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction('keys', 'readwrite');
            tx.objectStore('keys').delete(keyName);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } finally { db.close(); }
}

async function getOrCreateWrappingKey() {
    let key = await getKeyFromIndexedDB('wrappingKey');
    if (!key) {
        key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    await storeKeyInIndexedDB('wrappingKey', key);
    return key;
}

export const generateKeyPair = async () => {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey", "deriveBits"]
    );

    const publicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    const publicKeyBase64 = arrayBufferToBase64(publicKey);
    const privateKeyBase64 = arrayBufferToBase64(privateKey);

    const aesKey = await getOrCreateWrappingKey();

    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Generate a random IV
    const encryptedPrivateKey = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(privateKeyBase64)
    );

    // Store the public key and encrypted private key in IndexedDB
    await storeKeyInIndexedDB("publicKey", publicKeyBase64);
    await storeKeyInIndexedDB("privateKey", {
        encryptedPrivateKey: arrayBufferToBase64(encryptedPrivateKey),
        iv: arrayBufferToBase64(iv),
    });

    return {
        publicKey: publicKeyBase64,
        privateKey: privateKeyBase64, // Return the unencrypted private key for immediate use
    };
};
export const deriveSharedSecret = async (privateKeyBase64, peerPublicKeyBase64) => {
    try {
        const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
        const peerPublicKeyBuffer = base64ToArrayBuffer(peerPublicKeyBase64);

        const privateKey = await window.crypto.subtle.importKey(
            'pkcs8',
            privateKeyBuffer,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveBits']
        );

        const peerPublicKey = await window.crypto.subtle.importKey(
            'spki',
            peerPublicKeyBuffer,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );

        const sharedSecret = await window.crypto.subtle.deriveBits(
            {
                name: 'ECDH',
                public: peerPublicKey
            },
            privateKey,
            256
        );

        // Hash the shared secret to ensure it is 32 bytes long
        const hashedSharedSecret = await window.crypto.subtle.digest('SHA-256', sharedSecret);
        const hashedSharedSecretBase64 = arrayBufferToBase64(hashedSharedSecret);
 

        return hashedSharedSecretBase64;
    } catch (error) {
        console.error('Error deriving shared secret:', error);
        throw error;
    }
};

export const signMessage = async (message) => {
    try {
        const privateKeyBase64 = await getKeyFromIndexedDB('privateKey');

        if (!privateKeyBase64) {
            throw new Error('Private key not found in IndexedDB');
        }

        const privateKeyArrayBuffer = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0)).buffer;
        const privateKey = await window.crypto.subtle.importKey(
            'pkcs8',
            privateKeyArrayBuffer,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            true,
            ['sign']
        );

        const encodedMessage = new TextEncoder().encode(typeof message === 'string' ? message : JSON.stringify(message));
        const signature = await window.crypto.subtle.sign(
            {
                name: 'ECDSA',
                hash: { name: 'SHA-256' }
            },
            privateKey,
            encodedMessage
        );

        return {
            message,
            signature: btoa(String.fromCharCode(...new Uint8Array(signature)))
        };
    } catch (error) {
        console.error('Error signing message:', error);
        throw error;
    }
};

export const verifySignature = async (message, signatureBase64, publicKeyBase64) => {
    try {
        const publicKeyArrayBuffer = base64ToArrayBuffer(publicKeyBase64);
        const signatureArrayBuffer = base64ToArrayBuffer(signatureBase64);

        const publicKey = await window.crypto.subtle.importKey(
            'spki',
            publicKeyArrayBuffer,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            true,
            ['verify']
        );

        const encodedMessage = new TextEncoder().encode(typeof message === 'string' ? message : JSON.stringify(message));

        const isValid = await window.crypto.subtle.verify(
            {
                name: 'ECDSA',
                hash: { name: 'SHA-256' }
            },
            publicKey,
            signatureArrayBuffer,
            encodedMessage
        );

        return isValid;
    } catch (error) {
        console.error('Error verifying signature:', error);
        throw error;
    }
};
export const encryptMessage = async (message, publicKeyBase64) => {
    console.log('Starting encryptMessage');
    try {
        const privateKeyBase64 = await getKeyFromIndexedDB('privateKey');
        const hashedSharedSecretBase64 = await deriveSharedSecret(privateKeyBase64, publicKeyBase64);

        // Convert the hashed shared secret from base64 to ArrayBuffer
        const hashedSharedSecretArrayBuffer = base64ToArrayBuffer(hashedSharedSecretBase64);

        const aesKey = await window.crypto.subtle.importKey(
            'raw',
            hashedSharedSecretArrayBuffer,
            { name: 'AES-GCM' },
            true,
            ['encrypt', 'decrypt']
        );

        const encodedMessage = new TextEncoder().encode(typeof message === 'string' ? message : JSON.stringify(message));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedMessage = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            encodedMessage
        );

        // Extract the authTag from the encrypted message
        const authTag = encryptedMessage.slice(encryptedMessage.byteLength - 16);
        const encryptedMessageWithoutAuthTag = encryptedMessage.slice(0, encryptedMessage.byteLength - 16);

        return {
            encryptedMessage: arrayBufferToBase64(encryptedMessageWithoutAuthTag),
            iv: arrayBufferToBase64(iv),
            authTag: arrayBufferToBase64(authTag)
        };
    } catch (error) {
        console.error('Encryption error:', error);
        throw error;
    }
};

export const decryptMessage = async (encryptedMessageBase64, ivBase64, authTagBase64, serverPublicKey) => {
    try {
        console.log('Starting decryptMessage');

        const privateKeyBase64 = await getKeyFromIndexedDB('privateKey');
        const hashedSharedSecretBase64 = await deriveSharedSecret(privateKeyBase64, serverPublicKey);

        
        // Convert the hashed shared secret from base64 to ArrayBuffer
        const hashedSharedSecretArrayBuffer = base64ToArrayBuffer(hashedSharedSecretBase64);

        const aesKey = await window.crypto.subtle.importKey(
            'raw',
            hashedSharedSecretArrayBuffer,
            { name: 'AES-GCM' },
            true,
            ['decrypt']
        );


        const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
        const authTag = Uint8Array.from(atob(authTagBase64), c => c.charCodeAt(0));
        const encryptedMessage = Uint8Array.from(atob(encryptedMessageBase64), c => c.charCodeAt(0));

          // Combine ciphertext and auth tag
          const encryptedData = new Uint8Array(
            encryptedMessage.length + authTag.length
          );
          encryptedData.set(encryptedMessage);
          encryptedData.set(authTag, encryptedMessage.length);
      
          // Decrypt combined data
          const decryptedMessage = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv, additionalData: new Uint8Array() },
            aesKey,
            encryptedData // Use combined buffer
          );
        return new TextDecoder().decode(decryptedMessage);
    } catch (error) {
        console.error('Error in decryptMessage:', error);
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
    return btoa(binary);
};

const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

export const arrayBufferToString = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binaryString = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    return binaryString;
};

export { arrayBufferToBase64, base64ToArrayBuffer };