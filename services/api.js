import * as SecureStore from "expo-secure-store";
import { getApiUrl } from '../utils';

/**
 * Centralized API service for all network calls
 * This can be updated via appConfig in the future
 */

class ApiService {
  /**
   * Get authorization token
   */
  async getToken() {
    const token = await SecureStore.getItemAsync("accessToken");
    if (!token) {
      throw new Error("No authentication token found. Please login again.");
    }
    return token;
  }

  /**
   * Generic API call handler
   */
  async makeApiCall(endpoint, options = {}) {
    try {
      const token = await this.getToken();
      const url = getApiUrl(endpoint);

      const defaultHeaders = {
        'X-Subcont-Token': token,
        'content-type': 'application/json',
      };

      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `API call failed with status ${response.status}`);
      }

      return result;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskRecordId, newStatus, statusNotes = '') {
    const payload = [{
      TaskRecord_ID: taskRecordId,
      Task_Status: newStatus,
      Status_Notes: statusNotes,
    }];

    return this.makeApiCall('UPDATE_STATUS', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Submit payment
   */
  async submitPayment(paymentData) {
    console.log('📤 Sending payment payload:', JSON.stringify(paymentData, null, 2));

    const result = await this.makeApiCall('HANDLE_PAYMENT', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });

    console.log('Payment submission result:', result);
    return result;
  }

  /**
   * Send invoice
   */
  async sendInvoice(invoiceData) {
    console.log('📤 Sending invoice payload:', JSON.stringify(invoiceData, null, 2));

    const result = await this.makeApiCall('HANDLE_EDIT_INVOICE', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });

    console.log('Send invoice result:', result);
    return result;
  }

  /**
   * Fetch tasks
   */
  async fetchTasks() {
    return this.makeApiCall('GET_TASKS', {
      method: 'GET',
    });
  }

  /**
   * Fetch app config
   */
  async fetchAppConfig() {
    return this.makeApiCall('GET_APP_CONFIG', {
      method: 'GET',
    });
  }
}

// Export singleton instance
export default new ApiService();
