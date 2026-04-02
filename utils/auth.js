import * as SecureStore from "expo-secure-store";
import { saveTasks } from '../lib/sqlite';
import { getApiUrl, getValidAccessToken } from '../utils';
import WebSocketService from '../services/WebSocketService';
import { deregisterPushToken } from '../services/NotificationService';

// Global logout callback - will be set by App.js
let globalLogoutCallback = null;

/**
 * Set the global logout callback from App.js
 * This allows the auth utility to trigger navigation to login screen
 */
export function setLogoutCallback(callback) {
  globalLogoutCallback = callback;
}

/**
 * Notify backend about user logout (for agent activity tracking)
 */
async function notifyBackendLogout() {
  try {
    const token = await getValidAccessToken();
    if (!token) {
      console.log('⚠️ No token available, skipping backend logout notification');
      return;
    }

    // Extract user info from JWT token
    let userId = null;
    let userFirstName = null;
    let email = null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub || payload.userId || payload.user_id || payload.id || null;
      userFirstName = payload.firstName || payload.first_name || payload.name || 'User';
      email = payload.email || payload.userEmail || payload.user_email || null;

      console.log('📤 Extracted user info from token:', { userId, userFirstName, email });
    } catch (error) {
      console.log('⚠️ Error extracting user info from token:', error);
      // Continue with null values if extraction fails
    }

    // Prepare logout message payload
    const logoutPayload = {
      userId: userId,
      Status: "logout",
      UserFirstName: userFirstName,
      email: email,
      Message: "User logged out successfully"
    };

    console.log('📤 Sending logout notification to backend:', logoutPayload);

    // Send logout notification to backend
    const response = await fetch(getApiUrl('PERFORM_LOGOUT'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(logoutPayload),
    });

    if (response.ok) {
      console.log('✅ Backend logout notification sent successfully');
      const result = await response.json();
      console.log('✅ Server response:', result);
    } else {
      console.log('⚠️ Backend logout notification failed:', response.status);
      const errorText = await response.text();
      console.log('⚠️ Error response:', errorText);
    }
  } catch (error) {
    console.log('⚠️ Error notifying backend about logout:', error);
    // Continue with logout even if backend notification fails
  }
}

/**
 * Centralized logout function
 * Handles all logout tasks: token deletion, WebSocket disconnection, 
 * local data cleanup, and navigation to login screen
 * 
 * @param {Object} options - Logout options
 * @param {string} options.reason - Reason for logout (for logging)
 * @param {string} options.source - Source of logout trigger ('manual', 'websocket', 'token_error', 'api_error')
 * @param {boolean} options.notifyBackend - Whether to notify backend (default: true)
 */
export async function performLogout(options = {}) {
  const { reason = 'Manual logout', source = 'manual', notifyBackend = true } = options;
  
  console.log(`🚪 Starting logout process - Source: ${source}, Reason: ${reason}`);
  
  try {
    // 1. Notify backend about logout (if requested and token available)
    if (notifyBackend) {
      await notifyBackendLogout();
    }

    // 2. Disconnect WebSocket connection
    try {
      WebSocketService.disconnect();
      console.log('✅ WebSocket disconnected');
    } catch (error) {
      console.log('⚠️ Error disconnecting WebSocket:', error);
    }

    // 3. Deregister push token from backend
    try {
      await deregisterPushToken();
      console.log('✅ Push token deregistered');
    } catch (error) {
      console.log('⚠️ Error deregistering push token:', error);
    }

    // 4. Delete authentication tokens
    try {
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");
      console.log('✅ Tokens deleted from secure storage');
    } catch (error) {
      console.log('⚠️ Error deleting tokens:', error);
    }

    // 5. Clear local database (tasks and other sensitive data)
    try {
      await saveTasks([]);
      console.log('✅ Local database cleared');
    } catch (error) {
      console.log('⚠️ Error clearing local database:', error);
    }

    // 6. Trigger navigation to login screen via global callback
    if (globalLogoutCallback) {
      try {
        globalLogoutCallback();
        console.log('✅ Navigation to login screen triggered');
      } catch (error) {
        console.log('⚠️ Error triggering logout navigation:', error);
      }
    } else {
      console.log('⚠️ No global logout callback available');
    }

    console.log('✅ Logout process completed successfully');
  } catch (error) {
    console.log('❌ Error during logout process:', error);
    // Still try to trigger navigation even if other steps fail
    if (globalLogoutCallback) {
      globalLogoutCallback();
    }
  }
}

/**
 * Check if response indicates authentication error and trigger logout if needed
 * @param {Response} response - Fetch API response object
 * @param {string} source - Source of the API call for logging
 * @returns {boolean} - True if authentication error was detected
 */
export function handleAuthError(response, source = 'API') {
  if (response.status === 401 || response.status === 403) {
    console.log(`🔒 Authentication error detected (${response.status}) from ${source}`);
    performLogout({
      reason: `Authentication error (${response.status})`,
      source: 'token_error',
      notifyBackend: false // Don't notify backend if token is invalid
    });
    return true;
  }
  return false;
}

/**
 * Wrapper for fetch requests with automatic auth error handling
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {string} source - Source identifier for logging
 * @returns {Promise<Response>} - Fetch response
 */
export async function authenticatedFetch(url, options = {}, source = 'API') {
  try {
    const response = await fetch(url, options);
    
    // Check for authentication errors
    if (handleAuthError(response, source)) {
      throw new Error('Authentication failed - logged out');
    }
    
    return response;
  } catch (error) {
    // If it's not an auth error, re-throw the original error
    if (error.message !== 'Authentication failed - logged out') {
      throw error;
    }
    // For auth errors, return a rejected promise
    throw error;
  }
}