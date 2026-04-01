import AsyncStorage from '@react-native-async-storage/async-storage';

export async function initDB() {
  // No-op for AsyncStorage, but can be used for migration or setup if needed
  return Promise.resolve();
}

export async function saveTasks(tasks) {
  try {
    // Store all tasks as a single array under the key 'tasks'
    await AsyncStorage.setItem('tasks', JSON.stringify(tasks));
  } catch (e) {
    console.error('Error saving tasks to AsyncStorage:', e);
  }
}

export async function getTasks(callback) {
  try {
    const tasksJson = await AsyncStorage.getItem('tasks');
    const tasks = tasksJson ? JSON.parse(tasksJson) : [];
    callback(tasks);
  } catch (e) {
    console.error('Error loading tasks from AsyncStorage:', e);
    callback([]);
  }
}
