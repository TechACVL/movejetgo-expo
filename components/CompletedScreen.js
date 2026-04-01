import React, { useState, useEffect, useRef } from "react";
import {
  Text,
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

export default function CompletedScreen({ route, navigation }) {
  const { completedTasks, loading, fetchTasks } = useTasks();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [fromCalendar, setFromCalendar] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (route?.params?.highlightTask && completedTasks.length > 0) {
      const taskId = route.params.highlightTask;
      const task = completedTasks.find(t => t.TaskRecord_ID === taskId);
      if (task) {
        setSelectedTask(task);
        setShowTaskModal(true);
        setFromCalendar(route.params.fromCalendar || false);
        // Clear the params to prevent reopening on return
        navigation.setParams({ highlightTask: undefined, fromCalendar: undefined });
      }
    }
  }, [route?.params?.highlightTask, completedTasks, navigation]);

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
        data={completedTasks}
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
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 20, fontSize: 16, color: theme.textSecondary }}>
            No completed or declined tasks
          </Text>
        }
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
          <View style={{ flex: 1, marginTop: 16 }}>
            {selectedTask && (
              <MoveDetailsCard
                task={selectedTask}
                readOnly={true}
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