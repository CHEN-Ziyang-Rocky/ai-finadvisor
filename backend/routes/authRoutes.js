// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userModel = require('../models/userModel');
const authMiddleware = require('../middleware/authMiddleware');
const decryptRequestMiddleware = require('../middleware/decryptRequestMiddleware');
const encryptResponseMiddleware = require('../middleware/encryptResponseMiddleware');


router.post('/login', authController.login);
router.get('/session-server-public-key', authController.generateSessionKeyPair);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

router.post('/update-portrait', authMiddleware, decryptRequestMiddleware, encryptResponseMiddleware, async (req, res) => {
    const user_id = req.user.id;
    const { age, income, asset, education_level, married, kids, occupation } = req.body;

    // 验证输入数据
    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }

    try {
        await userModel.updateUserPortrait(user_id, {
            age, income, asset, education_level, married, kids, occupation
        });

        res.json({ message: 'User portrait updated successfully' });
    } catch (error) {
        console.error('Error updating user portrait:', error.message);
        res.status(500).json({ error: 'Failed to update user portrait', details: error.message });
    }
});

module.exports = router;
