# RoomiePantry: Comprehensive CWE Security Vulnerability & Mitigation Documentation

**Course:** CS3203 Software Engineering  
**Project Group:** CS3203 Group C  
**Application:** RoomiePantry — Shared Living Kitchen & Grocery Management Platform  
**Document Version:** 1.0.0 (Security Engineering Release)  
**Date:** November 2026  

---

## 1. Threat Landscape & Application Security Posture

### 1.1 Shared Living & Student Kitchen Threat Modeling
RoomiePantry operates in an inherently adversarial sociotechnical environment: multi-tenant student housing, shared dormitories, and co-living apartments. Unlike enterprise systems where users operate within rigid corporate hierarchies, domestic software systems face unique threat dynamics characterized by informal relationships, shared physical appliances, shared network perimeters, and differing levels of technical proficiency.

Key threat actors in the RoomiePantry ecosystem include:
1. **Curious or Malicious Roommates (Semi-Trusted Insiders):** Authenticated members of the household who possess legitimate access to shared resources, but attempt to read, tamper with, or delete private personal groceries, tamper with roommate allergy profiles, or modify communal grocery lists without consent.
2. **Local Network Eavesdroppers & Intruders (Untrusted LAN Neighbors):** Unauthenticated third parties connected to the same university subnet, shared apartment Wi-Fi, or residential LAN who port-scan and discover exposed internal services (e.g., Node.js listening on port 3000), attempting automated data extraction, deletion, or denial of service.
3. **External Remote Adversaries (Untrusted External Actors):** Adversaries attempting credential stuffing, brute-force dictionary attacks against authentication endpoints, prompt injection against generative AI assistants, or exploiting unhandled server exceptions to extract sensitive technical infrastructure metadata.
4. **Adversarial Input Injectors:** Users who submit malformed or malicious inputs (such as prototype pollution payloads, prompt injection strings, SQL injection fragments, or negative quantities) to induce application crashes, poison statistical alerts, or force unintended behaviors from third-party LLMs.

### 1.2 Trust Boundaries & Security Architecture
The application defines four distinct trust boundaries across its three architectural tiers:

```
+─────────────────────────────────────────────────────────────────────────────+
|                               TRUST BOUNDARIES                              |
+─────────────────────────────────────────────────────────────────────────────+
| [Client Browser Sandbox] (Untrusted)                                        |
|   - DOM, Local Storage, In-Memory JavaScript State                          |
|   - Context: Any user input is treated as untrusted and potentially hostile |
+─────────────────────────────────────────────────────────────────────────────+
                                       │
                      BOUNDARY 1: HTTP / REST Interface
                                       │
+─────────────────────────────────────────────────────────────────────────────+
| [Express.js Application Engine] (Semi-Trusted Perimeter)                     |
|   - Route Handlers (`src/app.js`)                                           |
|   - Authentication (`src/auth.js`)                                          |
|   - Resource Authorization (`src/pantryOwner.js`)                           |
|   - Input Validation & Output Sanitization Middleware                       |
+─────────────────────────────────────────────────────────────────────────────+
        │                                                     │
   BOUNDARY 2: SQL / IPC Interface               BOUNDARY 3: Outbound HTTPS API
        │                                                     │
+───────────────────────────────────+       +─────────────────────────────────+
| [Persistence Layer] (Trusted)     |       | [Google Gemini API] (Untrusted) |
|   - SqliteStorage (node:sqlite)   |       |   - External Generative LLM     |
|   - FirebaseStorage (Firestore)   |       |   - Generates culinary recipes  |
|   - System Filesystem & Database  |       |   - Untrusted responses audited |
+───────────────────────────────────+       +─────────────────────────────────+
```

1. **Boundary 1 (Browser to Express Server):** Crosses the network perimeter. All incoming HTTP headers, parameters, query strings, and request bodies are treated as completely untrusted. They must undergo strict authentication, session validation, schema type checking, and boundary validation before reaching domain state.
2. **Boundary 2 (Express Server to Storage Engine):** Enforces data layer invariants. Parameterized prepared statements isolate database queries from SQL injection. Storage methods verify record ownership before executing mutations.
3. **Boundary 3 (Express Server to Generative AI Cloud API):** Isolates the application from the non-deterministic third-party LLM subsystem (Google Gemini Studio). Prompt inputs are scrubbed of delimiters; outputs are treated as untrusted data, parsed strictly against schemas, and subjected to a deterministic post-generation dietary allergy blacklist audit.
4. **Boundary 4 (Inter-User Resource Boundary):** Differentiates communal household assets from personal private property, preventing cross-tenant privilege escalation and unauthorized consumption.

---

## 2. Deep-Dive Security Analysis (5 Targeted CWEs)

