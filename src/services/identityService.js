const prisma = require('../config/database');
const Contact = require('../models/Contact');
const {
  findContactsByEmailOrPhone,
  getPrimaryContact,
  getAllLinkedContacts,
} = require('./contactService');
const { formatContactResponse } = require('../utils/responseFormatter');

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
  const matchingContacts = await findContactsByEmailOrPhone(email, phoneNumber);

  // CASE 1: No existing contacts → create new primary contact
  if (!matchingContacts.length) {
    const newPrimary = await Contact.create({
      email,
      phoneNumber,
      linkPrecedence: 'primary',
      linkedId: null,
    });

    return formatContactResponse(newPrimary, [newPrimary]);
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

  const hasEmailIn = (contacts) => email && contacts.some((c) => c.email === email);
  const hasPhoneIn = (contacts) =>
    phoneNumber && contacts.some((c) => c.phoneNumber === phoneNumber);

  // CASE 4: Multiple primaries → need to merge
  if (primaries.length > 1) {
    primaries.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const oldestPrimary = primaries[0];
    const primariesToConvert = primaries.slice(1);

    // Convert newer primaries to secondary and re-point their children
    // Wrap in a transaction to keep data consistent
    await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-syntax
      for (const p of primariesToConvert) {
        // eslint-disable-next-line no-await-in-loop
        await tx.contact.update({
          where: { id: p.id },
          data: {
            linkPrecedence: 'secondary',
            linkedId: oldestPrimary.id,
          },
        });

        // eslint-disable-next-line no-await-in-loop
        await tx.contact.updateMany({
          where: { linkedId: p.id },
          data: { linkedId: oldestPrimary.id },
        });
      }
    });

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

    return formatContactResponse(oldestPrimary, allLinkedAfterMerge);
  }

  // Exactly one primary in this chain
  const primary = primaries[0];

  // CASE 2: exact match
  const exactMatch = matchingContacts.find(
    (c) => c.email === email && c.phoneNumber === phoneNumber,
  );
  if (exactMatch) {
    const allLinked = await getAllLinkedContacts(primary.id);
    return formatContactResponse(primary, allLinked);
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

  return formatContactResponse(primary, allLinkedForPrimary);
}

module.exports = {
  identifyContact,
};
