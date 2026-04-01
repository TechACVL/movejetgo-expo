# MoveJetGo

A React Native (Expo) mobile app for moving crew members to view assigned jobs, manage task statuses, edit invoices, and submit payments.

## Features

- **Login** — 3-step authentication: email, password, and OTP verification
- **Tasks** — View active/assigned moves with status badges and full job details
- **Calendar** — Monthly view with color-coded task markers per day
- **Completed** — View finished and declined jobs
- **Job Details** — Status updates, invoice line item editing, payment submission, notes
- **Real-time updates** — WebSocket connection for live task pushes and notifications
- **Dark / Light mode** — Theme toggle with persistent preference
- **Dynamic config** — All permissions, status rules, and dropdowns are controlled from the backend via AppConfig

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Expo Go](https://expo.dev/go) app installed on your iOS or Android device
- Both your phone and computer on the same Wi-Fi network

### Install and Run

```bash
# 1. Install dependencies
npm install

# 2. Start the Expo development server
npx expo start
```

A QR code will appear in the terminal. Open **Expo Go** on your phone and scan it.

- On **Android**: Scan with the Expo Go app directly
- On **iOS**: Scan with the default Camera app, then tap the Expo Go prompt

---

## Changing Backend URLs

All API URLs are defined in one place: **`utils.js`** at the top of the file.

```js
// utils.js — DEFAULT_API_CONFIG (around line 38)

const DEFAULT_API_CONFIG = {
  // Authentication server (login, OTP, token refresh)
  AUTH_BASE_URL: "https://your-auth-server.com",

  // Main API server (tasks, status updates, app config)
  API_BASE_URL: "https://your-api-server.com",

  // Payments / QuickBooks server
  QB_BASE_URL: "https://your-payments-server.com",

  ENDPOINTS: {
    CHECK_USER:       "/check-user",
    LOGIN:            "/auth",
    VERIFY_OTP_LOGIN: "/verify-otp-login",
    REFRESH_TOKEN:    "/refresh-token",
    PERFORM_LOGOUT:   "/agentactive",
    GET_TASKS:        "/server/subcontmovejetgo",
    UPDATE_STATUS:    "/server/subcontmovejetgo/update-subcont-moves",
    GET_APP_CONFIG:   "/server/subcontmovejetgo/app-config-details",
    HANDLE_PAYMENT:   "/server/movejet_invoice_function/payment",
    HANDLE_EDIT_INVOICE: "/server/movejet_invoice_function/invoice",
  }
};
```

**Steps to point the app at a different backend:**

1. Open `utils.js`
2. Replace the values in `DEFAULT_API_CONFIG` with your server URLs
3. Save and the Expo dev server will hot-reload automatically

> The app also supports **dynamic URL overrides at runtime** — the backend can return an `APIConfig` object inside the `GET_APP_CONFIG` response to override any of these defaults without an app update. See the comments at the top of `utils.js` for the expected JSON format.

---

## Project Structure

```
MoveJetGo/
├── App.js                      # Root component, navigation setup, login state
├── app.json                    # Expo app config (name, icons, permissions)
├── app.config.js               # Dynamic Expo config (filters plugins per environment)
├── utils.js                    # API URLs, token management, AppConfig loader
├── styles.js                   # Global styles
├── themedStyles.js             # Theme-aware style factory
│
├── components/
│   ├── LoginScreen.js          # 3-step login (email → password → OTP)
│   ├── TasksScreen.js          # Active tasks list + pull-to-refresh
│   ├── CompletedScreen.js      # Completed / declined tasks
│   ├── CalendarScreen.js       # Calendar with task markers + swipe nav
│   ├── SettingsScreen.js       # Theme toggle, logout, debug tools
│   ├── MoveDetailsCard.js      # Full job detail modal (status, invoice, payment)
│   ├── TaskListItem.js         # Task card component used in lists
│   └── WebSocketIndicator.js   # Connection status dot in header
│
├── contexts/
│   ├── TasksContext.js         # Task data, filtering, caching (30s window)
│   ├── ThemeContext.js         # Dark/light mode state + AsyncStorage persistence
│   └── WebSocketContext.js     # WebSocket connection + action handler registration
│
├── services/
│   ├── api.js                  # Centralized API fetch wrapper
│   └── WebSocketService.js     # WebSocket client (auto-reconnect, heartbeat, logging)
│
├── utils/
│   └── auth.js                 # Logout logic, token refresh, backend notification
│
├── lib/
│   └── sqlite.js               # Local task storage (AsyncStorage-backed)
│
├── constants/
│   └── theme.ts                # Theme color definitions (light + dark)
│
└── assets/                     # App icons, splash screen, logo images
```

---

## Authentication Flow

```
Login Screen
  Step 1 → POST /check-user        (verify email exists)
  Step 2 → POST /auth              (email + password)
  Step 3 → POST /verify-otp-login  (OTP sent to email)

On success → tokens saved to device Keychain (secure storage)
           → AppConfig loaded from backend
           → WebSocket connection opened
```

Tokens are stored using `expo-secure-store` (not AsyncStorage) and are automatically refreshed before expiry. Any 401/403 response triggers automatic logout.

---

## AppConfig — Backend-Driven Permissions

After login, the app fetches a configuration JSON from `GET_APP_CONFIG`. This controls:

| Config Key | Purpose |
|---|---|
| `UIComponents` | Which tabs and sections are visible per user/role |
| `StatusTransitionRules` | Which status changes are allowed from each state |
| `InvoiceProdDesc` | Product list for invoice line items |
| `InvoiceTaxPercentage` | Tax rates by province |
| `AppDropDown` | "Paid Towards" dropdown options |
| `WebSocketConfig` | WebSocket server URL |
| `APIConfig` | Optional: override any API URL at runtime |

The config is cached in AsyncStorage and can be force-refreshed from the Settings screen.

---

## WebSocket Actions

The backend can push the following actions to the app in real time:

| Action | Effect |
|---|---|
| `fetch_task` | Refresh all tasks from backend |
| `push_task_data` | Update a specific task + show notification |
| `notify` | Show a push notification |
| `logout` | Force logout the user with an alert |
| `refresh_config` | Clear and reload AppConfig |

---

## Notes for Developers

- The `app/` folder contains default Expo Router template files — they are **not used** by this app. Navigation is handled manually in `App.js` with React Navigation.
- `eas.json` is included for future EAS (cloud) builds but is not required for Expo Go testing.
- `debug-config.js` is a utility script for checking cached AppConfig — safe to ignore.
- Console logs use emoji prefixes (✅ ❌ 🔄 📤) to make debugging easier in the Metro terminal.