This section provides an in-depth security analysis for the five chosen Common Weakness Enumerations (CWEs) identified in the RoomiePantry codebase:
- **CWE-863:** Incorrect Authorization
- **CWE-284:** Improper Access Control
- **CWE-20:** Improper Input Validation
- **CWE-639:** Authorization Bypass Through User-Controlled Key (IDOR)
- **CWE-200:** Exposure of Sensitive Information to an Unauthorized Actor

---

### 2.1 CWE-863: Incorrect Authorization

#### 2.1.1 Abstract & Formal Definition
According to MITRE:
> *CWE-863: Incorrect Authorization occurs when an application performs an authorization check, but the logic underlying that check is flawed, granting unauthorized privileges or failing to enforce intended boundaries.*

Unlike missing access control (where no check occurs), CWE-863 denotes an implementation where authorization logic exists and executes, but arrives at an erroneous decision due to incorrect assumptions about identity, improper condition chaining, stale access matrices, or disconnected authorization helper modules.

#### 2.1.2 RoomiePantry Threat Scenario
In a shared apartment, Roommate A (`student1`) purchases expensive, specialized medication or certified gluten-free groceries to manage severe celiac disease. Roommate A registers the item in RoomiePantry with `isShared: false` and `owner: 'student1'`.  
Roommate B (`student2`), an authenticated resident of the same household, accesses the application. If the server verifies that `student2` is a valid household member but fails to evaluate resource-level ownership for private items, Roommate B can modify, consume, or delete Roommate A's private items. Furthermore, if authorization relies on flawed static mappings rather than dynamic database state, authorized actions may be granted to arbitrary actors.

#### 2.1.3 Feature Mapping & Specific Vulnerability Analysis
- **Target File:** `src/pantryOwner.js` & `src/app.js`
- **Vulnerable Feature:** Private Pantry Inventory Management & Resource Mutation (`DELETE /pantry/items/:id`)
- **Code Analysis:**
  In `src/pantryOwner.js`, the ownership validation helper was implemented using a hardcoded, static dictionary:
  ```javascript
  // src/pantryOwner.js (Vulnerable Implementation)
  function pantryOwnerCheck(memberId, pantryId) {
    if (!memberId || !pantryId || typeof memberId !== 'string' || typeof pantryId !== 'string') {
      return false;
    }
    const pantryOwners = {
      valid_pantry_id: 'valid_owner_id'
    };
    return pantryOwners[pantryId] === memberId;
  }
  ```
  **Vulnerability Flaws:**
  1. **Disconnected Policy:** `pantryOwnerCheck` is completely disconnected from the actual persistent database (`pantry_items` table in SQLite/Firestore). Dynamic ownership assignments made through `POST /pantry/items` are never checked against this function.
  2. **Unenforced Route Integration:** In `src/app.js`, the deletion endpoint (`DELETE /pantry/items/:id`) invokes `store.deletePantryItem(id)` directly without calling `pantryOwnerCheck` or inspecting `item.owner`. An authenticated user belonging to the household is incorrectly authorized to delete any private item.

#### 2.1.4 Detailed 3-Phase Mitigation Plan

##### Phase 1: Architecture & Design
Establish a formal, centralized **Attribute-Based Access Control (ABAC)** matrix. The system distinguishes between:
- **Communal Items (`isShared: true`):** Read: Household members. Update/Delete: Household members.
- **Private Items (`isShared: false`):** Read: Household members (for visibility). Update/Delete: *Owner only*.
- **User Settings & Medical Allergies:** Read/Update/Delete: *Owner only*.

Centralize authorization enforcement within dedicated middleware (`src/middleware/authorize.js`) rather than scattered conditional checks.

##### Phase 2: Implementation & Verification
1. Implement contextual resource authorization middleware that retrieves the targeted item from persistence and validates ownership against the authenticated session user. Note that a helper method `getItemById` is added to `PantryStore` (`getItemById(id) { return this.items.find(i => i.id === id) || null; }`) and the store instance is registered with Express (`app.locals.store = store`):

```javascript
// src/middleware/authorize.js
function authorizePantryMutation(req, res, next) {
  const itemId = Number(req.params.id);
  if (Number.isNaN(itemId)) {
    return res.status(400).json({ error: 'Valid numeric item ID required' });
  }

  const item = req.app.locals.store.getItemById(itemId);
  if (!item) {
    return res.status(404).json({ error: 'Pantry item not found' });
  }

  // If item is communal, any authenticated household member is authorized
  if (item.isShared) {
    req.targetItem = item;
    return next();
  }

  // If item is private, the authenticated username must match item.owner
  const currentUsername = req.user ? req.user.username : null;
  if (!currentUsername || item.owner !== currentUsername) {
    return res.status(403).json({
      error: 'Forbidden: You are not authorized to modify or delete this private pantry item'
    });
  }

  req.targetItem = item;
  next();
}
```

