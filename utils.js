import * as SecureStore from "expo-secure-store";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performLogout } from './utils/auth';

// ============ API CONFIGURATION ============
/**
 * API Configuration System
 *
 * This configuration centralizes all API URLs and endpoints.
 * URLs can be overridden via AppConfig JSON from the backend.
 *
 * To configure URLs from backend, add an "APIConfig" object to your app-config-details response:
 *
 * {
 *   "InvoiceProdDesc": [...],
 *   "InvoiceTaxPercentage": [...],
 *   "StatusTransitionRules": [...],
 *   "UIComponents": {...},
 *   "APIConfig": {
 *     "AUTH_BASE_URL": "https://your-auth-server.com",
 *     "API_BASE_URL": "https://your-api-server.com",
 *     "QB_BASE_URL": "https://your-qb-server.com",
 *     "ENDPOINTS": {
 *       "LOGIN": "/custom-login-path",
 *       "GET_TASKS": "/custom-tasks-path",
 *       ...
 *     }
 *   }
 * }
 *
 * This allows you to:
 * 1. Switch between dev/staging/production environments easily
 * 2. Change API endpoints without updating the app
 * 3. Manage all URLs in one centralized database location
 */

// Default API URLs - using appConfig structure as defaults
const DEFAULT_API_CONFIG = {
  // Auth base URL (for login, OTP, password verification, token refresh)
  AUTH_BASE_URL: "https://crewappsail-10101302114.development.catalystappsail.com",

  // Main API base URL (for tasks, status updates, config, etc.)
  API_BASE_URL: "https://crewprodnew-841904208.development.catalystserverless.com",

  // QuickBooks/Payment base URL (same as API_BASE_URL now)
  QB_BASE_URL: "https://crewprodnew-841904208.development.catalystserverless.com",

  // API Endpoints (relative paths) - using appConfig structure as defaults
  ENDPOINTS: {
    // Auth endpoints
    CHECK_USER: "/check-user",
    LOGIN: "/auth",
    VERIFY_OTP_LOGIN: "/verify-otp-login",
    REFRESH_TOKEN: "/refresh-token",
    PERFORM_LOGOUT: "/agentactive", // Agent activity tracking on logout

    // Task/Move endpoints
    GET_TASKS: "/server/subcontmovejetgo",
    UPDATE_STATUS: "/server/subcontmovejetgo/update-subcont-moves",
    GET_APP_CONFIG: "/server/subcontmovejetgo/app-config-details",

    // QuickBooks/Payment endpoints (matching appConfig structure)
    HANDLE_PAYMENT: "/server/movejet_invoice_function/payment",
    HANDLE_EDIT_INVOICE: "/server/movejet_invoice_function/invoice",
  }
};

// Runtime API config (can be updated from AppConfig)
let runtimeApiConfig = { ...DEFAULT_API_CONFIG };

// Function to update API config from AppConfig JSON
export function updateApiConfig(apiConfigFromBackend) {
  if (apiConfigFromBackend) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔧 UPDATING API CONFIG');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📥 Received API Config from backend:');
    console.log(JSON.stringify(apiConfigFromBackend, null, 2));
    console.log('───────────────────────────────────────────────────────');

    runtimeApiConfig = {
      ...DEFAULT_API_CONFIG,
      ...apiConfigFromBackend,
      ENDPOINTS: {
        ...DEFAULT_API_CONFIG.ENDPOINTS,
        ...(apiConfigFromBackend.ENDPOINTS || {})
      }
    };

    console.log('✅ Runtime API Config AFTER update:');
    console.log(JSON.stringify(runtimeApiConfig, null, 2));
    console.log('═══════════════════════════════════════════════════════');
  }
}

