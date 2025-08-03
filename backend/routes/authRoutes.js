// routes/authRoutes.js
/*
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');


router.post('/login', authController.login); // Route for user login
router.get('/ot-server-public-key', authController.generateOneTimeKeyPair);
router.post('/generate-qr', authController.generateQRCode);
router.post('/register', authController.register);
module.exports = router;

*/

// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userModel = require('../models/userModel');


router.post('/login', authController.login);
router.get('/session-server-public-key', authController.generateSessionKeyPair);
router.post('/generate-qr', authController.generateQRCode);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

router.post('/update-portrait', async (req, res) => {
    const { user_id, age, income, asset, education_level, married, kids, occupation } = req.body;

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
