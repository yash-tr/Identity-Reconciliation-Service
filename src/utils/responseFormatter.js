/**
 * Response formatter for consolidated contacts.
 *
 * formatContactResponse(primaryContact, allLinkedContacts)
 * - Ensures primary contact's email/phone appear first in arrays
 * - Deduplicates emails and phone numbers
 * - Extracts secondary contact IDs
 */

function formatContactResponse(primary, allContacts = []) {
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

module.exports = {
  formatContactResponse,
};