// Helper to build full URL
export function getApiUrl(endpointKey) {
  const endpoint = runtimeApiConfig.ENDPOINTS[endpointKey];
  if (!endpoint) {
    console.warn(`⚠️ Unknown endpoint: ${endpointKey}`);
    return '';
  }

  // If endpoint is already a full URL (starts with http:// or https://), return it as-is
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    console.log(`✅ Using full URL from config for ${endpointKey}:`, endpoint);
    return endpoint;
  }

  // Otherwise, determine which base URL to use based on endpoint
  let baseUrl;
  if (['CHECK_USER', 'LOGIN', 'VERIFY_OTP_LOGIN', 'REFRESH_TOKEN', 'PERFORM_LOGOUT'].includes(endpointKey)) {
    baseUrl = runtimeApiConfig.AUTH_BASE_URL;
  } else if (['HANDLE_PAYMENT'].includes(endpointKey)) {
    // Payment endpoints use QB_BASE_URL
    baseUrl = runtimeApiConfig.QB_BASE_URL;
  } else {
    // All other endpoints (tasks, invoices) use API_BASE_URL
    baseUrl = runtimeApiConfig.API_BASE_URL;
  }

  const fullUrl = `${baseUrl}${endpoint}`;
  console.log(`✅ Built URL for ${endpointKey}:`, fullUrl);
  return fullUrl;
}

// Export commonly used URLs for backward compatibility
export const BASE_URL = () => runtimeApiConfig.AUTH_BASE_URL;
export const TASK_URL = () => getApiUrl('GET_TASKS');
export const UPDATE_STATUS_URL = () => getApiUrl('UPDATE_STATUS');

// Helper to format dates to DD-MMM-YYYY
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (error) {
    return 'N/A';
  }
}

// Helper to parse Invoice_Items string format
export function parseInvoiceItems(invoiceItemsString) {
  if (!invoiceItemsString || typeof invoiceItemsString !== 'string') {
    return [];
  }

  try {
    console.log('Parsing invoice items:', invoiceItemsString);

    // Remove outer brackets
    let cleaned = invoiceItemsString.trim();
    if (cleaned.startsWith('[')) cleaned = cleaned.slice(1);
    if (cleaned.endsWith(']')) cleaned = cleaned.slice(0, -1);

    // Split by '},{'  to get individual items
    const items = [];
    let current = '';
    let braceDepth = 0;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;

      current += char;

      if (braceDepth === 0 && char === '}') {
        // Parse this item
        const itemStr = current.trim();
        console.log('Parsing item:', itemStr);
        const item = {};

        // Better parsing: extract key=value pairs using regex to handle values with commas and spaces
        const content = itemStr.slice(1, -1); // Remove outer braces

        // Match patterns like: key=value where value can contain spaces but ends at comma+key or end
        const keyValueRegex = /(\w+)\s*=\s*([^,]+?)(?=\s*,\s*\w+\s*=|$)/g;
        let match;

        while ((match = keyValueRegex.exec(content)) !== null) {
          const key = match[1].trim();
          const value = match[2].trim();
          item[key] = value;
        }

        console.log('Parsed item object:', item);

        items.push({
          product: item.desc || '', // desc -> Product (main display)
          description: item.prod || '', // prod -> Description (secondary display)
          idValue: item.IdValue || '', // IdValue for ItemRef.value during send
          quantity: item.qty || '0', // Keep as string to preserve decimal input
          rate: item.rate || '0', // Keep as string to preserve decimal input
          amount: parseFloat(item.amount) || 0,
          taxCodeRef: item.TaxCodeRef || null, // TaxCodeRef from line item (highest priority)
        });

        current = '';
      }
    }

    console.log('Final parsed items:', items);
    return items;
  } catch (error) {
    console.log('Error parsing invoice items:', error);
    return [];
  }
}

