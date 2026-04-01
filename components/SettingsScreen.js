import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getTasks } from "../lib/sqlite";
import { fetchAppConfig, getAppConfig } from '../utils';
import { useTheme } from '../contexts/ThemeContext';
import { createThemedStyles } from '../themedStyles';
import { useWebSocket } from '../contexts/WebSocketContext';
import { performLogout } from '../utils/auth';

export default function SettingsScreen({ navigation, route }) {
  const [showLocalData, setShowLocalData] = useState(false);
  const [localStorageData, setLocalStorageData] = useState(null);
  const [uiConfig, setUiConfig] = useState(null);
  const [showWebSocketMessages, setShowWebSocketMessages] = useState(false);
  const [wsMessages, setWsMessages] = useState([]);
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const { isConnected } = useWebSocket();
  const styles = createThemedStyles(theme);

  useEffect(() => {
    const loadUIConfig = async () => {
      const config = await getAppConfig();
      setUiConfig(config?.UIComponents);
    };
    loadUIConfig();
  }, []);

  // Subscribe to WebSocket messages
  useEffect(() => {
    const WebSocketService = require('../services/WebSocketService').default;

    const unsubscribe = WebSocketService.subscribeToMessages((newMessage, allMessages) => {
      setWsMessages(allMessages);
    });

    // Load existing messages
    setWsMessages(WebSocketService.getMessageLog());

    return () => {
      unsubscribe();
    };
  }, []);

  const viewWebSocketMessages = () => {
    const WebSocketService = require('../services/WebSocketService').default;
    setWsMessages(WebSocketService.getMessageLog());
    setShowWebSocketMessages(true);
  };

  const clearWebSocketMessages = () => {
    const WebSocketService = require('../services/WebSocketService').default;
    WebSocketService.clearMessageLog();
    setWsMessages([]);
  };

  const handleLogout = async () => {
    try {
      // Use centralized logout function
      await performLogout({
        reason: 'Manual logout from settings',
        source: 'manual',
        notifyBackend: true
      });
    } catch (error) {
      console.log("Error during logout:", error);
    }
  };

  const viewLocalData = async () => {
    try {
      const accessToken = await SecureStore.getItemAsync("accessToken");
      const refreshToken = await SecureStore.getItemAsync("refreshToken");
      const tasks = await new Promise((resolve) => {
        getTasks((data) => resolve(data));
      });
      const appConfig = await getAppConfig();

      setLocalStorageData({
        accessToken: accessToken ? "***" + accessToken.slice(-10) : "None",
        refreshToken: refreshToken ? "***" + refreshToken.slice(-10) : "None",
        tasksCount: tasks?.length || 0,
        tasks: tasks || [],
        appConfig: appConfig || null,
      });
      setShowLocalData(true);
    } catch (error) {
      console.log("Error loading local data:", error);
      setLocalStorageData({ error: error.message });
      setShowLocalData(true);
    }
  };

  // Refresh App Config handler
  const [refreshingConfig, setRefreshingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState("");

  const handleRefreshAppConfig = async () => {
    setRefreshingConfig(true);
    setConfigMessage("");
    try {
      await fetchAppConfig();
      setConfigMessage("✅ App config updated successfully. URLs refreshed!");
    } catch (_error) {
      setConfigMessage("❌ Failed to update app config.");
    } finally {
      setRefreshingConfig(false);
    }
  };

  const handleClearCache = async () => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem('appConfigJson');
      setConfigMessage("🗑️ Cache cleared. Refresh config to reload.");
    } catch (error) {
      setConfigMessage("❌ Failed to clear cache.");
    }
  };

  return (
    <SafeAreaProvider>
      <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: theme.background, minHeight: '100%' }}>
        <View style={styles.settingsContainer}>
          <Text style={[styles.settingsTitle, { color: theme.text }]}>Settings</Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 4, marginBottom: 8 }}>
            Version v.0.03
          </Text>


          {/* Theme Section */}
          <View style={{ marginTop: 20, marginBottom: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>Appearance</Text>

            {/* Modern Theme Toggle */}
            <View style={{
              flexDirection: 'row',
              backgroundColor: theme.cardBackground,
              borderRadius: 8,
              padding: 4,
              borderWidth: 1,
              borderColor: theme.border,
            }}>
              {/* Light Mode */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  backgroundColor: !isDarkMode ? theme.primary : 'transparent',
                }}
                onPress={() => !isDarkMode ? null : toggleTheme()}
              >
                <Ionicons
                  name="sunny"
                  size={20}
                  color={!isDarkMode ? '#fff' : theme.textSecondary}
                />
                <Text style={{
                  marginLeft: 6,
                  fontSize: 14,
                  fontWeight: '600',
                  color: !isDarkMode ? '#fff' : theme.textSecondary,
                }}>Light</Text>
              </TouchableOpacity>

              {/* Dark Mode */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  backgroundColor: isDarkMode ? theme.primary : 'transparent',
                }}
                onPress={() => isDarkMode ? null : toggleTheme()}
              >
                <Ionicons
                  name="moon"
                  size={20}
                  color={isDarkMode ? '#fff' : theme.textSecondary}
                />
                <Text style={{
                  marginLeft: 6,
                  fontSize: 14,
                  fontWeight: '600',
                  color: isDarkMode ? '#fff' : theme.textSecondary,
                }}>Dark</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Refresh App Config Button */}
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>Developer Tools</Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.viewDataButton, { flex: 1 }]}
                onPress={handleRefreshAppConfig}
                disabled={refreshingConfig}
              >
                <Ionicons name="refresh" size={24} color={theme.primary} />
                <Text style={styles.viewDataButtonText}>
                  {refreshingConfig ? "Updating..." : "Refresh Config"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.viewDataButton, { flex: 0, paddingHorizontal: 16 }]}
                onPress={handleClearCache}
              >
                <Ionicons name="trash-bin-outline" size={24} color="#e63946" />
              </TouchableOpacity>
            </View>

            {configMessage ? (
              <Text style={{
                color: configMessage.includes('✅') ? '#22c55e' : configMessage.includes('❌') ? '#e63946' : theme.primary,
                marginVertical: 6,
                marginLeft: 4,
                fontSize: 13
              }}>
                {configMessage}
              </Text>
            ) : null}
          </View>

          {/* WebSocket Message Viewer - Controlled by UIComponents config */}
          {uiConfig?.DevTools?.WebSocketViewer?.visible !== false && (
            <View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 10,
                marginBottom: 5,
              }}>
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                  WebSocket: {isConnected ? '🟢 Connected' : '🔴 Disconnected'} ({wsMessages.length} messages)
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.viewDataButton, { flex: 1 }]}
                  onPress={viewWebSocketMessages}
                >
                  <Ionicons name="pulse-outline" size={24} color={theme.primary} />
                  <Text style={styles.viewDataButtonText}>View Messages</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewDataButton, { flex: 0, paddingHorizontal: 16 }]}
                  onPress={clearWebSocketMessages}
                >
                  <Ionicons name="trash-outline" size={24} color="#e63946" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* View Local Storage Button - Controlled by UIComponents config */}
          {uiConfig?.DevTools?.ViewLocalStorage?.visible !== false && (
            <TouchableOpacity style={styles.viewDataButton} onPress={viewLocalData}>
              <Ionicons name="folder-open-outline" size={24} color={theme.primary} />
              <Text style={styles.viewDataButtonText}>View Local Storage</Text>
            </TouchableOpacity>
          )}

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#fff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>

          {/* WebSocket Messages Display */}
          {showWebSocketMessages && (
            <View style={styles.localDataContainer}>
              <View style={styles.localDataHeader}>
                <Text style={styles.localDataTitle}>WebSocket Messages ({wsMessages.length})</Text>
                <TouchableOpacity onPress={() => setShowWebSocketMessages(false)}>
                  <Ionicons name="close-circle" size={24} color="#e63946" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.localDataScroll}>
                {wsMessages.length === 0 ? (
                  <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 20 }}>
                    No messages yet
                  </Text>
                ) : (
                  wsMessages.map((entry, index) => (
                    <View
                      key={index}
                      style={{
                        marginBottom: 12,
                        padding: 10,
                        backgroundColor: entry.direction === 'sent' ? '#cce5ff' : '#d4edda',
                        borderRadius: 6,
                        borderLeftWidth: 4,
                        borderLeftColor: entry.direction === 'sent' ? '#007bff' : '#28a745',
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 12, color: '#000' }}>
                          {entry.direction === 'sent' ? '📤 SENT' : '📨 RECEIVED'}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#666' }}>
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </Text>
                      </View>
                      <Text selectable style={{ fontSize: 12, color: '#000', fontFamily: 'monospace' }}>
                        {JSON.stringify(entry.message, null, 2)}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          {/* Local Storage Data Display - Full Screen Modal */}
          <Modal
            visible={showLocalData}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setShowLocalData(false)}
          >
            <View style={{ flex: 1, backgroundColor: theme.background }}>
              {/* Header */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                paddingTop: 50,
                backgroundColor: theme.cardBackground,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}>
                <Text style={{
                  fontSize: 20,
                  fontWeight: 'bold',
                  color: theme.text,
                }}>Local Storage Data</Text>
                <TouchableOpacity
                  onPress={() => setShowLocalData(false)}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: theme.error + '20',
                  }}
                >
                  <Ionicons name="close" size={28} color={theme.error} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16 }}
              >
                <Text
                  selectable
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: theme.text,
                    lineHeight: 18,
                  }}
                >
                  {JSON.stringify(localStorageData, null, 2)}
                </Text>
              </ScrollView>
            </View>
          </Modal>
        </View>
      </ScrollView>
    </SafeAreaProvider>
  );
}
