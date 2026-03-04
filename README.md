# Bitespeed Identity Reconciliation Service

Backend service implementing the Bitespeed Identity Reconciliation task. It links multiple contacts (different emails and phone numbers) belonging to the same logical customer using a single `/identify` endpoint.

---

## Live Service

- **Base URL**: `https://identity-reconciliation-service-8p7y.onrender.com`
- **Main Endpoint**: `POST /identify`

Example full URL:

```text
https://identity-reconciliation-service-8p7y.onrender.com/identify
```

---

## 1. Problem Summary (PRD)

FluxKart.com uses Bitespeed to collect contact details for shoppers. One person (like Doc Brown) may use multiple emails and phone numbers across different orders. The goal is to reconcile these into a single identity.

The core rules:

- Contacts are stored in a relational table `Contact` with columns:
  - `id: Int`
  - `phoneNumber: String?`
  - `email: String?`
  - `linkedId: Int?` (points to another `Contact.id`)
  - `linkPrecedence: "primary" | "secondary"`
  - `createdAt: DateTime`
  - `updatedAt: DateTime`
  - `deletedAt: DateTime?`
- The **oldest** row for an identity is `primary`. All others are `secondary` and linked to the primary via `linkedId`.
- Two contacts belong to the same identity if they share either:
  - the same `email`, or
  - the same `phoneNumber`.
- The `/identify` endpoint receives an `email` and/or `phoneNumber` and must return a consolidated view of the identity.

---

## 2. API Specification

### 2.1 Request

**Method**: `POST`  
**URL**: `https://identity-reconciliation-service-8p7y.onrender.com/identify`  
**Headers**:

- `Content-Type: application/json`

**Body**:

```json
{
  "email": "string or null",
  "phoneNumber": "string or number or null"
}
```

Rules:

- At least one of `email` or `phoneNumber` must be provided.
- `phoneNumber` may be sent as a string or a number.

### 2.2 Response

On success (`HTTP 200`):

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": [2, 3]
  }
}
```

Notes:

- The field is intentionally named `primaryContatctId` (with double t) to match the original PRD.
- `emails[0]` is the email of the primary contact if present.
- `phoneNumbers[0]` is the phone number of the primary contact if present.
- `secondaryContactIds` are the ids of all contacts whose `linkPrecedence` is `"secondary"` for that identity.

On validation errors (`HTTP 400`):

```json
{
  "error": {
    "message": "At least one of email or phoneNumber must be provided",
    "statusCode": 400
  }
}
```

On other errors (e.g. database issues, unexpected exceptions), the service returns `HTTP 500` with a generic message and does not leak internal details in production.

---

## 3. Identity Reconciliation Logic

The service implements the following cases:

### Case 1: New identity (no matches)

If there is no contact with the same `email` or `phoneNumber`:

- Create a new `Contact` row with:
  - `linkPrecedence = "primary"`
  - `linkedId = null`
- Return a consolidated response containing only that row.

### Case 2: Exact match

If there is an existing contact with the same `email` **and** `phoneNumber`:

- Return the existing consolidated identity.
- Do not create a new contact (idempotent behaviour).

### Case 3: Existing identity with new information

If there is at least one contact with:

- same `email` but new `phoneNumber`, or
- same `phoneNumber` but new `email`

then:

- Create a new `Contact` row with:
  - `linkPrecedence = "secondary"`
  - `linkedId = <primary-contact-id>`
- Return consolidated identity containing:
  - primary plus all secondaries (emails/phones deduplicated).

### Case 4: Merge two primaries

If:

- `email` in the request matches contacts in one identity, and
- `phoneNumber` in the request matches contacts in another identity,

and each identity has its own primary, then:

- The **oldest primary by `createdAt`** remains primary.
- The other primary is converted to secondary:
  - `linkPrecedence = "secondary"`
  - `linkedId = oldestPrimary.id`
- All its children are re-linked so their `linkedId = oldestPrimary.id`.
- The consolidated response includes data from the merged identity.

### Response formatting rules

Given a primary contact and all linked contacts:

- `emails`:
  - First element is the primary's email (if not null).
  - Other unique emails from the chain follow.
- `phoneNumbers`:
  - First element is the primary's phoneNumber (if not null).
  - Other unique phone numbers follow.
- `secondaryContactIds`:
  - All ids where `linkPrecedence = "secondary"`.

---

## 4. Example cURL Usage

### 4.1 New customer

```bash
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"doc@hillvalley.edu","phoneNumber":"999999"}'
```

### 4.2 Idempotent exact match

```bash
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"doc@hillvalley.edu","phoneNumber":"999999"}'
```

This returns the same `primaryContatctId` and does not create a new row.

### 4.3 New email, same phone (secondary creation)

```bash
# First: Lorraine
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"123456"}'