2. Refactor `src/app.js` to mount `authorizePantryMutation` on all mutation routes:
```javascript
// src/app.js
app.delete('/pantry/items/:id', requireAuth, authorizePantryMutation, (req, res) => {
  const deleted = store.deletePantryItem(req.targetItem.id);
  return res.json({ success: true, id: req.targetItem.id });
});
```

##### Phase 3: Runtime & Operational Defense
- **Security Audit Logging:** Log all HTTP 403 Forbidden occurrences with timestamp, user ID, requested item ID, and source IP address.
- **Anomaly Detection:** Trigger administrative alerts if a single user account generates more than 5 authorization rejections within 10 minutes, signaling potential account tampering or automated enumeration.

#### 2.1.5 Verification & Test Strategy
Automated integration tests in `test/pantryOwner.test.js` and `test/app.test.js`:
- Test case: User `student1` adds a private item (`isShared: false, owner: 'student1'`).
- Test case: User `student2` attempts `DELETE /pantry/items/:id`. The server must respond with `403 Forbidden` and the item must remain in storage.
- Test case: User `student1` attempts `DELETE /pantry/items/:id`. The server responds with `200 OK` and the item is deleted.
- Test case: Any user attempts `DELETE` on a communal item (`isShared: true`). The server responds with `200 OK`.

---

### 2.2 CWE-284: Improper Access Control

#### 2.2.1 Abstract & Formal Definition
According to MITRE:
> *CWE-284: Improper Access Control occurs when the software does not restrict or incorrectly restricts access to a resource from an unauthorized actor.*

CWE-284 is the overarching weakness where endpoints, resources, or internal application programming interfaces fail to establish a perimeter boundary requiring authentication. This allows unauthenticated external or local actors to invoke privileged functionality directly.

#### 2.2.2 RoomiePantry Threat Scenario
In student accommodation, RoomiePantry is hosted on a shared apartment computer, local Raspberry Pi, or local network. A visitor, neighbor, or malicious student connects to the same university Wi-Fi subnet and conducts a port scan (e.g., `nmap -p 3000 192.168.1.0/24`).  
Finding the RoomiePantry port open, the unauthenticated attacker sends HTTP curl requests directly to `POST /pantry/items`, `DELETE /pantry/items/1`, or `POST /grocery/items`. Because the REST API routes lack authentication enforcement, the attacker can wipe out the household's grocery data, inject bogus inventory, or trigger costly AI generation calls without ever logging in.

#### 2.2.3 Feature Mapping & Specific Vulnerability Analysis
- **Target File:** `src/app.js`
- **Vulnerable Feature:** Entire REST API Surface (`/pantry/*`, `/grocery/*`, `/ai/*`, `/user/*`)
- **Code Analysis:**
  Reviewing `src/app.js` reveals that while `POST /login` was introduced to validate credentials, none of the remaining API endpoints enforce session presence:
  ```javascript
  // src/app.js (Vulnerable Implementation)
  app.post('/pantry/items', (req, res) => {
    // No authentication check! Any unauthenticated client can post items.
    const { name, owner, quantity, expiresOn, isShared } = req.body || {};
    ...
  });

  app.delete('/pantry/items/:id', (req, res) => {
    // No authentication check! Unauthenticated clients can delete items.
    const id = Number(req.params.id);
    const deleted = store.deletePantryItem(id);
    ...
  });
  ```
  Furthermore, the initial `POST /login` handler returned `{ message: 'Login successful' }` without setting a session cookie or issuing a cryptographic token, leaving subsequent client requests completely unauthenticated.

#### 2.2.4 Detailed 3-Phase Mitigation Plan

##### Phase 1: Architecture & Design
Adopt a **Default-Deny Architectural Perimeter**.
- Define an explicit whitelist of public endpoints:
  - `GET /health` (System liveness check)
  - `POST /login` (User authentication)
  - Static frontend assets (`/`, `/index.html`, `/css/*`, `/js/*`)
- Every other endpoint across the `/pantry/`, `/grocery/`, `/ai/`, and `/user/` subtrees must be protected behind an authentication middleware barrier.

##### Phase 2: Implementation & Verification
1. Create a cryptographic session validation middleware `requireAuth`:

```javascript
// src/middleware/auth.js
const crypto = require('crypto');

// Server-side active session store (or signed JWT verification)
const activeSessions = new Map();

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };
  activeSessions.set(token, session);
  return token;
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieHeader = req.headers.cookie;

  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (cookieHeader) {
    const match = cookieHeader.match(/session_token=([a-f0-9]{64})/);
    if (match) token = match[1];
  }

  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const session = activeSessions.get(token);
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized: Session has expired' });
  }

  req.user = { username: session.username };
  next();
}

module.exports = { requireAuth, createSession, activeSessions };
```

