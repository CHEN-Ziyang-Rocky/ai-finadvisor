// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const pool = require('../config/db');
const {validateProfile,saveProfile} = require('../services/researchService');
const authMiddleware = require('../middleware/authMiddleware');
const decryptRequestMiddleware = require('../middleware/decryptRequestMiddleware');
const encryptResponseMiddleware = require('../middleware/encryptResponseMiddleware');


router.post('/login', authController.login);
router.get('/session-server-public-key', authController.generateSessionKeyPair);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

router.post('/update-portrait', authMiddleware, decryptRequestMiddleware, encryptResponseMiddleware, async (req, res) => {
    const user_id = req.user.id;
    let profile;
    try {profile=validateProfile(req.body);}
    catch(error){return res.status(400).json({error:error.message});}
    try {
        await saveProfile(pool,user_id,profile);
        res.json({ message: 'User portrait updated successfully',score_invalidated:true });
    } catch (error) {
        console.error('Error updating user portrait:', error.message);
        res.status(503).json({ error: 'Failed to update user portrait' });
    }
});

module.exports = router;
