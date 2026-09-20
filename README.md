# ACPay Termux-ready

This version removes `better-sqlite3`, so it does not require native SQLite compilation/Python.

## Termux
1. `npm install`
2. `npm start`
3. Open `http://127.0.0.1:3000`

User accounts are stored in `users.json` for this demo.

## Important
This is a demo wallet/authentication app. It does not process real payments, USDT, deposits, or withdrawals.
For a real public deployment, replace JSON storage with a persistent managed database (such as PostgreSQL), use a strong secret, HTTPS, rate limiting, backups, audit logs, and appropriate legal/compliance controls.
