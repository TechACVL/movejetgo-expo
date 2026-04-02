import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform,
  Modal,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TaskListItem from './TaskListItem';
import MoveDetailsCard from './MoveDetailsCard';
import { useTasks } from '../contexts/TasksContext';
import { useTheme } from '../contexts/ThemeContext';
import { createThemedStyles } from '../themedStyles';

export default function TasksScreen({ route, navigation, pendingNotification, onNotificationHandled }) {
  const { activeTasks, loading, fetchTasks, updateTask } = useTasks();
  const { theme } = useTheme();
  const styles = createThemedStyles(theme);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [fromCalendar, setFromCalendar] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (route?.params?.highlightTask && activeTasks.length > 0) {
      const taskId = route.params.highlightTask;
      const task = activeTasks.find(t => t.TaskRecord_ID === taskId);
      if (task) {
        setSelectedTask(task);
        setShowTaskModal(true);
        setFromCalendar(route.params.fromCalendar || false);
        // Clear the params to prevent reopening on return
        navigation.setParams({ highlightTask: undefined, fromCalendar: undefined });
      }
    }
  }, [route?.params?.highlightTask, activeTasks, navigation]);

  // Handle push notification tap — open the relevant task modal
  useEffect(() => {
    if (pendingNotification && activeTasks.length > 0) {
      const taskId = pendingNotification.taskId || pendingNotification.TaskRecord_ID;
      if (taskId) {
        const task = activeTasks.find(t => t.TaskRecord_ID === taskId);
        if (task) {
          setSelectedTask(task);
          setShowTaskModal(true);
        }
      }
      if (onNotificationHandled) onNotificationHandled();
    }
  }, [pendingNotification, activeTasks]);

  const handleTaskPress = (task) => {
    setSelectedTask(task);
    setShowTaskModal(true);
    setFromCalendar(false);
  };

  const handleCloseModal = () => {
    setShowTaskModal(false);
    setSelectedTask(null);
    // Navigate back to Calendar if we came from there
    if (fromCalendar) {
      setFromCalendar(false);
      navigation.navigate('Calendar');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks(true); // Force refresh
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={theme.statusBarStyle} />
      <FlatList
        ref={flatListRef}
        data={activeTasks}
        keyExtractor={(item, idx) => item.TaskRecord_ID?.toString() || idx.toString()}
        renderItem={({ item }) => (
          <TaskListItem
            task={item}
            onPress={() => handleTaskPress(item)}
          />
        )}
        contentContainerStyle={{ padding: 16, backgroundColor: theme.background }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        removeClippedSubviews={Platform.OS === 'android'}
      />

      {/* Full-screen Modal for Task Details */}
      <Modal
        visible={showTaskModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCloseModal}
      >
        <StatusBar barStyle={theme.statusBarStyle} />
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {/* Close Button */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            padding: 16,
            paddingTop: Platform.OS === 'ios' ? 50 : 16,
            backgroundColor: theme.cardBackground,
            borderBottomWidth: 1,
            borderBottomColor: theme.border
          }}>
            <TouchableOpacity onPress={handleCloseModal}>
              <Ionicons name="close" size={28} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {/* Task Details with flex: 1 to take remaining space */}
          <View style={{ flex: 1 }}>
            {selectedTask && (
              <MoveDetailsCard
                task={selectedTask}
                onTaskUpdate={(updatedTask) => {
                  updateTask(updatedTask);
                  setSelectedTask(updatedTask);
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Floating Refresh Button */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: 70,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.primary,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 5,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
        }}
        onPress={handleRefresh}
        disabled={refreshing}
      >
        <Ionicons
          name="refresh"
          size={28}
          color="#fff"
          style={{
            transform: [{ rotate: refreshing ? '180deg' : '0deg' }]
          }}
        />
      </TouchableOpacity>
    </View>
  );
}