2. Mount `requireAuth` globally or across protected route trees in `src/app.js`:
```javascript
// src/app.js
const { requireAuth } = require('./middleware/auth');

// Protect all mutating and private endpoints
app.use('/pantry', requireAuth);
app.use('/grocery', requireAuth);
app.use('/ai', requireAuth);
app.use('/user', requireAuth);
```

##### Phase 3: Runtime & Operational Defense
- **Transport Layer Security (TLS/HTTPS):** In production, mandate HTTPS. Configure HTTP Strict Transport Security (HSTS) headers (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) so session tokens cannot be sniffed over unencrypted Wi-Fi.
- **CORS Hardening:** Configure restrictive Cross-Origin Resource Sharing (CORS) rules rejecting unauthorized origins from communicating with the REST API.

#### 2.2.5 Verification & Test Strategy
Automated tests in `test/login.test.js` and `test/app.test.js`:
- Verify that requests to `POST /pantry/items`, `GET /pantry/items`, `POST /grocery/items`, and `POST /ai/recipe` without an Authorization header or cookie return `401 Unauthorized`.
- Verify that submitting valid credentials to `POST /login` returns a valid session token, and subsequent requests containing that token succeed with `200 OK` / `201 Created`.

---

### 2.3 CWE-20: Improper Input Validation

#### 2.3.1 Abstract & Formal Definition
According to MITRE:
> *CWE-20: Improper Input Validation occurs when an application receives input from an external entity but does not validate or incorrectly validates that the input possesses the properties required to process the data safely and correctly.*

When an application fails to check the type, format, length, range, or syntactic correctness of user-supplied inputs, adversaries can trigger unexpected state transitions, integer overflows/underflows, database corruption, denial-of-service, or injection attacks.

#### 2.3.2 RoomiePantry Threat Scenario
1. **Quantity Underflow:** A user adds a pantry item with `quantity: -9999`. Downstream inventory logic classifies the item erroneously, or grocery list logic calculates corrupt remaining stock.
2. **Date Parser NaN Poisoning:** An attacker inputs `expiresOn: "INVALID_DATE"` or `expiresOn: "99999-99-99"`. When `PantryStore.getExpirationAlerts()` executes:
   ```javascript
   const expiresAt = new Date(item.expiresOn);
   const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
   ```
   `expiresAt.getTime()` returns `NaN`. Arithmetic operations involving `NaN` yield `NaN`, corrupting alert counters (`summary.green`, `summary.red`), breaking the "Cook Now" sorting heuristic, and crashing UI charts.
3. **Prompt Injection / Memory Exhaustion:** Submitting a 50-megabyte string into `/ai/query` or `/user/allergies` causes severe Node.js V8 heap memory pressure or manipulates LLM behavior through adversarial prompt overriding.

#### 2.3.3 Feature Mapping & Specific Vulnerability Analysis
- **Target Files:** `src/app.js`, `allergy_helper.js`, `src/aiRecipeGen.js`
- **Vulnerable Features:** `POST /pantry/items`, `POST /user/allergies`, `POST /ai/recipe`, `POST /ai/query`
- **Code Analysis:**
  In `src/app.js`:
  ```javascript
  // src/app.js (Vulnerable Implementation)
  app.post('/pantry/items', (req, res) => {
    const { name, owner, quantity, expiresOn, isShared } = req.body || {};
    if (!name || !expiresOn) {
      return res.status(400).json({ error: 'name and expiresOn are required' });
    }
    // No check that quantity is a positive integer!
    // No check that expiresOn is a valid ISO date!
    // No check that name length is bounded!
    const item = store.addPantryItem({ name, owner, quantity, expiresOn, isShared });
    return res.status(201).json(item);
  });
  ```
  In `allergy_helper.js`:
  ```javascript
  // allergy_helper.js (Vulnerable Implementation)
  static add(item) {
    if (typeof item !== "string") return false;
    const cleaned = item.trim();
    if (cleaned.length < 2) return false;
    // No upper bound on length! An attacker could submit a 10MB string.
    // No character whitelist! Could contain malicious script tags or control chars.
    this.allergies.add(cleaned);
    return true;
  }
  ```

#### 2.3.4 Detailed 3-Phase Mitigation Plan

##### Phase 1: Architecture & Design
Establish a formal **Input Specification & Validation Schema**:
- All input fields must adhere to strict constraints:
  - `name`: String, 1–100 characters, trimmed, alphanumeric and safe culinary characters.
  - `quantity`: Positive integer, minimum 1, maximum 999.
  - `expiresOn`: Strict ISO 8601 calendar date (`YYYY-MM-DD`), verified against real calendar limits.
  - `allergy`: String, 2–50 characters, letters, hyphens, and spaces only.
  - `aiQueryPrompt`: String, 1–300 characters, control characters stripped.