# Then: McFly with same phone
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"mcfly@hillvalley.edu","phoneNumber":"123456"}'
```

### 4.4 Merge two primaries

```bash
# First primary
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"george@hillvalley.edu","phoneNumber":"919191"}'

# Second primary
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"biffsucks@hillvalley.edu","phoneNumber":"717171"}'

# Merge them
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"george@hillvalley.edu","phoneNumber":"717171"}'
```

### 4.5 Only email / only phone

```bash
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"onlyemail@test.com"}'

curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"555555"}'
```

### 4.6 Invalid requests

Both email and phone missing:

```bash
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{}'
```

Malformed body (array):

```bash
curl -X POST https://identity-reconciliation-service-8p7y.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '[]'
```

---

## 5. Architecture Overview

### 5.1 Stack

- Node.js
- Express
- Prisma ORM
- PostgreSQL (Supabase hosted)
- Jest + Supertest (tests)

### 5.2 Directory Structure

```text
.
├── prisma/
│   ├── schema.prisma          # Prisma schema (Contact model)
│   └── migrations/            # Database migrations
├── src/
│   ├── app.js                 # Express app setup
│   ├── config/
│   │   ├── database.js        # Prisma client singleton
│   │   └── environment.js     # Environment config (if used)
│   ├── controllers/
│   │   └── identifyController.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── requestLogger.js
│   ├── models/
│   │   └── Contact.js         # Contact repository using Prisma
│   ├── routes/
│   │   └── identifyRoutes.js
│   ├── services/
│   │   ├── contactService.js
│   │   └── identityService.js
│   └── utils/
│       ├── responseFormatter.js
│       └── validator.js
├── tests/
│   └── integration/
│       └── identify.e2e.test.js
├── server.js                  # Entry point (starts HTTP server)
├── jest.config.cjs            # Jest configuration
├── package.json
└── README.md
```

### 5.3 Request Lifecycle

1. `server.js` starts the Express app on the configured port.
2. `src/app.js` wires up:
   - CORS
   - JSON body parsing
   - request logging
   - `/health` endpoint
   - `/identify` routes
   - 404 and error handling middleware
3. `src/routes/identifyRoutes.js` defines `POST /identify` and binds to `identifyHandler`.
4. `src/controllers/identifyController.js`:
   - Validates input using `validator.js`
   - Calls `identityService.identifyContact`
   - Returns the formatted response or forwards errors to the global handler.
5. `src/services/identityService.js`:
   - Uses `contactService` and `Contact` model to fetch/update DB.
   - Applies business rules (Cases 1–4, merges, secondaries).
   - Uses `responseFormatter` to shape the final `contact` object.
6. `src/middleware/errorHandler.js` and `requestLogger.js` wrap requests with logging and consistent error responses.

---

## 6. Error Handling and Validation

### 6.1 Validation

`src/utils/validator.js`:

- Ensures request body is a JSON object (not array, not null).
- Accepts `email` and/or `phoneNumber`:
  - If `phoneNumber` is numeric, converts to string.
  - Treats empty strings as null.
  - Requires at least one of them to be non-null.
- Validates formats with simple regular expressions.
- Throws a `ValidationError` (name and statusCode) on invalid input.

### 6.2 Global Error Handler

`src/middleware/errorHandler.js`:

- Logs all errors to the console with timestamp, message, and stack (in development).
- Maps:
  - `ValidationError` → HTTP 400.
  - `CastError` (if used) → HTTP 400.
  - Prisma `Pxxxx` codes → HTTP 500 with generic database message.
- Returns a consistent error response:

```json
{
  "error": {
    "message": "Error message",
    "statusCode": 400
  }
}
```

In development, it may include `stack` and `code` for easier debugging.

---

## 7. Local Development

### 7.1 Prerequisites

- Node.js 16+
- Supabase (or any PostgreSQL database) and a valid `DATABASE_URL`.

### 7.2 Setup

```bash
git clone <your-repo-url>
cd nitespeed

npm install

npx prisma generate
npx prisma migrate dev --name init

npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Local identify endpoint:

```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","phoneNumber":"123456"}'
```

---

## 8. Testing

Tests use Jest and Supertest to exercise the live HTTP layer against the real database.

Run tests:

```bash
npm test
```

The suite includes:

- New primary contact creation.
- Idempotent behaviour for repeated same requests.
- Secondary contact creation on new email / phone.
- Primary merge behaviour across two different primaries.
- Only-email and only-phone flows.
- Validation errors for missing fields and malformed bodies.
- Verification that `primaryContatctId` is present and correctly spelled.

---

## 9. Deployment (Render)

### Build Command

```bash
npm install && npx prisma generate && npx prisma migrate deploy
```

### Start Command

```bash
node server.js
```

### Required Environment Variables

- `DATABASE_URL` – PostgreSQL connection string (Supabase recommended).
- `NODE_ENV` – `production` on Render.

The live instance of this service is configured with these settings at:

```text
https://identity-reconciliation-service-8p7y.onrender.com
```

