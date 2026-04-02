import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getApiUrl, getValidAccessToken } from '../utils';

// ─────────────────────────────────────────────────────────────────
// FOREGROUND NOTIFICATION DISPLAY
// When the app is open and a Firebase message arrives, Firebase
// does NOT show a notification banner by itself — you must display
// it manually using expo-notifications.
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
// Must be registered outside any component, at module level.
// Handles data-only messages when the app is in background/killed.
// Firebase automatically shows the notification banner for messages
// that contain a "notification" payload — this handler is for any
// extra data processing you need to do.
// ─────────────────────────────────────────────────────────────────
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📲 FCM background message received:', remoteMessage);
  // Firebase shows the notification banner automatically.
  // Add any extra background processing here if needed.
});

// ─────────────────────────────────────────────────────────────────
// ANDROID NOTIFICATION CHANNEL
// Required for Android 8+ — controls sound, vibration, priority.
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
// REQUEST PERMISSION & GET FCM TOKEN
// Requests notification permission from the OS, then retrieves
// the device's FCM registration token from Firebase directly.
// This token is sent to your backend and used to target this device.
// ─────────────────────────────────────────────────────────────────
export async function registerForPushNotifications() {
  try {
    // Request permission via Firebase (handles both iOS and Android)
    const authStatus = await messaging().requestPermission();
    const granted =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!granted) {
      console.log('⚠️ Push notification permission denied by user');
      return null;
    }

    // Get the FCM registration token for this device
    const fcmToken = await messaging().getToken();

    if (!fcmToken) {
      console.log('❌ Firebase returned no FCM token');
      return null;
    }

    console.log('✅ FCM token obtained:', fcmToken);

    // Set up Android notification channel
    await setupAndroidChannel();

    // Cache token securely so we can remove it on logout
    await SecureStore.setItemAsync('fcmToken', fcmToken);

    return fcmToken;
  } catch (error) {
    console.log('❌ Error registering for push notifications:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// TOKEN REFRESH LISTENER
// FCM tokens can be rotated by Firebase. Call this once after login
// to keep the backend in sync if the token changes.
// Returns a cleanup function — call it on logout.
// ─────────────────────────────────────────────────────────────────
export function setupTokenRefreshListener() {
  const unsubscribe = messaging().onTokenRefresh(async newToken => {
    console.log('🔄 FCM token refreshed:', newToken);
    await SecureStore.setItemAsync('fcmToken', newToken);
    await registerTokenWithBackend(newToken);
  });
  return unsubscribe;
}

// ─────────────────────────────────────────────────────────────────
// FOREGROUND MESSAGE LISTENER
// Firebase does not display a banner when the app is in the
// foreground — we listen for messages and show them manually
// via expo-notifications. Returns a cleanup function.
// ─────────────────────────────────────────────────────────────────
export function setupForegroundMessageListener() {
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    console.log('📩 FCM foreground message received:', remoteMessage);

    const { notification, data } = remoteMessage;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification?.title || 'MoveJet',
        body: notification?.body || '',
        data: data || {},
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        channelId: 'movejet-default',
      },
      trigger: null, // Show immediately
    });
  });

  return unsubscribe;
}

// ─────────────────────────────────────────────────────────────────
// REGISTER FCM TOKEN WITH BACKEND
// POST the token to your backend after login so it can target
// this device when sending notifications.
// ─────────────────────────────────────────────────────────────────
export async function registerTokenWithBackend(fcmToken) {
  if (!fcmToken) return;

  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.log('⚠️ No access token — skipping FCM token registration');
      return;
    }

    // Extract userId and email from JWT payload
    let userId = null;
    let email = null;
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      userId = payload.sub || payload.userId || payload.user_id || payload.id || null;
      email = payload.email || payload.userEmail || null;
    } catch (e) {
      console.log('⚠️ Could not decode JWT to extract userId');
    }

    const body = {
      userId,
      email,
      fcmToken,
      platform: Platform.OS, // 'ios' or 'android'
      tokenType: 'fcm',      // distinguish from Expo push tokens
    };

    console.log('📤 Registering FCM token with backend:', { userId, platform: Platform.OS });

    const response = await fetch(getApiUrl('REGISTER_PUSH_TOKEN'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Subcont-Token': accessToken,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      console.log('✅ FCM token registered with backend successfully');
    } else {
      console.log('⚠️ Backend FCM token registration returned:', response.status);
    }
  } catch (error) {
    // Non-critical — do not block login
    console.log('⚠️ Error sending FCM token to backend:', error);
  }
}

// ─────────────────────────────────────────────────────────────────
// DEREGISTER TOKEN ON LOGOUT
// Deletes the FCM token from Firebase and removes it from the
// backend so no notifications are sent after logout.
// ─────────────────────────────────────────────────────────────────
export async function deregisterPushToken() {
  try {
    const fcmToken = await SecureStore.getItemAsync('fcmToken');

    // Remove from backend
    if (fcmToken) {
      const accessToken = await getValidAccessToken();
      if (accessToken) {
        await fetch(getApiUrl('REGISTER_PUSH_TOKEN'), {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Subcont-Token': accessToken,
          },
          body: JSON.stringify({ fcmToken }),
        }).catch(() => {}); // Non-critical
      }
    }

    // Delete token from Firebase (forces a new token on next login)
    await messaging().deleteToken();
    await SecureStore.deleteItemAsync('fcmToken');

    console.log('✅ FCM token deregistered and deleted');
  } catch (error) {
    console.log('⚠️ Error deregistering FCM token:', error);
    // Non-critical — continue logout
  }
}

// ─────────────────────────────────────────────────────────────────
// NOTIFICATION TAP LISTENER (expo-notifications)
// Handles tap on a notification banner whether the app is in
// foreground, background, or was killed. Returns cleanup function.
// ─────────────────────────────────────────────────────────────────
export function setupNotificationTapListener(onNotificationTap) {
  // Tap while app is running (foreground or background)
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    console.log('📲 Notification tapped:', data);
    if (onNotificationTap) onNotificationTap(data);
  });

  return () => subscription.remove();
}

// ─────────────────────────────────────────────────────────────────
// CHECK FOR NOTIFICATION THAT LAUNCHED THE APP (killed state)
// Call once on app startup. Returns the notification data if the
// user tapped a notification when the app was fully closed.
// ─────────────────────────────────────────────────────────────────
export async function getInitialNotification() {
  try {
    // Check expo-notifications (for local/foreground-triggered notifications)
    const expoResponse = await Notifications.getLastNotificationResponseAsync();
    if (expoResponse) {
      const data = expoResponse.notification.request.content.data;
      console.log('📲 App launched from expo notification:', data);
      return data;
    }

    // Check Firebase (for remote FCM notifications when app was killed)
    const firebaseMessage = await messaging().getInitialNotification();
    if (firebaseMessage) {
      const data = firebaseMessage.data || {};
      console.log('📲 App launched from FCM notification:', data);
      return data;
    }
  } catch (error) {
    console.log('⚠️ Error checking initial notification:', error);
  }
  return null;
}