- Adopt fail-fast validation middleware before any controller logic executes.

##### Phase 2: Implementation & Verification
1. Create a schema validation middleware for pantry items:

```javascript
// src/middleware/validate.js
const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function validatePantryItemInput(req, res, next) {
  const { name, expiresOn, quantity, isShared } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    return res.status(400).json({ error: 'Validation Error: Item name must be a string between 1 and 100 characters' });
  }

  if (!expiresOn || typeof expiresOn !== 'string' || !ISO_DATE_REGEX.test(expiresOn)) {
    return res.status(400).json({ error: 'Validation Error: expiresOn must be a valid ISO date in YYYY-MM-DD format' });
  }

  const d = new Date(expiresOn + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== expiresOn) {
    return res.status(400).json({ error: 'Validation Error: expiresOn represents an invalid calendar date' });
  }

  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ error: 'Validation Error: quantity must be an integer between 1 and 999' });
    }
  }

  if (isShared !== undefined && typeof isShared !== 'boolean') {
    return res.status(400).json({ error: 'Validation Error: isShared must be a boolean' });
  }

  next();
}

module.exports = { validatePantryItemInput };
```

2. Strengthen `allergy_helper.js` with regex whitelisting and length caps:
```javascript
// allergy_helper.js (Hardened Implementation)
class AllergyHelper {
  static ALLERGY_REGEX = /^[A-Za-z][A-Za-z -]{1,49}$/;

  constructor() {
    this.allergies = new Set();
  }

  add(item) {
    if (typeof item !== 'string') return false;
    const cleaned = item.trim().toLowerCase();
    if (cleaned.length < 2 || cleaned.length > 50) return false;
    if (!AllergyHelper.ALLERGY_REGEX.test(cleaned)) return false;
    this.allergies.add(cleaned);
    return true;
  }
}
```

##### Phase 3: Runtime & Operational Defense
- **Payload Size Limiting:** Restrict JSON body size in Express: `app.use(express.json({ limit: '16kb' }))`, mitigating memory-exhaustion denial-of-service attacks.
- **WAF Input Filtering:** Configure edge reverse proxy rules to inspect and drop payloads containing SQL injection keywords or binary control characters.

#### 2.3.5 Verification & Test Strategy
Automated tests in `allergy_helper.test.js`, `test/pantryStock.js`, and `test/app.test.js`:
- Test submitting `{ name: 'Milk', expiresOn: 'invalid-date' }` -> Assert HTTP 400.
- Test submitting `{ name: 'Eggs', expiresOn: '2026-12-01', quantity: -5 }` -> Assert HTTP 400.
- Test submitting `{ name: 'A'.repeat(500), expiresOn: '2026-12-01' }` -> Assert HTTP 400.
- Test `AllergyHelper.add` with 1,000-character strings, numbers, objects, and strings with `<script>` tags -> Assert `false`.

---

### 2.4 CWE-639: Authorization Bypass Through User-Controlled Key (IDOR)

#### 2.4.1 Abstract & Formal Definition
According to MITRE:
> *CWE-639: Authorization Bypass Through User-Controlled Key (Insecure Direct Object Reference / IDOR) occurs when the system uses user-controllable input to identify a resource or an action to perform, but does not verify that the user has the necessary permissions to access that resource.*

When an application exposes direct references to internal database keys (such as autoincrementing integers `1, 2, 3...`) in URLs or request payloads, an attacker can modify the identifier value to access or tamper with unauthorized objects belonging to other users.

#### 2.4.2 RoomiePantry Threat Scenario
RoomiePantry assigns sequential integer IDs to inventory items (`nextItemId = 1, 2, 3...`) and grocery items (`nextGroceryId = 1, 2, 3...`).  
User B (`student2`) adds an item and observes that its assigned ID is `14`. User B anticipates that ID `13` belongs to User A (`student1`). User B issues a direct HTTP request:
```http
DELETE /pantry/items/13 HTTP/1.1
Host: localhost:3000
```
Because the handler takes `:id` directly from the URL parameter and invokes `store.deletePantryItem(13)` without checking who owns item 13, User B successfully deletes User A's private food item. Similarly, User B can issue `PATCH /grocery/items/10` to tamper with grocery list items across households.

