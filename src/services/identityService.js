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
 * - Case 3: Existing contacts, new info (new email/phone) → create secondary
 * - Case 4: Email matches one primary, phone matches another → merge primaries
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

  // Build set of distinct primary contacts referenced by the matches
  const primaryMap = new Map();
  for (const c of matchingContacts) {
    // eslint-disable-next-line no-await-in-loop
    const p = await getPrimaryContact(c);
    if (p) {
      primaryMap.set(p.id, p);
    }
  }
  const primaries = Array.from(primaryMap.values());

  // Helper to determine if requested email/phone are already present in a chain
  const hasEmailIn = (contacts) =>
    email && contacts.some((c) => c.email === email);
  const hasPhoneIn = (contacts) =>
    phoneNumber && contacts.some((c) => c.phoneNumber === phoneNumber);

  // CASE 4: Multiple primaries → need to merge
  if (primaries.length > 1) {
    // Sort by createdAt to find the oldest primary
    primaries.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const oldestPrimary = primaries[0];
    const primariesToConvert = primaries.slice(1);

    // Convert newer primaries to secondary and re-point their children
    // Note: For now this is not wrapped in a DB transaction; that will be added in a later commit.
    // eslint-disable-next-line no-restricted-syntax
    for (const p of primariesToConvert) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.contact.update({
        where: { id: p.id },
        data: {
          linkPrecedence: 'secondary',
          linkedId: oldestPrimary.id,
        },
      });

      // Re-link children of this primary to the oldest primary
      // eslint-disable-next-line no-await-in-loop
      await prisma.contact.updateMany({
        where: { linkedId: p.id },
        data: { linkedId: oldestPrimary.id },
      });
    }

    // After merge, decide if we need to create a new secondary for the incoming data
    let allLinkedAfterMerge = await getAllLinkedContacts(oldestPrimary.id);

    const emailIsNew = email && !hasEmailIn(allLinkedAfterMerge);
    const phoneIsNew = phoneNumber && !hasPhoneIn(allLinkedAfterMerge);

    const needNewContact =
      !matchingContacts.find(
        (c) => c.email === email && c.phoneNumber === phoneNumber,
      ) && (emailIsNew || phoneIsNew);

    if (needNewContact) {
      await Contact.create({
        email,
        phoneNumber,
        linkPrecedence: 'secondary',
        linkedId: oldestPrimary.id,
      });

      allLinkedAfterMerge = await getAllLinkedContacts(oldestPrimary.id);
    }

    return buildConsolidatedResponse(oldestPrimary, allLinkedAfterMerge);
  }

  // At this point we have exactly one primary in the chain
  const primary = primaries[0];

  // Check for exact match among matching contacts
  const exactMatch = matchingContacts.find(
    (c) => c.email === email && c.phoneNumber === phoneNumber,
  );

  if (exactMatch) {
    // CASE 2: Exact match → just return consolidated info for this primary
    const allLinked = await getAllLinkedContacts(primary.id);
    return buildConsolidatedResponse(primary, allLinked);
  }

  // CASE 3: Existing contact(s), but new info (email or phone) → create secondary
  let allLinkedForPrimary = await getAllLinkedContacts(primary.id);

  const emailIsNewForPrimary = email && !hasEmailIn(allLinkedForPrimary);
  const phoneIsNewForPrimary = phoneNumber && !hasPhoneIn(allLinkedForPrimary);

  if (emailIsNewForPrimary || phoneIsNewForPrimary) {
    await Contact.create({
      email,
      phoneNumber,
      linkPrecedence: 'secondary',
      linkedId: primary.id,
    });

    allLinkedForPrimary = await getAllLinkedContacts(primary.id);
  }

  return buildConsolidatedResponse(primary, allLinkedForPrimary);
}

module.exports = {
  identifyContact,
};
