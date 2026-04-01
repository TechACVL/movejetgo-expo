import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useWebSocket } from '../contexts/WebSocketContext';

/**
 * WebSocket Connection Indicator
 * Shows a subtle dot indicator of WebSocket connection status in the header
 *
 * Colors:
 * - Green: Connected
 * - Yellow (pulsing): Connecting
 * - Red: Error
 * - Gray: Disconnected
 */
export default function WebSocketIndicator() {
  // Safely get WebSocket context (may not be available in all scenarios)
  let connectionStatus;
  try {
    const context = useWebSocket();
    connectionStatus = context?.connectionStatus;
  } catch (error) {
    // WebSocket context not available, don't show indicator
    return null;
  }

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for connecting state
  useEffect(() => {
    if (connectionStatus === 'connecting') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connectionStatus, pulseAnim]);

  // Don't show if WebSocket context is not available
  if (!connectionStatus) {
    return null;
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '#10b981'; // Green - connected
      case 'connecting':
        return '#fbbf24'; // Yellow - connecting
      case 'error':
        return '#ef4444'; // Red - error
      case 'disconnected':
      default:
        return '#6b7280'; // Gray - disconnected
    }
  };

  const statusColor = getStatusColor();

  // Only show dot, very subtle
  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: statusColor,
            opacity: pulseAnim,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
