/**
 * NotificationService.firebase.js
 *
 * Firebase FCM implementation — requires EAS build (NOT compatible with Expo Go).
 *
 * HOW TO SWITCH TO THIS VERSION:
 *   1. Add google-services.json (Android) and GoogleService-Info.plist (iOS) to project root
 *   2. Replace services/NotificationService.js with this file
 *   3. Run: eas build --profile development --platform android  (or ios)
 *   4. Install the dev build on your device and run: npx expo start --dev-client
 */

import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getApiUrl, getValidAccessToken } from '../utils';

// ─────────────────────────────────────────────────────────────────
// FOREGROUND NOTIFICATION DISPLAY
// Firebase does NOT show a banner when the app is open — we do it
// manually via expo-notifications.
// ─────────────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─────────────────────────────────────────────────────────────────
// BACKGROUND MESSAGE HANDLER
// Must be at module level (outside any component).
// Firebase shows the banner automatically for notification payloads.
// This handler is for extra data processing only.
// ─────────────────────────────────────────────────────────────────
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📲 FCM background message:', remoteMessage);
});

// ─────────────────────────────────────────────────────────────────
// ANDROID NOTIFICATION CHANNEL
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// REGISTER FOR PUSH NOTIFICATIONS
// Gets the FCM token directly from Firebase.
// ─────────────────────────────────────────────────────────────────
export async function registerForPushNotifications() {
  try {
    const authStatus = await messaging().requestPermission();
    const granted =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!granted) {
      console.log('⚠️ Push notification permission denied');
      return null;
    }

    const fcmToken = await messaging().getToken();
    if (!fcmToken) {
      console.log('❌ Firebase returned no FCM token');
      return null;
    }

    console.log('✅ FCM token:', fcmToken);
    await setupAndroidChannel();
    await SecureStore.setItemAsync('fcmToken', fcmToken);
    return fcmToken;
  } catch (error) {
    console.log('❌ Error registering for push notifications:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// TOKEN REFRESH LISTENER
// Firebase may rotate FCM tokens — this keeps the backend in sync.
// Call after login. Returns cleanup function.
// ─────────────────────────────────────────────────────────────────
export function setupTokenRefreshListener() {
  const unsubscribe = messaging().onTokenRefresh(async newToken => {
    console.log('🔄 FCM token refreshed');
    await SecureStore.setItemAsync('fcmToken', newToken);
    await registerTokenWithBackend(newToken);
  });
  return unsubscribe;
}

// ─────────────────────────────────────────────────────────────────
// FOREGROUND MESSAGE LISTENER
// Shows a local banner when a Firebase message arrives while the
// app is open. Call after login. Returns cleanup function.
// ─────────────────────────────────────────────────────────────────
export function setupForegroundMessageListener() {
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    console.log('📩 FCM foreground message:', remoteMessage);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: remoteMessage.notification?.title || 'MoveJet',
        body: remoteMessage.notification?.body || '',
        data: remoteMessage.data || {},
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        channelId: 'movejet-default',
      },
      trigger: null,
    });
  });
  return unsubscribe;
}

// ─────────────────────────────────────────────────────────────────
// REGISTER FCM TOKEN WITH BACKEND
// ─────────────────────────────────────────────────────────────────
export async function registerTokenWithBackend(fcmToken) {
  if (!fcmToken) return;
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
      body: JSON.stringify({ userId, email, fcmToken, platform: Platform.OS, tokenType: 'fcm' }),
    });

    if (response.ok) {
      console.log('✅ FCM token registered with backend');
    } else {
      console.log('⚠️ Backend FCM token registration returned:', response.status);
    }
  } catch (error) {
    console.log('⚠️ Error sending FCM token to backend (non-critical):', error);
  }
}

// ─────────────────────────────────────────────────────────────────
// DEREGISTER TOKEN ON LOGOUT
// ─────────────────────────────────────────────────────────────────
export async function deregisterPushToken() {
  try {
    const fcmToken = await SecureStore.getItemAsync('fcmToken');
    if (fcmToken) {
      const accessToken = await getValidAccessToken();
      if (accessToken) {
        await fetch(getApiUrl('REGISTER_PUSH_TOKEN'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'X-Subcont-Token': accessToken },
          body: JSON.stringify({ fcmToken }),
        }).catch(() => {});
      }
    }
    await messaging().deleteToken();
    await SecureStore.deleteItemAsync('fcmToken');
    console.log('✅ FCM token deregistered and deleted');
  } catch (error) {
    console.log('⚠️ Error deregistering FCM token:', error);
  }
}

// ─────────────────────────────────────────────────────────────────
// NOTIFICATION TAP LISTENER
// ─────────────────────────────────────────────────────────────────
export function setupNotificationTapListener(onNotificationTap) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    console.log('📲 Notification tapped:', data);
    if (onNotificationTap) onNotificationTap(data);
  });
  return () => subscription.remove();
}

// ─────────────────────────────────────────────────────────────────
// CHECK FOR NOTIFICATION THAT LAUNCHED THE APP
// ─────────────────────────────────────────────────────────────────
export async function getInitialNotification() {
  try {
    const expoResponse = await Notifications.getLastNotificationResponseAsync();
    if (expoResponse) return expoResponse.notification.request.content.data;

    const firebaseMessage = await messaging().getInitialNotification();
    if (firebaseMessage) return firebaseMessage.data || {};
  } catch (error) {
    console.log('⚠️ Error checking initial notification:', error);
  }
  return null;
}
