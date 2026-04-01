import React, { useState, useEffect } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { getApiUrl, fetchAppConfig } from '../utils';
import { styles } from '../styles';

export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");



  const saveTokens = async (accessToken, refreshToken) => {
    await SecureStore.setItemAsync("accessToken", accessToken);
    await SecureStore.setItemAsync("refreshToken", refreshToken);
  };

  const handleReset = () => {
    setStep(1);
    setEmail("");
    setPassword("");
    setOtp("");
    setMessage("");
  };

  const handleCheckUser = async () => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('CHECK_USER'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (data.exists && data.hasPassword) setStep(2);
      else setMessage("User not found or no password set.");
    } catch (error) {
      setMessage("Error checking user: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('LOGIN'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ipAddress: "127.0.0.1" }),
      });
      const data = await response.json();
      if (data.requiresOTP) {
        setStep(3);
        setMessage(data.message || "OTP required. Please check your email.");
      } else if (data.accessToken && data.refreshToken) {
        await saveTokens(data.accessToken, data.refreshToken);
        onLogin();
      } else {
        setMessage("Invalid credentials.");
      }
    } catch (error) {
      setMessage("Error during authentication: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('VERIFY_OTP_LOGIN'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      if (data?.accessToken && data?.refreshToken) {
        await saveTokens(data.accessToken, data.refreshToken);
        onLogin();
      } else {
        setMessage("OTP verification failed.");
      }
    } catch (error) {
      setMessage("Error verifying OTP: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        enableOnAndroid={true}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image source={require("../assets/move_Jet.png")} style={styles.appLogo} resizeMode="contain" />
        </View>

        {step === 1 && (
          <View style={styles.card}>
            <TextInput
              style={styles.loginInput}
              placeholder="Enter Email"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.button} onPress={handleCheckUser}>
              <Text style={styles.buttonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={styles.card}>
            <TextInput
              style={styles.loginInput}
              placeholder="Enter Password"
              placeholderTextColor="#aaa"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={styles.button} onPress={handleAuth}>
              <Text style={styles.buttonText}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && (
          <View style={styles.card}>
            <TextInput
              style={styles.loginInput}
              placeholder="Enter OTP"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
              value={otp}
              onChangeText={setOtp}
            />
            <TouchableOpacity style={styles.button} onPress={handleVerifyOtp}>
              <Text style={styles.buttonText}>Verify OTP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        )}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.companyLogoBottom}>
          <Image source={require("../assets/ACVLlogo.png")} style={styles.companyLogo} resizeMode="contain" />
        </View>
      </KeyboardAwareScrollView>
      {loading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
          <ActivityIndicator size="large" color="#e63946" />
        </View>
      )}
    </View>
  );
}
