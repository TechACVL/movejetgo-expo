/**
 * NotificationService.js
 *
 * CURRENT MODE: Expo Push Notifications (works in Expo Go for testing)
 *
 * When ready to switch to direct Firebase FCM (requires EAS build, not Expo Go):
 *   - See NotificationService.firebase.js for the Firebase implementation
 *   - Replace this file with that one and run: eas build --profile development
 */

import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getApiUrl, getValidAccessToken } from '../utils';

// ─────────────────────────────────────────────
// FOREGROUND NOTIFICATION DISPLAY
// Controls how notifications appear when the app is open.
// ─────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─────────────────────────────────────────────
// ANDROID NOTIFICATION CHANNEL
// Required for Android 8+ — controls sound, vibration, priority.
// ─────────────────────────────────────────────
export async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('movejet-default', {
    name: 'MoveJet Notifications',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#e63946',
    enableVibrate: true,
    showBadge: true,
    sound: 'default',
  });
  console.log('✅ Android notification channel created');
}

// ─────────────────────────────────────────────
// REGISTER FOR PUSH NOTIFICATIONS
// Requests permission and gets the Expo push token.
// Works in Expo Go and production builds.
// ─────────────────────────────────────────────
export async function registerForPushNotifications() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⚠️ Push notification permission denied by user');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log('❌ No EAS projectId found in app.json — cannot get push token');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    console.log('✅ Expo push token:', token);

    await setupAndroidChannel();
    await SecureStore.setItemAsync('expoPushToken', token);

    return token;
  } catch (error) {
    console.log('❌ Error registering for push notifications:', error);
    return null;
  }
}

// No-op stubs — these become real in the Firebase version
export function setupTokenRefreshListener() {
  return () => {};
}

export function setupForegroundMessageListener() {
  return () => {};
}

// ─────────────────────────────────────────────
// REGISTER TOKEN WITH BACKEND
// ─────────────────────────────────────────────
export async function registerTokenWithBackend(pushToken) {
  if (!pushToken) return;

  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) return;

    let userId = null;
    let email = null;
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      userId = payload.sub || payload.userId || payload.user_id || payload.id || null;
      email = payload.email || payload.userEmail || null;
    } catch (e) {}

    const response = await fetch(getApiUrl('REGISTER_PUSH_TOKEN'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Subcont-Token': accessToken,
      },
      body: JSON.stringify({
        userId,
        email,
        pushToken,
        platform: Platform.OS,
        tokenType: 'expo',
      }),
    });

    if (response.ok) {
      console.log('✅ Push token registered with backend');
    } else {
      console.log('⚠️ Backend push token registration returned:', response.status);
    }
  } catch (error) {
    console.log('⚠️ Error sending push token to backend (non-critical):', error);
  }
}

// ─────────────────────────────────────────────
// DEREGISTER TOKEN ON LOGOUT
// ─────────────────────────────────────────────
export async function deregisterPushToken() {
  try {
    const pushToken = await SecureStore.getItemAsync('expoPushToken');
    if (!pushToken) return;

    const accessToken = await getValidAccessToken();
    if (accessToken) {
      await fetch(getApiUrl('REGISTER_PUSH_TOKEN'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Subcont-Token': accessToken,
        },
        body: JSON.stringify({ pushToken }),
      }).catch(() => {});
    }

    await SecureStore.deleteItemAsync('expoPushToken');
    console.log('✅ Push token deregistered');
  } catch (error) {
    console.log('⚠️ Error deregistering push token:', error);
  }
}

// ─────────────────────────────────────────────
// NOTIFICATION TAP LISTENER
// ─────────────────────────────────────────────
export function setupNotificationTapListener(onNotificationTap) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    console.log('📲 Notification tapped:', data);
    if (onNotificationTap) onNotificationTap(data);
  });
  return () => subscription.remove();
}

// ─────────────────────────────────────────────
// CHECK FOR NOTIFICATION THAT LAUNCHED THE APP
// ─────────────────────────────────────────────
export async function getInitialNotification() {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) {
      const data = response.notification.request.content.data;
      console.log('📲 App launched from notification:', data);
      return data;
    }
  } catch (error) {
    console.log('⚠️ Error checking initial notification:', error);
  }
  return null;
}
