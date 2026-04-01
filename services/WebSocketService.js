import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * WebSocket Service for MoveJet
 * Handles real-time communication with the backend
 * Supports action-based message handling from appConfig
 */
class WebSocketService {
  constructor() {
    this.ws = null;
    this.url = null;
    this.accessToken = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000; // 3 seconds
    this.reconnectTimeout = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.messageHandlers = {};
    this.appConfig = null;
    this.onConnectionChange = null;
    this.heartbeatInterval = null;
    this.messageLog = []; // Store received messages for debugging
    this.maxLogSize = 50; // Keep last 50 messages
    this.messageLogListeners = []; // Listeners for new messages
  }

  /**
   * Initialize WebSocket connection
   * @param {string} url - WebSocket server URL from appConfig
   * @param {string} accessToken - JWT token for authentication
   * @param {object} appConfig - App configuration containing WebSocketActions
   * @param {function} onConnectionChange - Callback when connection status changes
   */
  async connect(url, accessToken, appConfig, onConnectionChange = null) {
   if (this.isConnecting || this.isConnected) {
     return;
   }

    this.url = url;
    this.accessToken = accessToken;
    this.appConfig = appConfig;
    this.onConnectionChange = onConnectionChange;

    try {
      this.isConnecting = true;

      // Convert https:// to wss:// or http:// to ws://
      let normalizedUrl = url;
      if (url.startsWith('https://')) {
        normalizedUrl = url.replace('https://', 'wss://');
      } else if (url.startsWith('http://')) {
        normalizedUrl = url.replace('http://', 'ws://');
      } else if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        // Assume secure WebSocket if no protocol specified
        normalizedUrl = 'wss://' + url;
      }

      // Create WebSocket connection with token in URL
      const wsUrl = `${normalizedUrl}?token=${encodeURIComponent(accessToken)}`;

      this.ws = new WebSocket(wsUrl);

      // Connection opened
      this.ws.onopen = () => {
        console.log('✅ WebSocket: Connected');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Notify connection change
        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }

        // Start heartbeat
        this.startHeartbeat();

        // Extract userId from JWT token
        let userId = null;
        let userFirstName = null;
        try {
          const payload = JSON.parse(atob(this.accessToken.split('.')[1]));
          userId = payload.sub || payload.userId || payload.user_id || payload.id;
          userFirstName = payload.firstName || payload.first_name || payload.name || '';
        } catch (error) {
          // Silently handle token parsing errors
        }

        // Send authentication message with userId in the format expected by server
        const authMessage = {
          application: 'movejet',
          userId: userId || 'unknown',
          UserFirstName: userFirstName || '',
          Userstatus: 'Active',
          accessToken: this.accessToken,
          timestamp: new Date().toISOString()
        };

        this.send(authMessage);
      };

       // Listen for messages
       this.ws.onmessage = (event) => {
         try {
           const message = JSON.parse(event.data);

           // Log the message
           this.logMessage('received', message);

           this.handleMessage(message);
         } catch (error) {
           // Log non-JSON messages too for debugging
           this.logMessage('received', { raw: event.data, parseError: true });
         }
       };

       // Connection error
       this.ws.onerror = (error) => {
         console.error('❌ WebSocket: Connection error');
         this.isConnecting = false;
       };

       // Connection closed
       this.ws.onclose = (event) => {
         console.log('🔌 WebSocket: Disconnected');
         this.isConnected = false;
         this.isConnecting = false;
         this.stopHeartbeat();

         // Notify connection change
         if (this.onConnectionChange) {
           this.onConnectionChange(false);
         }

         // Attempt reconnection if not a normal closure
         if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
           this.scheduleReconnect();
         }
       };

     } catch (error) {
       console.error('❌ WebSocket: Connection failed');
       this.isConnecting = false;
       this.isConnected = false;
       this.scheduleReconnect();
     }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
     if (this.reconnectTimeout) {
       clearTimeout(this.reconnectTimeout);
     }

     this.reconnectAttempts++;
     const delay = this.reconnectDelay * this.reconnectAttempts;

     this.reconnectTimeout = setTimeout(() => {
       this.connect(this.url, this.accessToken, this.appConfig, this.onConnectionChange);
     }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'ping', timestamp: new Date().toISOString() });
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle incoming WebSocket message based on appConfig actions
   * @param {object} message - Parsed message from server
   */
  async handleMessage(message) {
    const { action, data } = message;

     if (!action) {
       return;
     }

     // Get action configuration from appConfig
     const actionConfig = this.appConfig?.WebSocketActions?.[action];

     if (!actionConfig) {
       return;
     }

     // Call registered handler if exists
     if (this.messageHandlers[action]) {
       try {
         await this.messageHandlers[action](data, message);
       } catch (error) {
         console.error(`❌ WebSocket: Handler error for ${action}`);
       }
     }
  }

  /**
   * Register a handler for a specific action
   * @param {string} action - Action name (e.g., 'notify', 'fetch_task')
   * @param {function} handler - Handler function to call when action is received
   */
   registerHandler(action, handler) {
     this.messageHandlers[action] = handler;
   }

   /**
    * Unregister a handler for a specific action
    * @param {string} action - Action name
    */
   unregisterHandler(action) {
     delete this.messageHandlers[action];
   }

  /**
   * Send message to WebSocket server
   * @param {object} message - Message object to send
   */
   send(message) {
     if (!this.isConnected || !this.ws) {
       return false;
     }

     try {
       this.ws.send(JSON.stringify(message));

       // Log the sent message
       this.logMessage('sent', message);

       return true;
     } catch (error) {
       console.error('❌ WebSocket: Error sending message');
       return false;
     }
  }

  /**
   * Log a WebSocket message for debugging
   * @param {string} direction - 'sent' or 'received'
   * @param {object} message - The message object
   */
  logMessage(direction, message) {
    const logEntry = {
      direction,
      message,
      timestamp: new Date().toISOString(),
    };

    this.messageLog.push(logEntry);

    // Keep only the last N messages
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog.shift();
    }

    // Notify all listeners
    this.messageLogListeners.forEach(listener => {
      try {
        listener(logEntry, this.messageLog);
      } catch (error) {
        console.error('WebSocket: Error in message log listener', error);
      }
    });
  }

  /**
   * Subscribe to message log updates
   * @param {function} listener - Callback function(newMessage, allMessages)
   * @returns {function} Unsubscribe function
   */
  subscribeToMessages(listener) {
    this.messageLogListeners.push(listener);

    // Immediately call with current messages
    if (this.messageLog.length > 0) {
      listener(this.messageLog[this.messageLog.length - 1], this.messageLog);
    }

    // Return unsubscribe function
    return () => {
      const index = this.messageLogListeners.indexOf(listener);
      if (index > -1) {
        this.messageLogListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get all logged messages
   * @returns {array} Array of message log entries
   */
  getMessageLog() {
    return [...this.messageLog];
  }

  /**
   * Clear the message log
   */
  clearMessageLog() {
    this.messageLog = [];
  }

   /**
    * Disconnect WebSocket
    */
   disconnect() {
     if (this.reconnectTimeout) {
       clearTimeout(this.reconnectTimeout);
       this.reconnectTimeout = null;
     }

     this.stopHeartbeat();

     if (this.ws) {
       this.ws.close(1000, 'Client disconnect');
       this.ws = null;
     }

     this.isConnected = false;
     this.isConnecting = false;
     this.reconnectAttempts = 0;
     this.messageHandlers = {};

     if (this.onConnectionChange) {
       this.onConnectionChange(false);
     }
   }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Export singleton instance
export default new WebSocketService();
