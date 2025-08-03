import { v4 as uuidv4 } from 'uuid';

let sessionUUID = uuidv4();
let sessionUUIDExpiresAt = new Date(Date.now() + 2 * 60 * 60* 1000);
const getSessionUUID = () => {
    const now = new Date();
    if (now >= sessionUUIDExpiresAt) {
        console.warn("Session UUID has expired. Generating a new session UUID.");
        sessionUUID = uuidv4(); 
        sessionUUIDExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); 
    }
    return sessionUUID;
};

const deriveAESKey = async () => {
    const uuid = getSessionUUID();
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const uuidKey = new TextEncoder().encode(uuid);

    const baseKey = await window.crypto.subtle.importKey(
        "raw",
        uuidKey,
        "HKDF",
        false,
        ["deriveKey"]
    );

    const aesKey = await window.crypto.subtle.deriveKey(
        {
            name: "HKDF",
            salt: salt,
            info: new TextEncoder().encode("AES-GCM key derivation"),
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    return aesKey;
};
export const storeKeyInIndexedDB = async (keyName, cryptoKey) => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("cryptoKeysDB", 2); // Versioned for schema updates

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("keys")) {
                const store = db.createObjectStore("keys", {
                    keyPath: "keyName", // Use keyName as the keyPath to ensure uniqueness
                });
                store.createIndex("keyName", "keyName", { unique: true });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(["keys"], "readwrite");
            const store = transaction.objectStore("keys");

            // Check if the key already exists
            const getRequest = store.get(keyName);
            getRequest.onsuccess = (e) => {
                if (e.target.result) {
                    // Key exists, update it
                    const putRequest = store.put({
                        keyName: keyName,
                        key: cryptoKey, // Stored as CryptoKey object
                        timestamp: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
                    });

                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = (e) => reject(e.target.error);
                } else {
                    // Key does not exist, add it
                    const addRequest = store.add({
                        keyName: keyName,
                        key: cryptoKey, // Stored as CryptoKey object
                        timestamp: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
                    });

                    addRequest.onsuccess = () => resolve();
                    addRequest.onerror = (e) => reject(e.target.error);
                }
            };

            getRequest.onerror = (e) => reject(e.target.error);
        };

        request.onerror = (e) => reject(e.target.error);
    });
};
export const getKeyFromIndexedDB = async (keyName) => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("cryptoKeysDB", 2);

        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(["keys"], "readonly");
            const store = transaction.objectStore("keys");
            const index = store.index("keyName");

            const query = index.get(keyName);
            query.onsuccess = async (e) => {
                const result = e.target.result;
                if (result) {
                    const now = new Date();
                    const expiresAt = new Date(result.expiresAt);
                    if (now < expiresAt) {
                        if (keyName === "privateKey") {
                            try {
                                // Decrypt the private key using sessionUUID
                                const { encryptedPrivateKey, iv } = result.key;

                                // Derive a valid AES key from the sessionUUID
                                const uuidKey = new TextEncoder().encode(deriveAESKey());
                                const hashedKey = await window.crypto.subtle.digest("SHA-256", uuidKey); // 256-bit key
                                const aesKey = await window.crypto.subtle.importKey(
                                    "raw",
                                    hashedKey,
                                    { name: "AES-GCM" },
                                    false,
                                    ["decrypt"]
                                );

                                const decryptedPrivateKey = await window.crypto.subtle.decrypt(
                                    { name: "AES-GCM", iv: base64ToArrayBuffer(iv) },
                                    aesKey,
                                    base64ToArrayBuffer(encryptedPrivateKey)
                                );

                                resolve(new TextDecoder().decode(decryptedPrivateKey));
                            } catch (error) {
                                console.error("Error decrypting private key:", error);
                                reject(error);
                            }
                        } else {
                            resolve(result.key);
                        }
                    } else {
                        // Key has expired
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            };
            query.onerror = (e) => reject(e.target.error);
        };

        request.onerror = (e) => reject(e.target.error);
    });
};
export const deleteKeyFromIndexedDB = async (keyName) => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("cryptoKeysDB", 2);

        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(["keys"], "readwrite");
            const store = transaction.objectStore("keys");

            const deleteRequest = store.delete(keyName);

            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = (e) => reject(e.target.error);
        };

        request.onerror = (e) => reject(e.target.error);
    });
};
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

    // Derive a valid AES key from the sessionUUID
    const uuidKey = new TextEncoder().encode(deriveAESKey());
    const hashedKey = await window.crypto.subtle.digest("SHA-256", uuidKey); // 256-bit key
    const aesKey = await window.crypto.subtle.importKey(
        "raw",
        hashedKey,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

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

        const encodedMessage = new TextEncoder().encode(JSON.stringify(message));
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

        const encodedMessage = new TextEncoder().encode(JSON.stringify(message));

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

        const encodedMessage = new TextEncoder().encode(JSON.stringify(message));
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