const express = require('express');
const { identifyHandler } = require('../controllers/identifyController');

const router = express.Router();

// POST /identify
router.post('/identify', identifyHandler);

module.exports = router;