// Helper to send payment JSON to endpoint
export async function sendPaymentJson(paymentJson) {
  try {
    const token = await getValidAccessToken();
    const response = await fetch(getApiUrl('HANDLE_PAYMENT'), {
      method: 'POST',
      headers: {
        'X-Subcont-Token': token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(paymentJson),
    });
    const result = await response.json();
    console.log('Payment POST result:', result);
    return result;
  } catch (err) {
    console.log('Error sending payment JSON:', err);
    throw err;
  }
}

// Token Helper
export async function getValidAccessToken() {
  let token = await SecureStore.getItemAsync("accessToken");
  const refreshToken = await SecureStore.getItemAsync("refreshToken");

  if (!token && !refreshToken) return null;

  try {
    // Check if token expired (simple decode, optional)
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now && refreshToken) {
      // Refresh the token
      const response = await fetch(getApiUrl('REFRESH_TOKEN'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      
      // Check for authentication errors during token refresh
      if (response.status === 401 || response.status === 403) {
        console.log('🔒 Token refresh failed - authentication error');
        performLogout({
          reason: 'Token refresh failed',
          source: 'token_error',
          notifyBackend: false
        });
        return null;
      }
      
      const data = await response.json();
      if (data.accessToken && data.refreshToken) {
        await SecureStore.setItemAsync("accessToken", data.accessToken);
        await SecureStore.setItemAsync("refreshToken", data.refreshToken);
        token = data.accessToken;
      }
    }
  } catch (error) {
    console.log("Error validating token:", error);
  }
  return token;
}

// Payment method options are now fetched from backend app config via getAppConfig()

// Status color mapping
export const statusColors = {
  'Assigned': '#fbbf24',      // Amber/Yellow
  'Accepted': '#3b82f6',      // Blue
  'In progress': '#8b5cf6',   // Purple
  'Completed': '#10b981',     // Green
  'Declined': '#ef4444',      // Red
};


// App Config fetch/store helpers (now using AsyncStorage)
const APP_CONFIG_KEY = 'appConfigJson';

// Initialize API config from cached data on app startup
// This ensures URLs are available before any API calls
export async function initializeApiConfig() {
  try {
    console.log('🔄 Initializing API Config from cache...');
    const configStr = await AsyncStorage.getItem(APP_CONFIG_KEY);
    if (configStr) {
      const config = JSON.parse(configStr);
      if (config.APIConfig) {
        console.log('📦 Found cached API Config, applying it now...');
        updateApiConfig(config.APIConfig);
      } else {
        console.log('⚠️ No APIConfig found in cached appConfig');
      }
    } else {
      console.log('⚠️ No cached appConfig found, using DEFAULT_API_CONFIG');
    }
  } catch (err) {
    console.error('❌ ERROR loading cached API config:', err);
    // Fallback to defaults - already set in runtimeApiConfig
  }
}

// Fetch config from API and store in AsyncStorage
export async function fetchAppConfig() {
  try {
    console.log('🌐 Fetching fresh AppConfig from backend...');
    const token = await getValidAccessToken();
    const apiUrl = getApiUrl('GET_APP_CONFIG');
    console.log('📍 Fetching from:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-Subcont-Token': token,
        'content-type': 'application/json',
      },
    });
    const result = await response.json();

    if (result.status === 'success' && result.data) {
      console.log('✅ AppConfig fetched successfully');

      // Update API config if provided in app config
      if (result.data.APIConfig) {
        console.log('📝 Updating API Config from fetched data...');
        updateApiConfig(result.data.APIConfig);
      } else {
        console.log('⚠️ No APIConfig in fetched data');
      }

      console.log('💾 Saving AppConfig to AsyncStorage...');
      await AsyncStorage.setItem(APP_CONFIG_KEY, JSON.stringify(result.data));
      console.log('✅ AppConfig saved to cache');

      return result.data;
    } else {
      throw new Error('Failed to fetch app config');
    }
  } catch (err) {
    console.error('❌ ERROR fetching app config:', err);
    throw err;
  }
}

// Get config from AsyncStorage (returns parsed object or null)
export async function getAppConfig() {
  try {
    const configStr = await AsyncStorage.getItem(APP_CONFIG_KEY);
    return configStr ? JSON.parse(configStr) : null;
  } catch (err) {
    console.log('Error reading app config:', err);
    return null;
  }
}
