import React, { useState, useEffect, useRef } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  PanResponder,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { statusColors } from '../utils';
import { useTasks } from '../contexts/TasksContext';
import { useTheme } from '../contexts/ThemeContext';
import { createThemedStyles } from '../themedStyles';

export default function CalendarScreen({ navigation }) {
  const { allTasks, fetchTasks } = useTasks();
  const { theme } = useTheme();
  const styles = createThemedStyles(theme);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDayTasks, setSelectedDayTasks] = useState([]);
  const [markedDates, setMarkedDates] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().split('T')[0]);
  const [refreshing, setRefreshing] = useState(false);
  const calendarRef = useRef(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks(true); // Force refresh
    setRefreshing(false);
  };

  // Build marked dates when allTasks changes
  useEffect(() => {
    const marked = {};
    allTasks.forEach(task => {
      if (task.Task_Date) {
        const dateKey = task.Task_Date.split('T')[0]; // Extract YYYY-MM-DD
        const color = statusColors[task.Task_Status] || '#e63946';
        marked[dateKey] = {
          marked: true,
          dotColor: color,
          selected: false,
        };
      }
    });
    setMarkedDates(marked);
  }, [allTasks]);

  const handleDayPress = (day) => {
    setSelectedDate(day.dateString);
    // Filter tasks for the selected date
    const tasksForDay = allTasks.filter(task => {
      if (task.Task_Date) {
        const taskDate = task.Task_Date.split('T')[0];
        return taskDate === day.dateString;
      }
      return false;
    });
    setSelectedDayTasks(tasksForDay);
  };

  // Navigate to previous month
  const goToPreviousMonth = () => {
    const date = new Date(currentMonth);
    date.setMonth(date.getMonth() - 1);
    const newMonth = date.toISOString().split('T')[0];
    setCurrentMonth(newMonth);
  };

  // Navigate to next month
  const goToNextMonth = () => {
    const date = new Date(currentMonth);
    date.setMonth(date.getMonth() + 1);
    const newMonth = date.toISOString().split('T')[0];
    setCurrentMonth(newMonth);
  };

  // Create pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Swipe left (next month)
        if (gestureState.dx < -50) {
          goToNextMonth();
        }
        // Swipe right (previous month)
        else if (gestureState.dx > 50) {
          goToPreviousMonth();
        }
      },
    })
  ).current;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View {...panResponder.panHandlers}>
          <Calendar
            key={theme.mode}
            ref={calendarRef}
            current={currentMonth}
            onDayPress={handleDayPress}
            onMonthChange={(month) => {
              setCurrentMonth(month.dateString);
            }}
            markedDates={{
              ...markedDates,
              ...(selectedDate && {
                [selectedDate]: {
                  ...markedDates[selectedDate],
                  selected: true,
                  selectedColor: theme.mode === 'dark' ? '#4a9eff' : '#e63946',
                  selectedTextColor: '#ffffff'
                }
              }),
            }}
            markingType={'dot'}
            enableSwipeMonths={true}
            theme={{
              calendarBackground: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff',
              backgroundColor: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff',
              dayTextColor: theme.mode === 'dark' ? '#e0e0e0' : '#2d4150',
              textDisabledColor: theme.mode === 'dark' ? '#4a4a4a' : '#d9e1e8',
              monthTextColor: theme.mode === 'dark' ? '#ffffff' : '#2d4150',
              textSectionTitleColor: theme.mode === 'dark' ? '#a0a0a0' : '#b6c1cd',
              todayTextColor: theme.mode === 'dark' ? '#4a9eff' : '#e63946',
              selectedDayBackgroundColor: theme.mode === 'dark' ? '#4a9eff' : '#e63946',
              selectedDayTextColor: '#ffffff',
              arrowColor: theme.mode === 'dark' ? '#ffffff' : '#2d4150',
              textDayFontWeight: '400',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: '600',
              'stylesheet.calendar.header': {
                week: {
                  marginTop: 5,
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  backgroundColor: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff',
                }
              },
              'stylesheet.day.basic': {
                base: {
                  width: 32,
                  height: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                text: {
                  marginTop: 4,
                  fontSize: 16,
                  fontFamily: 'System',
                  fontWeight: '300',
                  color: theme.mode === 'dark' ? '#e0e0e0' : '#2d4150',
                },
                today: {
                  backgroundColor: 'transparent',
                  borderColor: theme.mode === 'dark' ? '#4a9eff' : '#e63946',
                  borderWidth: 2,
                  borderRadius: 16,
                },
                selected: {
                  backgroundColor: theme.mode === 'dark' ? '#4a9eff' : '#e63946',
                  borderRadius: 16,
                },
              },
              'stylesheet.dot': {
                dot: {
                  width: 8,
                  height: 8,
                  marginTop: 1,
                  borderRadius: 4,
                  opacity: 1,
                }
              }
            }}
          />
        </View>
        {selectedDate && selectedDayTasks.length > 0 ? (
          <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16 }}
          >
            {selectedDayTasks.map((task, idx) => (
              <TouchableOpacity
                key={task.TaskRecord_ID || idx}
                style={[styles.calendarTaskCard, { borderLeftColor: statusColors[task.Task_Status] || theme.primary }]}
                onPress={() => {
                  // Navigate to Tasks or Completed tab based on status
                  const isCompleted = task.Task_Status === 'Completed' || task.Task_Status === 'Declined';
                  navigation.navigate(isCompleted ? 'Completed' : 'Tasks', {
                    highlightTask: task.TaskRecord_ID,
                    fromCalendar: true
                  });
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.calendarTaskId}>{task.Invoice_Number || 'N/A'}</Text>
                  <View style={{
                    backgroundColor: statusColors[task.Task_Status] || '#888',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12
                  }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{task.Task_Status}</Text>
                  </View>
                </View>
                <Text style={styles.calendarTaskDetails}>
                  <Text style={{ fontWeight: '600' }}>Origin: </Text>
                  {task.Move_From || 'N/A'}
                </Text>
                <Text style={styles.calendarTaskDetails}>
                  <Text style={{ fontWeight: '600' }}>Destination: </Text>
                  {task.Move_To || 'N/A'}
                </Text>
                <Text style={styles.calendarTaskDetails}>
                  <Text style={{ fontWeight: '600' }}>Move Size: </Text>
                  {task.Move_Size || 'N/A'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.background }} />
        )}

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
    </SafeAreaProvider>
  );
}
