import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import WebSocketService from '../services/WebSocketService';
import { getValidAccessToken, getAppConfig } from '../utils';
import { useTasks } from './TasksContext';
import { performLogout } from '../utils/auth';

const WebSocketContext = createContext();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const WebSocketProvider = ({ children, loggedIn }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const { fetchTasks } = useTasks();

  /**
   * Initialize WebSocket connection when user logs in
   */
  const initializeWebSocket = useCallback(async () => {
    try {
      console.log('WebSocket: Initializing connection...');

      // Get access token
      const token = await getValidAccessToken();
      if (!token) {
        console.log('WebSocket: No access token available');
        return;
      }

      // Get app config
      const appConfig = await getAppConfig();
      if (!appConfig?.WebSocketConfig?.url) {
        console.log('WebSocket: No WebSocket URL in appConfig');
        return;
      }

      const wsUrl = appConfig.WebSocketConfig.url;
      console.log('WebSocket: Connecting to', wsUrl);

      // Register action handlers
      registerActionHandlers(appConfig);

      // Connect to WebSocket
      await WebSocketService.connect(
        wsUrl,
        token,
        appConfig,
        (connected) => {
          setIsConnected(connected);
          setConnectionStatus(connected ? 'connected' : 'disconnected');
        }
      );

    } catch (error) {
      console.error('WebSocket: Initialization error', error);
      setConnectionStatus('error');
    }
  }, [fetchTasks]);

  /**
   * Register handlers for different WebSocket actions
   */
  const registerActionHandlers = (appConfig) => {
    const actions = appConfig?.WebSocketActions || {};

    // Handler for 'notify' action - Show notification
    if (actions.notify) {
      WebSocketService.registerHandler('notify', async (data, message) => {
        console.log('WebSocket: Notify action received', data);
        await handleNotification(data);
      });
    }

    // Handler for 'fetch_task' action - Refresh tasks
    if (actions.fetch_task) {
      WebSocketService.registerHandler('fetch_task', async (data, message) => {
        console.log('WebSocket: Fetch task action received', data);
        await handleFetchTask(data);
      });
    }

    // Handler for 'push_task_data' action - Update specific task
    if (actions.push_task_data) {
      WebSocketService.registerHandler('push_task_data', async (data, message) => {
        console.log('WebSocket: Push task data action received', data);
        await handlePushTaskData(data);
      });
    }

    // Handler for 'logout' action - Force logout
    if (actions.logout) {
      WebSocketService.registerHandler('logout', async (data, message) => {
        console.log('WebSocket: Logout action received', data);
        await handleLogout(data);
      });
    }

    // Handler for 'push_usage_log' action - Log usage data
    if (actions.push_usage_log) {
      WebSocketService.registerHandler('push_usage_log', async (data, message) => {
        console.log('WebSocket: Push usage log action received', data);
        await handlePushUsageLog(data);
      });
    }

    // Handler for 'refresh_config' action - Refresh app configuration
    if (actions.refresh_config) {
      WebSocketService.registerHandler('refresh_config', async (data, message) => {
        console.log('WebSocket: Refresh config action received', data);
        await handleRefreshConfig(data);
      });
    }

    console.log('WebSocket: All handlers registered');
  };

  /**
   * Handle notification action
   */
  const handleNotification = async (data) => {
    const { title, body, priority, sound } = data;

    try {
      // Request notification permissions if not already granted
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('WebSocket: Notification permission not granted');
        return;
      }

      // Schedule notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title || 'MoveJet Notification',
          body: body || '',
          sound: sound !== false,
          priority: priority || Notifications.AndroidNotificationPriority.HIGH,
          data: data,
        },
        trigger: null, // Show immediately
      });

      console.log('WebSocket: Notification sent');
    } catch (error) {
      console.error('WebSocket: Error sending notification', error);
    }
  };

  /**
   * Handle fetch task action - Refresh all tasks
   */
  const handleFetchTask = async (data) => {
    try {
      console.log('WebSocket: Fetching tasks...');
      await fetchTasks(true); // Force refresh
      console.log('WebSocket: Tasks fetched successfully');
    } catch (error) {
      console.error('WebSocket: Error fetching tasks', error);
    }
  };

  /**
   * Handle push task data action - Update specific task
   */
  const handlePushTaskData = async (data) => {
    try {
      console.log('WebSocket: Pushing task data', data);

      // If specific task data is provided, we could update just that task
      // For now, refresh all tasks to get the latest data
      await fetchTasks(true);

      // Show notification about task update
      if (data.taskId || data.taskRecordId) {
        await handleNotification({
          title: 'Task Updated',
          body: `Task ${data.taskId || data.taskRecordId} has been updated`,
          data: data,
        });
      }
    } catch (error) {
      console.error('WebSocket: Error pushing task data', error);
    }
  };

  /**
   * Handle logout action - Force user logout
   */
  const handleLogout = async (data) => {
    const { reason, message } = data;

    try {
      Alert.alert(
        'Session Ended',
        message || reason || 'You have been logged out by the administrator.',
        [
          {
            text: 'OK',
            onPress: async () => {
              // Use centralized logout function
              await performLogout({
                reason: reason || 'WebSocket logout action',
                source: 'websocket',
                notifyBackend: true
              });
              console.log('WebSocket: User logged out via centralized function');
            }
          }
        ]
      );
    } catch (error) {
      console.error('WebSocket: Error handling logout', error);
      // Fallback to direct logout if alert fails
      await performLogout({
        reason: reason || 'WebSocket logout action (fallback)',
        source: 'websocket',
        notifyBackend: true
      });
    }
  };

  /**
   * Handle push usage log action
   */
  const handlePushUsageLog = async (data) => {
    try {
      console.log('WebSocket: Usage log requested', data);

      // This would collect and send usage statistics
      // For now, just acknowledge receipt
      WebSocketService.send({
        type: 'usage_log_response',
        status: 'acknowledged',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('WebSocket: Error handling usage log', error);
    }
  };

  /**
   * Handle refresh config action
   */
  const handleRefreshConfig = async (data) => {
    try {
      console.log('WebSocket: Refreshing app configuration');

      // Clear cached config and fetch new one
      const appConfig = await getAppConfig(true); // true = force refresh

      // Show notification
      await handleNotification({
        title: 'Configuration Updated',
        body: 'App configuration has been refreshed',
      });

      console.log('WebSocket: Config refreshed successfully');
    } catch (error) {
      console.error('WebSocket: Error refreshing config', error);
    }
  };

  /**
   * Connect WebSocket when user logs in
   */
  useEffect(() => {
    if (loggedIn) {
      initializeWebSocket();
    } else {
      // Disconnect when user logs out
      WebSocketService.disconnect();
      setIsConnected(false);
      setConnectionStatus('disconnected');
    }

    // Cleanup on unmount
    return () => {
      WebSocketService.disconnect();
    };
  }, [loggedIn]); // Only depend on loggedIn to prevent infinite loop

  /**
   * Send message through WebSocket
   */
  const sendMessage = useCallback((message) => {
    return WebSocketService.send(message);
  }, []);

  /**
   * Manual reconnect
   */
  const reconnect = useCallback(async () => {
    setConnectionStatus('connecting');
    await initializeWebSocket();
  }, [initializeWebSocket]);

  const value = {
    isConnected,
    connectionStatus,
    sendMessage,
    reconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
