const prisma = require('../config/database');
const Contact = require('../models/Contact');
const {
  findContactsByEmailOrPhone,
  getPrimaryContact,
  getAllLinkedContacts,
} = require('./contactService');

/**
 * Helper to format the consolidated contact response.
 * This will later be extracted to a dedicated responseFormatter utility (Commit 14).
 *
 * @param {Object} primary
 * @param {Array} allContacts
 */
function buildConsolidatedResponse(primary, allContacts) {
  if (!primary) {
    return {
      contact: {
        primaryContatctId: null,
        emails: [],
        phoneNumbers: [],
        secondaryContactIds: [],
      },
    };
  }

  const emailsSet = new Set();
  const phonesSet = new Set();
  const secondaryIds = [];

  // Ensure primary's values go first if present
  if (primary.email) emailsSet.add(primary.email);
  if (primary.phoneNumber) phonesSet.add(primary.phoneNumber);

  for (const c of allContacts) {
    if (c.id === primary.id) continue;

    if (c.email) emailsSet.add(c.email);
    if (c.phoneNumber) phonesSet.add(c.phoneNumber);

    if (c.linkPrecedence === 'secondary') {
      secondaryIds.push(c.id);
    }
  }

  return {
    contact: {
      primaryContatctId: primary.id,
      emails: Array.from(emailsSet),
      phoneNumbers: Array.from(phonesSet),
      secondaryContactIds: secondaryIds,
    },
  };
}

/**
 * Main identity reconciliation function.
 *
 * - Case 1: No existing contacts → create new primary
 * - Case 2: One existing contact with exact match → return consolidated info
 *
 * @param {string|null} email
 * @param {string|null} phoneNumber
 * @returns {Promise<Object>} consolidated contact response
 */
async function identifyContact(email, phoneNumber) {
  // Find all existing contacts matching email OR phone
  const matchingContacts = await findContactsByEmailOrPhone(email, phoneNumber);

  // CASE 1: No existing contacts → create new primary contact
  if (!matchingContacts.length) {
    const newPrimary = await Contact.create({
      email,
      phoneNumber,
      linkPrecedence: 'primary',
      linkedId: null,
    });

    return buildConsolidatedResponse(newPrimary, [newPrimary]);
  }

  // Determine the primary contact for this set 
  const referenceContact = matchingContacts[0];
  const primary = await getPrimaryContact(referenceContact);

  // Check for exact match among matching contacts
  const exactMatch = matchingContacts.find(
    (c) => c.email === email && c.phoneNumber === phoneNumber,
  );

  if (exactMatch) {
    // CASE 2: Exact match → just return consolidated info for this primary
    const allLinked = await getAllLinkedContacts(primary.id);
    return buildConsolidatedResponse(primary, allLinked);
  }

  // fallback: treat as if only existing data matters.
  const allLinked = await getAllLinkedContacts(primary.id);
  return buildConsolidatedResponse(primary, allLinked);
}

module.exports = {
  identifyContact,
};
