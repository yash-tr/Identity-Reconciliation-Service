const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/database');

// Helper to reset contacts between tests
async function resetContacts() {
  await prisma.contact.deleteMany({});
}

describe('POST /identify - PRD scenarios and edge cases', () => {
  beforeAll(async () => {
    // Ensure DB is reachable; if not, tests will fail loudly
  });

  beforeEach(async () => {
    await resetContacts();
  });

  afterAll(async () => {
    await resetContacts();
    await prisma.$disconnect();
  });

  test('creates new primary contact when no existing contacts (Case 1)', async () => {
    const res = await request(app)
      .post('/identify')
      .send({
        email: 'doc@hillvalley.edu',
        phoneNumber: '999999',
      })
      .expect(200);

    expect(res.body).toHaveProperty('contact');
    const contact = res.body.contact;
    expect(typeof contact.primaryContatctId).toBe('number');
    expect(contact.secondaryContactIds).toEqual([]);
    expect(contact.emails).toEqual(['doc@hillvalley.edu']);
    expect(contact.phoneNumbers).toEqual(['999999']);
  });

  test('idempotency: same email+phone does not create duplicate contacts (Case 1/2)', async () => {
    const first = await request(app)
      .post('/identify')
      .send({
        email: 'lorraine@hillvalley.edu',
        phoneNumber: '123456',
      })
      .expect(200);

    const primaryId = first.body.contact.primaryContatctId;

    const second = await request(app)
      .post('/identify')
      .send({
        email: 'lorraine@hillvalley.edu',
        phoneNumber: '123456',
      })
      .expect(200);

    expect(second.body.contact.primaryContatctId).toBe(primaryId);

    const allContacts = await prisma.contact.findMany();
    expect(allContacts.length).toBe(1);
  });

  test('creates secondary contact when new email for existing phone (Case 3 example)', async () => {
    // Seed primary
    await request(app)
      .post('/identify')
      .send({
        email: 'lorraine@hillvalley.edu',
        phoneNumber: '123456',
      })
      .expect(200);

    // New email, same phone
    const res = await request(app)
      .post('/identify')
      .send({
        email: 'mcfly@hillvalley.edu',
        phoneNumber: '123456',
      })
      .expect(200);

    const contact = res.body.contact;
    expect(contact.emails).toEqual(
      expect.arrayContaining(['lorraine@hillvalley.edu', 'mcfly@hillvalley.edu']),
    );
    expect(contact.phoneNumbers).toEqual(['123456']);
    expect(contact.secondaryContactIds.length).toBe(1);

    const rows = await prisma.contact.findMany({ orderBy: { createdAt: 'asc' } });
    const primary = rows[0];
    const secondary = rows[1];

    expect(primary.linkPrecedence).toBe('primary');
    expect(secondary.linkPrecedence).toBe('secondary');
    expect(secondary.linkedId).toBe(primary.id);
  });

  test('merges two primaries when email matches one and phone matches another (Case 4 example)', async () => {
    // 1) Create first primary: george@ / 919191
    await request(app)
      .post('/identify')
      .send({
        email: 'george@hillvalley.edu',
        phoneNumber: '919191',
      })
      .expect(200);

    // 2) Create second primary: biffsucks@ / 717171
    await request(app)
      .post('/identify')
      .send({
        email: 'biffsucks@hillvalley.edu',
        phoneNumber: '717171',
      })
      .expect(200);

    // 3) Link them: email of first, phone of second
    const res = await request(app)
      .post('/identify')
      .send({
        email: 'george@hillvalley.edu',
        phoneNumber: '717171',
      })
      .expect(200);

    const contact = res.body.contact;

    expect(contact.emails).toEqual(
      expect.arrayContaining(['george@hillvalley.edu', 'biffsucks@hillvalley.edu']),
    );
    expect(contact.phoneNumbers).toEqual(
      expect.arrayContaining(['919191', '717171']),
    );

    // Verify primary/secondary in DB
    const rows = await prisma.contact.findMany({ orderBy: { createdAt: 'asc' } });
    const primary = rows.find((r) => r.linkPrecedence === 'primary');
    const secondaries = rows.filter((r) => r.linkPrecedence === 'secondary');

    expect(primary).toBeDefined();
    // Oldest should remain primary
    expect(primary.email).toBe('george@hillvalley.edu');
    expect(secondaries.some((s) => s.id !== primary.id)).toBe(true);
  });

  test('only email provided (phone null) works', async () => {
    const res = await request(app)
      .post('/identify')
      .send({
        email: 'onlyemail@test.com',
      })
      .expect(200);

    expect(res.body.contact.emails[0]).toBe('onlyemail@test.com');
    expect(res.body.contact.phoneNumbers.length).toBe(0);
  });

  test('only phone provided (email null) works', async () => {
    const res = await request(app)
      .post('/identify')
      .send({
        phoneNumber: '555555',
      })
      .expect(200);

    expect(res.body.contact.phoneNumbers[0]).toBe('555555');
    expect(res.body.contact.emails.length).toBe(0);
  });

  test('returns 400 when both email and phoneNumber are missing', async () => {
    const res = await request(app)
      .post('/identify')
      .send({})
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('returns 400 for malformed body (array instead of object)', async () => {
    const res = await request(app)
      .post('/identify')
      .send([])
      .expect(400);

    expect(res.body.error.message).toMatch(/must be a JSON object/i);
  });

  test('spelling of primaryContatctId matches PRD', async () => {
    const res = await request(app)
      .post('/identify')
      .send({
        email: 'spellcheck@test.com',
      })
      .expect(200);

    expect(res.body.contact).toHaveProperty('primaryContatctId');
    expect(res.body.contact).not.toHaveProperty('primaryContactId');
  });
});

