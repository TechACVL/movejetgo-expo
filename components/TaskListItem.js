import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { formatDate, statusColors } from '../utils';
import { useTheme } from '../contexts/ThemeContext';
import { createThemedStyles } from '../themedStyles';

export default function TaskListItem({ task, onPress }) {
  const { theme } = useTheme();
  const styles = createThemedStyles(theme);

  return (

    <TouchableOpacity
      //style={[styles.moveCard, { borderLeftWidth: 4, borderLeftColor: statusColor }]}
      style={[styles.moveCard, ]}
      onPress={onPress}
      activeOpacity={0.7}
    >

      <View style={styles.moveHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>


                {/* Status Indicator Dot */}
                {/*
                <View style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: statusColor,
                  marginRight: 8,
                }} />
                */}

                <Text style={[styles.moveHeaderText, { flex: 1 }]}>{task.Invoice_Number || task.TaskRecord_ID || 'N/A'}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                <Text style={styles.statusBadgeText}>{task.Task_Status || 'N/A'}</Text>
              </View>
            </View>
            <Text style={styles.moveHeaderSubtext}>
              {formatDate(task.Task_Date) || 'N/A'} • {task.Move_From || 'N/A'} → {task.Move_To || 'N/A'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
