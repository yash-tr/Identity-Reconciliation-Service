const prisma = require('../config/database');

/**
 * Find contacts by exact email.
 * @param {string|null|undefined} email
 * @returns {Promise<Array>}
 */
async function findByEmail(email) {
  if (!email) return [];

  return prisma.contact.findMany({
    where: {
      email,
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/**
 * Find contacts by exact phone number
 * @param {string|null|undefined} phoneNumber
 * @returns {Promise<Array>}
 */
async function findByPhone(phoneNumber) {
  if (!phoneNumber) return [];

  return prisma.contact.findMany({
    where: {
      phoneNumber,
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/**
 * Find a contact by its primary key id.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  if (!id) return null;

  return prisma.contact.findUnique({
    where: { id },
  });
}

/**
 * Create a new contact row.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function create(data) {
  return prisma.contact.create({
    data,
  });
}

/**
 * Update a contact row by id.
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function update(id, data) {
  return prisma.contact.update({
    where: { id },
    data,
  });
}

/**
 * Find all contacts linked to any of the given contact ids.
 * This is helpful when resolving full identity graphs.
 *
 * @param {number[]|number} contactIds - One id or an array of ids treated as primary/anchor ids.
 * @returns {Promise<Array>}
 */
async function findAllLinked(contactIds) {
  const ids = Array.isArray(contactIds) ? contactIds : [contactIds];

  if (!ids.length) return [];

  return prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: { in: ids } },
        { linkedId: { in: ids } },
      ],
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

module.exports = {
  findByEmail,
  findByPhone,
  findById,
  create,
  update,
  findAllLinked,
};
