import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { initDB, saveTasks, getTasks } from '../lib/sqlite';
import { getValidAccessToken, getApiUrl, getAppConfig } from '../utils';
import { performLogout } from '../utils/auth';

const TasksContext = createContext();

export const TasksProvider = ({ children, loggedIn }) => {
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [rawJson, setRawJson] = useState(null);
  const [appConfig, setAppConfig] = useState(null);

  // Initialize database and load appConfig from cache
  useEffect(() => {
    initDB();
    // Load AppConfig for DisplayTab filtering
    const loadConfig = async () => {
      const config = await getAppConfig();
      setAppConfig(config);
    };
    loadConfig();
  }, []);

  // Fetch tasks from backend
  const fetchTasks = useCallback(async (forceRefresh = false) => {
    // If data is fresh (less than 30 seconds old) and not forcing refresh, skip
    if (!forceRefresh && lastFetchTime && (Date.now() - lastFetchTime < 30000)) {
      console.log('Using cached tasks data');
      return;
    }

    setLoading(true);
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error("No valid token");

      const tasksUrl = `${getApiUrl('GET_TASKS')}/subcont-moves`;
      console.log('Fetching tasks from backend...', tasksUrl);
      const response = await fetch(tasksUrl, {
        method: "GET",
        headers: { "X-Subcont-Token": token },
      });

      // Check for authentication errors
      if (response.status === 401 || response.status === 403) {
        console.log('🔒 Authentication error during task fetch');
        performLogout({
          reason: `Task fetch failed (${response.status})`,
          source: 'api_error',
          notifyBackend: false
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Response received:', { status: data?.status, dataLength: data?.data?.length });
      const fetchedTasks = data?.data || [];

      console.log(`✓ Fetched ${fetchedTasks.length} tasks from backend`);
      setAllTasks(fetchedTasks);
      setRawJson(data);
      setLastFetchTime(Date.now());

      // Save to local storage
      await saveTasks(fetchedTasks);
    } catch (error) {
      console.log("Error fetching tasks:", error);
      setRawJson({ error: error.message });

      // Load from local storage on error
      await getTasks((localTasks) => {
        console.log(`Loaded ${localTasks.length} tasks from local storage`);
        setAllTasks(localTasks);
      });
    } finally {
      setLoading(false);
    }
  }, [lastFetchTime]);

  // Update a single task
  const updateTask = useCallback(async (updatedTask) => {
    const updatedTasks = allTasks.map(t =>
      t.TaskRecord_ID === updatedTask.TaskRecord_ID ? updatedTask : t
    );
    setAllTasks(updatedTasks);
    await saveTasks(updatedTasks);
  }, [allTasks]);

  // Helper function to match rule conditions (same as in MoveDetailsCard)
  const matchesRuleConditions = useCallback((rule, taskStatus, bookingStatus) => {
    // Check Task_Status match - supports string, array, or "Any"
    let taskMatches = false;
    if (rule.Task_Status === 'Any') {
      taskMatches = true;
    } else if (Array.isArray(rule.Task_Status)) {
      taskMatches = rule.Task_Status.includes(taskStatus);
    } else {
      taskMatches = rule.Task_Status === taskStatus;
    }

    if (!taskMatches) return false;

    // Check Booking_Status match - supports string, array, or "Any" (must use AND logic with Task_Status)
    let bookingMatches = false;
    if (rule.Booking_Status === 'Any') {
      // If there's an exception list, check it - if Booking_Status is in the exception list, it doesn't match
      if (rule.Booking_Status_Except && Array.isArray(rule.Booking_Status_Except)) {
        bookingMatches = !rule.Booking_Status_Except.includes(bookingStatus);
      } else {
        bookingMatches = true;
      }
    } else if (Array.isArray(rule.Booking_Status)) {
      bookingMatches = rule.Booking_Status.includes(bookingStatus);
    } else {
      bookingMatches = rule.Booking_Status === bookingStatus;
    }

    // Return true only if BOTH Task_Status AND Booking_Status match (AND logic)
    return taskMatches && bookingMatches;
  }, []);

  // Get DisplayTab for a task based on rules
  const getDisplayTab = useCallback((task) => {
    if (!appConfig?.StatusTransitionRules) {
      // Default behavior if no rules
      if (task.Task_Status === 'Completed' || task.Task_Status === 'Declined') {
        return 'Completed';
      }
      return 'Tasks';
    }

    const rules = appConfig.StatusTransitionRules;
    const matchingRule = rules.find(rule =>
      matchesRuleConditions(rule, task.Task_Status, task.Booking_Status)
    );

    if (matchingRule && matchingRule.DisplayTab) {
      return matchingRule.DisplayTab;
    }

    // Default fallback
    if (task.Task_Status === 'Completed' || task.Task_Status === 'Declined') {
      return 'Completed';
    }
    return 'Tasks';
  }, [appConfig, matchesRuleConditions]);

  // Derived data - active tasks (filtered by DisplayTab)
  const activeTasks = allTasks.filter(task => {
    const displayTab = getDisplayTab(task);
    return displayTab === 'Tasks';
  });

  // Derived data - completed tasks (filtered by DisplayTab)
  const completedTasks = allTasks.filter(task => {
    const displayTab = getDisplayTab(task);
    return displayTab === 'Completed';
  });

  // Fetch tasks when user logs in
  useEffect(() => {
    if (loggedIn) {
      console.log('✅ User logged in, fetching tasks...');
      fetchTasks(true); // Force refresh on login
    } else {
      // When not logged in, load tasks from local DB to show offline data
      setLoading(true);
      getTasks((localTasks) => {
        console.log(`📦 Loaded ${localTasks.length} tasks from local storage (offline mode)`);
        setAllTasks(localTasks);
        setLoading(false);
      });
    }
  }, [loggedIn]); // Only depend on loggedIn to prevent infinite loop

  const value = {
    allTasks,
    activeTasks,
    completedTasks,
    loading,
    rawJson,
    fetchTasks,
    updateTask,
    lastFetchTime,
  };

  return (
    <TasksContext.Provider value={value}>
      {children}
    </TasksContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error('useTasks must be used within a TasksProvider');
  }
  return context;
};
