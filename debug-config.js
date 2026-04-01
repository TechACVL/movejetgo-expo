// Quick debug script to check what's in the appConfig
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

async function checkConfig() {
  try {
    const configStr = await AsyncStorage.getItem('appConfigJson');
    if (!configStr) {
      console.log('❌ NO CACHED CONFIG FOUND');
      return;
    }
    
    const config = JSON.parse(configStr);
    console.log('✅ Config found. Keys:', Object.keys(config));
    
    if (config.APIConfig) {
      console.log('✅ APIConfig exists');
      console.log('QB_BASE_URL:', config.APIConfig.QB_BASE_URL);
      console.log('HANDLE_EDIT_INVOICE endpoint:', config.APIConfig.ENDPOINTS?.HANDLE_EDIT_INVOICE);
    } else {
      console.log('❌ NO APIConfig in cached data');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkConfig();