#### 2.4.3 Feature Mapping & Specific Vulnerability Analysis
- **Target File:** `src/app.js`
- **Vulnerable Features:** `DELETE /pantry/items/:id`, `PATCH /grocery/items/:id`
- **Code Analysis:**
  ```javascript
  // src/app.js (Vulnerable Implementation)
  app.delete('/pantry/items/:id', (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'valid id required' });
    }

    // Direct Object Reference without authorization check!
    const deleted = store.deletePantryItem(id);
    if (!deleted) {
      return res.status(404).json({ error: 'pantry item not found' });
    }

    return res.json({ success: true, id });
  });

  app.patch('/grocery/items/:id', (req, res) => {
    const id = Number(req.params.id);
    const { checked } = req.body;
    ...
    // Directly mutates grocery item without verifying household membership!
    const updated = store.markGroceryItem(id, checked);
  });
  ```

#### 2.4.4 Detailed 3-Phase Mitigation Plan

##### Phase 1: Architecture & Design
Eliminate reliance on predictable sequential integer identifiers for client-facing references.
- Transition from integer autoincrements to cryptographically random **UUIDv4** or **CUID2** strings (e.g., `item_cm3a7b9x000101q08h`). This eliminates the predictability that enables automated enumeration.
- Implement **Contextual Tenant & Ownership Scoping** at the data layer: all queries must filter by household and ownership context:
  ```sql
  DELETE FROM pantry_items 
  WHERE id = ? AND household_id = ? AND (is_shared = 1 OR owner = ?);
  ```

##### Phase 2: Implementation & Verification
1. Update `PantryStore` methods to require requester identity and enforce contextual domain-level authorization (complementing the HTTP middleware authorization in Section 2.1 as part of our layered Defense-in-Depth architecture):

```javascript
// src/store.js (Hardened Implementation)
deletePantryItem(id, requesterUsername) {
  const index = this.items.findIndex(item => item.id === id);
  if (index === -1) {
    return { status: 404, error: 'Pantry item not found' };
  }

  const targetItem = this.items[index];

  // If item is private, verify that the requester is the legitimate owner
  if (!targetItem.isShared && targetItem.owner !== requesterUsername) {
    return {
      status: 403,
      error: 'Forbidden: You do not have permission to delete this private item'
    };
  }

  // Proceed with deletion
  this.items.splice(index, 1);
  this.bumpVersion();
  this.storage.deletePantryItem(id);
  return { status: 200, success: true, id };
}
```

2. Refactor `src/app.js` route handlers to pass authenticated context:
```javascript
// src/app.js
app.delete('/pantry/items/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'valid id required' });
  }

  const result = store.deletePantryItem(id, req.user.username);
  if (result.status === 404) return res.status(404).json({ error: result.error });
  if (result.status === 403) return res.status(403).json({ error: result.error });

  return res.json({ success: true, id });
});
```

##### Phase 3: Runtime & Operational Defense
- **Rate Limiting on Parameterized Endpoints:** Impose granular rate limits on `/pantry/items/:id` and `/grocery/items/:id` endpoints (e.g., maximum 30 requests per minute) to deter dictionary and sequential enumeration scripts.
- **Sequential Scan Detection:** Monitor web application logs for rapid sequential ID access attempts (`/items/1`, `/items/2`, `/items/3`). Automatically flag and block offending client IPs.

#### 2.4.5 Verification & Test Strategy
Automated tests in `test/pantryOwner.test.js` and `test/app.test.js`:
- Create Item 1 owned privately by `alex`.
- Authenticate as `jamie` and issue `DELETE /pantry/items/1`.
- Verify response is `403 Forbidden` and Item 1 remains intact in `GET /pantry/items`.
- Authenticate as `alex` and issue `DELETE /pantry/items/1`.
- Verify response is `200 OK` and Item 1 is removed.

---

### 2.5 CWE-200: Exposure of Sensitive Information to an Unauthorized Actor

#### 2.5.1 Abstract & Formal Definition
According to MITRE:
> *CWE-200: Exposure of Sensitive Information to an Unauthorized Actor occurs when the product exposes sensitive information to an actor who is not explicitly authorized to have access to that information.*

Information exposure weaknesses allow adversaries to harvest sensitive technical infrastructure details (such as stack traces, database engines, server paths, internal configuration keys) or private personal data (passwords, medical records, dietary health profiles), aiding in subsequent reconnaissance and targeted exploitation.

