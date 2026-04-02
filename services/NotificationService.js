import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getApiUrl, getValidAccessToken } from '../utils';

// ─────────────────────────────────────────────
// NOTIFICATION HANDLER (call once at app start)
// Controls how notifications are displayed when
// the app is in the foreground.
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
// Required for Android 8+ to control sound,
// vibration and priority of notifications.
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
  });
  console.log('✅ Android notification channel created');
}

// ─────────────────────────────────────────────
// REGISTER FOR PUSH NOTIFICATIONS
// Requests permission and returns the Expo
// push token (wraps FCM on Android, APNs on iOS)
// ─────────────────────────────────────────────
export async function registerForPushNotifications() {
  try {
    // Request permissions
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

    // Get the EAS project ID from app config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log('❌ No EAS projectId found in app.json — cannot get push token');
      return null;
    }

    // Get Expo push token (used to send via Expo Push API / FCM / APNs)
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    console.log('✅ Expo push token:', token);

    // Set up Android channel
    await setupAndroidChannel();

    // Cache token in secure storage for logout cleanup
    await SecureStore.setItemAsync('expoPushToken', token);

    return token;
  } catch (error) {
    console.log('❌ Error registering for push notifications:', error);
    return null;
  }
}

// ─────────────────────────────────────────────
// REGISTER TOKEN WITH BACKEND
// Sends the push token to your backend so it
// can deliver notifications to this device.
// Call this after a successful login.
// ─────────────────────────────────────────────
export async function registerTokenWithBackend(pushToken) {
  if (!pushToken) return;

  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.log('⚠️ No access token — skipping push token registration');
      return;
    }

    // Extract userId from JWT payload
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
      pushToken,
      platform: Platform.OS,         // 'ios' or 'android'
    };

    console.log('📤 Registering push token with backend:', body);

    const response = await fetch(getApiUrl('REGISTER_PUSH_TOKEN'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Subcont-Token': accessToken,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      console.log('✅ Push token registered with backend successfully');
    } else {
      // Non-critical — app still works without this
      console.log('⚠️ Backend push token registration returned:', response.status);
    }
  } catch (error) {
    // Non-critical — do not block login if this fails
    console.log('⚠️ Error sending push token to backend:', error);
  }
}

// ─────────────────────────────────────────────
// DEREGISTER TOKEN ON LOGOUT
// Removes the push token from the backend so
// notifications are no longer sent to this device
// after the user logs out.
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
      });
      console.log('✅ Push token deregistered from backend');
    }

    await SecureStore.deleteItemAsync('expoPushToken');
  } catch (error) {
    // Non-critical — continue logout even if this fails
    console.log('⚠️ Error deregistering push token:', error);
  }
}

// ─────────────────────────────────────────────
// SETUP NOTIFICATION TAP LISTENER
// Call once in App.js. Returns a cleanup function.
//
// onNotificationTap(data) is called whenever the
// user taps a notification. The data object contains
// whatever your backend included in the notification
// payload (e.g. { taskId, action }).
// ─────────────────────────────────────────────
export function setupNotificationTapListener(onNotificationTap) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    console.log('📲 Notification tapped, data:', data);
    if (onNotificationTap) {
      onNotificationTap(data);
    }
  });

  return () => subscription.remove();
}

// ─────────────────────────────────────────────
// CHECK FOR NOTIFICATION THAT LAUNCHED THE APP
// Call once on app startup to handle the case
// where the app was closed and the user tapped
// a notification to open it.
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
