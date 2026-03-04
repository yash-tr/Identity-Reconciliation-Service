const { validateIdentifyPayload } = require('../utils/validator');
const { identifyContact } = require('../services/identityService');

/**
 * Controller for POST /identify
 */
async function identifyHandler(req, res, next) {
  try {
    const { email, phoneNumber } = validateIdentifyPayload(req.body || {});

    const result = await identifyContact(email, phoneNumber);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  identifyHandler,
};
