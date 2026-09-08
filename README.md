# Roomie Pantry

Roomie Pantry is a responsive web app (PWA-ready) for housemates to manage shared pantry inventory, monitor expiry status, and maintain a shopping list.

## Implemented architecture

- **Frontend**: Single-page web app (vanilla JS + responsive CSS) served from `public/`
- **Backend**: Node.js + Express REST API (`server.js`)
- **Database**: SQLite (`data/roomie-pantry.db`) via `sqlite3`
- **Auth**: Email/password + JWT bearer tokens

### Modules

- User & Household Management
  - Register/login
  - Create household
  - Join household via invite code
- Pantry Inventory Management
  - Create/list/update/delete pantry items
  - Quantity, unit, category, optional expiry date
- Expiry Logic
  - API computes `expired`, `expiring` (<=3 days), `fresh`, or `none`
- Shopping List Management
  - Create/list/delete items
  - Toggle checked/unchecked state
- Activity Feed (optional module implemented)
  - Records major household events

## Data model

- `users`
- `households`
- `memberships` (User ↔ Household)
- `pantry_items`
- `shopping_list_items`
- `activity_events` (optional audit feed)

## API overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `POST /api/households`
- `POST /api/households/join`
- `GET|POST /api/households/:householdId/pantry`
- `PUT|DELETE /api/households/:householdId/pantry/:itemId`
- `GET|POST /api/households/:householdId/shopping-list`
- `PATCH|DELETE /api/households/:householdId/shopping-list/:itemId`
- `GET /api/households/:householdId/activity`

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

### Useful scripts

- `npm start` – run server
- `npm run dev` – run with watch mode
- `npm test` – run Node test runner

## Milestone mapping

- ✅ Milestone 1: setup, auth, household create/join
- ✅ Milestone 2: pantry CRUD + listing
- ✅ Milestone 3: expiry highlighting + shopping list
- ⏳ Milestone 4: further polish, richer tests, deployment workflow
