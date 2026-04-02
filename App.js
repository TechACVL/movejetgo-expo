import React, { useState, useEffect, useRef } from "react";
import { Image, Platform, UIManager, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";

// Import components
import LoginScreen from './components/LoginScreen';
import TasksScreen from './components/TasksScreen';
import CompletedScreen from './components/CompletedScreen';
import CalendarScreen from './components/CalendarScreen';
import SettingsScreen from './components/SettingsScreen';
import WebSocketIndicator from './components/WebSocketIndicator';
import { fetchAppConfig, getAppConfig, initializeApiConfig } from './utils';
import { TasksProvider } from './contexts/TasksContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { setLogoutCallback } from './utils/auth';
import {
  registerForPushNotifications,
  registerTokenWithBackend,
  setupNotificationTapListener,
  setupForegroundMessageListener,
  setupTokenRefreshListener,
  getInitialNotification,
} from './services/NotificationService';

// Import logo assets
const LOGO_LIGHT = require('./assets/move_Jet.png');
const LOGO_DARK = require('./assets/move_Jet_dark.png');

/* Enable Layout Animation for Android */
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ---------------- Tabs ---------------- */
const Tab = createBottomTabNavigator();

function MainScreen({ onLogout, pendingNotification, onNotificationHandled }) {
  const [uiConfig, setUiConfig] = useState(null);
  const { theme } = useTheme();

  useEffect(() => {
    const loadUIConfig = async () => {
      const config = await getAppConfig();
      setUiConfig(config?.UIComponents);
    };
    loadUIConfig();
  }, []);

  // Default tab configuration
  const defaultTabs = {
    Tasks: { visible: true, label: "Tasks", icon: "list", component: TasksScreen },
    Calendar: { visible: true, label: "Calendar", icon: "calendar", component: CalendarScreen },
    Completed: { visible: true, label: "Completed", icon: "checkmark-done", component: CompletedScreen },
    Settings: { visible: true, label: "Settings", icon: "settings", component: SettingsScreen },
  };

  // Merge with UIConfig
  const tabs = uiConfig?.Tabs
    ? {
        Tasks: { ...defaultTabs.Tasks, ...uiConfig.Tabs.Tasks },
        Calendar: { ...defaultTabs.Calendar, ...uiConfig.Tabs.Calendar },
        Completed: { ...defaultTabs.Completed, ...uiConfig.Tabs.Completed },
        Settings: defaultTabs.Settings, // Always show Settings
      }
    : defaultTabs;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitle: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image
              source={theme.mode === 'dark' ? LOGO_DARK : LOGO_LIGHT}
              style={{ width: 120, height: 50 }}
              resizeMode="contain"
            />
          </View>
        ),
        headerRight: () => <WebSocketIndicator />,
        headerTitleAlign: "center",
        headerStyle: {
          backgroundColor: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff',
        },
        headerTintColor: theme.textColor,
        tabBarStyle: {
          backgroundColor: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff',
          borderTopColor: theme.mode === 'dark' ? '#333' : '#e0e0e0',
        },
        tabBarActiveTintColor: '#e63946',
        tabBarInactiveTintColor: theme.mode === 'dark' ? '#888' : '#666',
        tabBarIcon: ({ color, size }) => {
          const tab = tabs[route.name];
          return <Ionicons name={tab?.icon || "apps"} size={size} color={color} />;
        },
      })}
    >
      {tabs.Tasks?.visible && (
        <Tab.Screen
          name="Tasks"
          options={{ title: tabs.Tasks.label }}
        >
          {(props) => (
            <tabs.Tasks.component
              {...props}
              pendingNotification={pendingNotification}
              onNotificationHandled={onNotificationHandled}
            />
          )}
        </Tab.Screen>
      )}
      {tabs.Calendar?.visible && (
        <Tab.Screen
          name="Calendar"
          component={tabs.Calendar.component}
          options={{ title: tabs.Calendar.label }}
        />
      )}
      {tabs.Completed?.visible && (
        <Tab.Screen
          name="Completed"
          component={tabs.Completed.component}
          options={{ title: tabs.Completed.label }}
        />
      )}
      <Tab.Screen
        name="Settings"
        component={tabs.Settings.component}
        initialParams={{ onLogout: onLogout }}
        options={{ title: tabs.Settings.label }}
      />
    </Tab.Navigator>
  );
}

/* ---------------- Root App ---------------- */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  // Holds data from a tapped push notification so TasksScreen can open the right task
  const [pendingNotification, setPendingNotification] = useState(null);

  // Initialize API config from cache on app startup
  useEffect(() => {
    const init = async () => {
      await initializeApiConfig();
    };
    init();
  }, []);

  // Set global logout callback for auth utility
  useEffect(() => {
    setLogoutCallback(handleLogout);
  }, []);

  // Set up push notification listeners once on app mount
  useEffect(() => {
    // Handle notification tap (app open or backgrounded)
    const cleanupTapListener = setupNotificationTapListener((data) => {
      console.log('📲 Notification tap received in App.js:', data);
      setPendingNotification(data);
    });

    // Show banners for FCM messages received while app is in foreground
    const cleanupForeground = setupForegroundMessageListener();

    // Check if app was launched by tapping a notification (killed state)
    getInitialNotification().then((data) => {
      if (data) setPendingNotification(data);
    });

    return () => {
      cleanupTapListener();
      cleanupForeground();
    };
  }, []);

  // Called when login completes successfully
  const handleLogin = async () => {
    setLoggedIn(true);

    // Fetch fresh appConfig after successful login
    try {
      console.log('🔄 Fetching fresh appConfig after login...');
      await fetchAppConfig();
      console.log('✅ Fresh appConfig fetched successfully');
    } catch (error) {
      console.log('⚠️ Error fetching fresh appConfig after login:', error);
    }

    // Register device for FCM push notifications
    try {
      const fcmToken = await registerForPushNotifications();
      if (fcmToken) {
        await registerTokenWithBackend(fcmToken);
        // Listen for token refreshes (Firebase may rotate the token)
        setupTokenRefreshListener();
      }
    } catch (error) {
      console.log('⚠️ Push notification registration error (non-critical):', error);
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setPendingNotification(null);
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <TasksProvider loggedIn={loggedIn}>
          <WebSocketProvider loggedIn={loggedIn}>
            <NavigationContainer>
              {loggedIn
                ? <MainScreen
                    onLogout={handleLogout}
                    pendingNotification={pendingNotification}
                    onNotificationHandled={() => setPendingNotification(null)}
                  />
                : <LoginScreen onLogin={handleLogin} />
              }
            </NavigationContainer>
          </WebSocketProvider>
        </TasksProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}