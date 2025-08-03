const crypto = require('crypto');

class TempStore {
  constructor() {
    this.store = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(),  60 * 60 * 1000); // Cleanup hourly to remove expired entries  
  }

  // Store data with encryption
  set(key, value) {
    const encrypted = this.encrypt(JSON.stringify(value)); 
    this.store.set(key, {
      data: encrypted,
      timestamp: Date.now(),
    });
  }

  adduserPk(key, userPK) {
    const entry = this.store.get(key);
    if (!entry) throw new Error(`Key ${key} not found`);
  
    // Decrypt and parse the data
    const decryptedData = this.decrypt(entry.data);
    let parsedData;
  
    try {
      parsedData = JSON.parse(decryptedData);
    } catch (error) {
      parsedData = { privateKey: decryptedData };
    }
  
    parsedData.userPK = userPK; 
  
    this.store.set(key, {
      data: this.encrypt(JSON.stringify(parsedData)),
      timestamp: Date.now(),
    });
  }
 
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Decrypt the data
    const decryptedData = this.decrypt(entry.data);

    try {
      // Parse the decrypted data as JSON
      return JSON.parse(decryptedData);
    } catch (error) {
      return decryptedData;
    }
  }

  // Delete data
  delete(key) {
    this.store.delete(key);
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > 2* 60 * 60 * 1000) { 
        this.delete(key);
        console.log(`Cleaned up expired key: ${key}`);
      }
    }
  }

  // Encrypt data
  encrypt(data) {
    if (!data) throw new Error('No data provided for encryption');
    if (!process.env.STORE_ENCRYPTION_KEY) {
      throw new Error('STORE_ENCRYPTION_KEY missing in environment');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.STORE_ENCRYPTION_KEY, 'hex'),
      iv
    );
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    return {
      iv: iv.toString('hex'),
      content: encrypted.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }

  // Decrypt data
  decrypt(encrypted) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.STORE_ENCRYPTION_KEY, 'hex'),
      Buffer.from(encrypted.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.content, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}

module.exports = new TempStore();