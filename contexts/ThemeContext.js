import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

// Light Theme
export const lightTheme = {
  mode: 'light',
  // Primary colors
  primary: '#e63946',
  accent: '#457b9d',
  success: '#10b981',
  warning: '#fbbf24',
  error: '#ef4444',

  // Backgrounds
  background: '#f5f5f5',
  cardBackground: '#ffffff',
  modalBackground: 'rgba(0,0,0,0.3)',

  // Text colors
  text: '#22223b',
  textSecondary: '#666',
  textLight: '#888',
  textInverse: '#ffffff',

  // Borders & dividers
  border: '#ddd',
  borderLight: '#eee',
  divider: '#f1f1f1',

  // Status bar
  statusBarStyle: 'dark-content',

  // Shadows
  shadowColor: '#000',
  shadowOpacity: 0.1,
};

// Dark Theme
export const darkTheme = {
  mode: 'dark',
  // Primary colors
  primary: '#ff5a65',
  accent: '#6ba3ca',
  success: '#34d399',
  warning: '#fcd34d',
  error: '#f87171',

  // Backgrounds
  background: '#0f0f0f',
  cardBackground: '#1a1a1a',
  modalBackground: 'rgba(0,0,0,0.7)',

  // Text colors
  text: '#e5e5e5',
  textSecondary: '#a0a0a0',
  textLight: '#707070',
  textInverse: '#0f0f0f',

  // Borders & dividers
  border: '#333',
  borderLight: '#2a2a2a',
  divider: '#252525',

  // Status bar
  statusBarStyle: 'light-content',

  // Shadows
  shadowColor: '#000',
  shadowOpacity: 0.5,
};

const THEME_STORAGE_KEY = 'appThemeMode';

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [theme, setTheme] = useState(lightTheme);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'dark') {
          setIsDarkMode(true);
          setTheme(darkTheme);
        }
      } catch (error) {
        console.log('Error loading theme:', error);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    try {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      setTheme(newMode ? darkTheme : lightTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode ? 'dark' : 'light');
    } catch (error) {
      console.log('Error saving theme:', error);
    }
  };

  const value = {
    theme,
    isDarkMode,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