#### 2.5.2 RoomiePantry Threat Scenario
1. **Medical Allergy Disclosure:** A student records sensitive dietary allergies (e.g. celiac disease, severe anaphylactic allergies, or Crohn's-related dietary restrictions) in RoomiePantry. If the `/sync` snapshot or public endpoints broadcast user allergy profiles to all clients or unauthenticated observers on the network, the student's confidential health data is compromised.
2. **Technical Fingerprinting & Stack Trace Leakage:** When an exception occurs during an AI call or database query in `src/app.js:101`, the route executes: `res.status(500).json({ error: err.message })`. In error scenarios, `err.message` can expose absolute filesystem paths (e.g. `/Users/josh/Documents/...`), Google Gemini API endpoints, or database schema details.
3. **Storage Engine Disclosure:** Endpoint `GET /system/storage` in `src/app.js:44` returns `{ storage: store.storageType }`, revealing the exact persistence mechanism (`sqlite` vs `firebase`) to unauthenticated network scanners.
4. **Hardcoded Plaintext Credentials:** In `src/auth.js:2`, default credentials were hardcoded directly in source control: `users = { student1: 'password123' };`, exposing credentials to any repository viewer.

#### 2.5.3 Feature Mapping & Specific Vulnerability Analysis
- **Target Files:** `src/auth.js`, `src/app.js`, `src/store.js`
- **Vulnerable Features:** `GET /system/storage`, `GET /sync`, Error handling across `/ai/recipe` and `/pantry/ai-recipe`
- **Code Analysis:**
  ```javascript
  // src/auth.js (Vulnerable Implementation)
  const users = {
    student1: 'password123', // Hardcoded plaintext password!
  };

  // src/app.js (Vulnerable Implementation)
  app.get('/system/storage', (_req, res) => {
    // Unnecessary information exposure of internal persistence engine
    res.json({ storage: store.storageType });
  });

  app.post('/ai/recipe', async (req, res) => {
    try {
      ...
    } catch (err) {
      // Leaks internal error message and potentially stack traces to client!
      return res.status(500).json({ error: err.message });
    }
  });
  ```

#### 2.5.4 Detailed 3-Phase Mitigation Plan

##### Phase 1: Architecture & Design
Formulate a strict **Data Classification & Disclosure Policy**:
- **Public:** Static assets, application health status (`/health`).
- **Communal Household:** Shared pantry items, communal grocery list items.
- **Confidential Personal:** Password hashes, personal dietary allergies (scoped exclusively to the authenticated user profile), private pantry items.
- **Internal / Secret:** API keys (`GEMINI_API_KEY`), database paths, error stack traces, server operating system information.

Implement **Data Transfer Objects (DTOs)** that explicitly filter response payloads, preventing the inadvertent leakage of internal entity attributes.

##### Phase 2: Implementation & Verification
1. Remove hardcoded credentials from source code; load user records and salt hashes from protected configuration or database tables:
```javascript
// src/auth.js (Hardened Implementation)
const crypto = require('crypto');

// Passwords stored as salted hashes, never plaintext
const userStore = new Map();

function verifyCredentials(username, plainPassword) {
  if (!userStore.has(username)) return false;
  const { salt, hash } = userStore.get(username);
  const candidateHash = crypto.scryptSync(plainPassword, salt, 64);
  const hashBuf = Buffer.from(hash, 'hex');
  if (hashBuf.length !== candidateHash.length) return false;
  return crypto.timingSafeEqual(hashBuf, candidateHash);
}
```

2. Suppress technical stack traces and internal metadata in error handlers:
```javascript
// src/middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  // Log full error details to internal server logs only
  console.error(`[ERROR] [${new Date().toISOString()}] ${req.method} ${req.url}:`, err);

  // Return sanitized, non-revealing error to client
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  return res.status(500).json({ error: 'An unexpected internal server error occurred' });
}
```

3. Protect sensitive profile data: Ensure `/user/allergies` requires authentication and returns allergies solely for the authenticated `req.user.username`. Restrict or eliminate `GET /system/storage` in production.

##### Phase 3: Runtime & Operational Defense
- **Automated Secret Scanning:** Integrate automated secret detection (e.g., GitHub Secret Scanning, Gitleaks, TruffleHog) into CI workflows to prevent committing API keys, tokens, or credentials.
- **Production Environment Hardening:** Enforce `NODE_ENV=production`. In production mode, Express automatically suppresses default stack trace HTML generation.
- **Security Response Headers:** Configure HTTP security headers:
  - `X-Content-Type-Options: nosniff` (prevents MIME-type sniffing)
  - `X-Frame-Options: DENY` (prevents clickjacking)
  - `Referrer-Policy: strict-origin-when-cross-origin` (prevents sensitive URL query leakage)

#### 2.5.5 Verification & Test Strategy
Automated tests in `test/login.test.js` and `test/app.test.js`:
- Assert that API error responses for invalid AI calls or database failures return generic error messages without stack traces, file paths, or API keys.
- Assert that user authentication responses never include password hashes, salts, or session encryption secrets.
- Verify that `GET /user/allergies?username=student1` returns HTTP 401/403 when queried by unauthenticated clients or different users.

---

## 3. Consolidated Security Controls & Feature Verification Matrix

The following traceability matrix establishes direct linkages between every functional feature in RoomiePantry, its applicable Common Weakness Enumerations, the specific defensive security controls implemented, and the automated verification test files guaranteeing compliance.

```
+──────────────────────────┬──────────────────────────┬──────────────────────────────────────────┬─────────────────────────────────+
| RoomiePantry Feature     | Relevant CWEs            | Applied Defense Controls                 | Verification Test File          |
+──────────────────────────┼──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────────+
| 1. User Authentication   | CWE-284 (Improper Access)| - Salted password hashing (Argon2/scrypt)| test/login.test.js              |
|    & Login Management    | CWE-200 (Info Exposure)  | - Constant-time comparison               | test/app.test.js                |
|    (POST /login)         | CWE-20  (Input Validation)| - Prototype pollution protection         |                                 |
|                          |                          | - Rate limiting & generic error messages |                                 |
+──────────────────────────┼──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────────+
| 2. Private vs Shared     | CWE-863 (Incorrect Authz)| - Attribute-Based Access Control (ABAC)  | test/pantryOwner.test.js        |
|    Pantry Inventory      | CWE-639 (IDOR)           | - Contextual resource ownership scoping  | test/app.test.js                |
|    (POST /pantry/items,  | CWE-284 (Improper Access)| - HTTP 403 on unauthorized mutation      |                                 |
|     DELETE /pantry/:id)  |                          | - Unpredictable identifier transitions   |                                 |
+──────────────────────────┼──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────────+
| 3. Expiration Alerts &   | CWE-20  (Input Validation)| - Strict ISO 8601 regex date validation  | test/pantryStock.js             |
|    "Cook Now" Engine     |                          | - Calendar boundary parsing (NaN guard)  | test/app.test.js                |
|    (GET /pantry/alerts,  |                          | - Integer bounds checking (quantity 1-999)|                                 |
|     GET /cook-now)       |                          | - Safe clamping of overdue horizons      |                                 |
+──────────────────────────┼──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────────+
| 4. User Dietary Allergy  | CWE-200 (Info Exposure)  | - Confidential personal data isolation   | allergy_helper.test.js          |
|    Settings Management   | CWE-20  (Input Validation)| - User-scoped profile authentication     | test/allergy_integration.test.js|
|    (GET/POST/DELETE      |                          | - Strict regex whitelisting (letters only)|                                 |
|     /user/allergies)     |                          | - Length bounds enforcement (2-50 chars) |                                 |
+──────────────────────────┼──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────────+
| 5. AI Recipe Generator   | CWE-20  (Input Validation)| - 3-stage safety pipeline (Pre-filter,    | test/aiRecipeGen.test.js        |
|    & Natural Language    | CWE-200 (Info Exposure)  |   negative prompt, deterministic audit)  |                                 |
|    Assistant (/ai/*)     |                          | - Delimiter isolation against injection  |                                 |
|                          |                          | - Ingredient normalization & whitelist   |                                 |
|                          |                          | - Deterministic offline stub fallback    |                                 |
+──────────────────────────┼──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────────+
| 6. Shared Grocery List   | CWE-284 (Improper Access)| - Session authentication enforcement     | test/app.test.js                |
|    CRUD Operations       | CWE-639 (IDOR)           | - Household tenant scoping               |                                 |
|    (/grocery/items)      |                          | - Boolean type assertion on PATCH        |                                 |
+──────────────────────────┼──────────────────────────┼──────────────────────────────────────────┼─────────────────────────────────+
| 7. System & Persistence  | CWE-200 (Info Exposure)  | - Centralized production error handler   | test/persistence.test.js        |
|    Storage Management    |                          | - Suppression of filesystem paths/secrets| test/app.test.js                |
|    (/system/storage,     |                          | - Parameterized SQL statements           |                                 |
|     /sync)               |                          | - SQLite Write-Ahead Logging atomicity   |                                 |
+──────────────────────────┴──────────────────────────┴──────────────────────────────────────────┴─────────────────────────────────+
```

---

## 4. Verification Summary & Compliance Attestation

All defensive security controls, architectural mitigations, and feature validations detailed within this document are integrated into the RoomiePantry software engineering lifecycle.

### Key Verification Metrics:
- **Zero External Test Dependencies:** Test suites execute natively via `node --test` with sub-second feedback.
- **Deterministic CI Execution:** CI test executions configure `NODE_ENV=test`, bypassing external network connections to Google Gemini Studio and guaranteeing 100% offline test reliability.
- **Complete Feature Traceability:** Every identified weakness (CWE-863, CWE-284, CWE-20, CWE-639, CWE-200) is addressed with a 3-phase architectural, implementation, and operational mitigation plan paired with automated regression tests.

---

*End of Comprehensive CWE Security Vulnerability & Mitigation Documentation.*
