/**
 * Validation utilities for the /identify endpoint.
 */

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

/**
 * email regex 
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * phone number regex
 */
const PHONE_REGEX = /^\+?[0-9\- ]{5,20}$/;

/**
 * Validate payload for the /identify endpoint.
 * Returns a normalized { email, phoneNumber } object or throws ValidationError.
 *
 * @param {{ email?: string|null, phoneNumber?: string|number|null }} payload
 * @returns {{ email: string|null, phoneNumber: string|null }}
 */
function validateIdentifyPayload(payload = {}) {
  let { email = null, phoneNumber = null } = payload;

  // Normalize phoneNumber if it's a number
  if (typeof phoneNumber === 'number') {
    phoneNumber = String(phoneNumber);
  }

  // Normalize empty strings to null
  if (email !== null && typeof email === 'string' && email.trim() === '') {
    email = null;
  }
  if (phoneNumber !== null && typeof phoneNumber === 'string' && phoneNumber.trim() === '') {
    phoneNumber = null;
  }

  // At least one must be provided
  if (!email && !phoneNumber) {
    throw new ValidationError('At least one of email or phoneNumber must be provided');
  }

  // Email format (if provided)
  if (email) {
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      throw new ValidationError('Invalid email format');
    }
    email = email.trim().toLowerCase();
  }

  // Phone format (if provided)
  if (phoneNumber) {
    if (typeof phoneNumber !== 'string' || !PHONE_REGEX.test(phoneNumber)) {
      throw new ValidationError('Invalid phoneNumber format');
    }
    phoneNumber = phoneNumber.trim();
  }

  return { email, phoneNumber };
}

module.exports = {
  ValidationError,
  validateIdentifyPayload,
};
