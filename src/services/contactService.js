const Contact = require('../models/Contact');

/**
 * Find all contacts matching the given email OR phoneNumber.
 * This does NOT yet resolve primaries, just returns raw rows.
 *
 * @param {string|null} email
 * @param {string|null} phoneNumber
 * @returns {Promise<Array>}
 */
async function findContactsByEmailOrPhone(email, phoneNumber) {
  const [byEmail, byPhone] = await Promise.all([
    Contact.findByEmail(email),
    Contact.findByPhone(phoneNumber),
  ]);

  const all = [...byEmail, ...byPhone];

  // Deduplicate by id
  const seen = new Set();
  const unique = [];

  for (const c of all) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      unique.push(c);
    }
  }

  return unique;
}

/**
 * Given any contact (primary or secondary), return its primary contact.
 *
 * @param {Object} contact
 * @returns {Promise<Object>}
 */
async function getPrimaryContact(contact) {
  if (!contact) return null;

  if (contact.linkPrecedence === 'primary' || contact.linkedId == null) {
    return contact;
  }

  // linkedId points to the primary
  const primary = await Contact.findById(contact.linkedId);
  return primary || contact;
}

/**
 * Get all contacts belonging to the chain of a primary id.
 *
 * @param {number} primaryId
 * @returns {Promise<Array>}
 */
async function getAllLinkedContacts(primaryId) {
  if (!primaryId) return [];
  return Contact.findAllLinked(primaryId);
}

module.exports = {
  findContactsByEmailOrPhone,
  getPrimaryContact,
  getAllLinkedContacts,
};
