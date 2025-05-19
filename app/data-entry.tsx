// app/data-entry.jsx
import React, { useState, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Animatable from "react-native-animatable";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { Audio } from "expo-av";

const beepSound = require("../assets/beep.mp3");
const primaryColor = "#6C63FF";
const frequencyList = [813, 559, 407, 254, 203, 153, 102];

interface StationMeasurement {
  frequency: number;
  txCurrent: string;
  rxVoltage: string;
  latitude: string;
  longitude: string;
  distance: number;
  calculatedDepth: number;
  calculatedConductivity: number;
  calculatedResistivity: number;
  date: string;
  time: string;
}

interface ResultData {
  name: string;
  common: {
    transcat: string;
    interstation: string;
    averageResistivity: string;
    intercoil: string;
  };
  stations: { [key: number]: StationMeasurement[] };
  gps?: { latitude: number; longitude: number };
}

export default function DataEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isEditing = params.isEditing === "true";
  const projectIndex = params.projectIndex ? parseInt(params.projectIndex as string, 10) : null;

  // State management
  const [step, setStep] = useState(0);
  const [resultName, setResultName] = useState("");
  const [commonParams, setCommonParams] = useState({
    transcat: "",
    interstation: "",
    averageResistivity: "",
    intercoil: "",
  });
  const [currentStation, setCurrentStation] = useState(0);
  const [currentFrequencyIndex, setCurrentFrequencyIndex] = useState(0);
  const [stationMeasurements, setStationMeasurements] = useState<{
    [freq: number]: StationMeasurement;
  }>({});
  const [resultData, setResultData] = useState<ResultData>({
    name: "",
    common: { transcat: "", interstation: "", averageResistivity: "", intercoil: "" },
    stations: {},
  });
  const [sensorStatus, setSensorStatus] = useState<"idle" | "loading" | "error">("idle");
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);

  // Load existing data for editing
  useEffect(() => {
    const loadExistingData = async () => {
      if (isEditing && params.existingData) {
        const existingData: ResultData = JSON.parse(params.existingData as string);
        setResultName(existingData.name);
        setCommonParams(existingData.common);
        setResultData(existingData);
        setCurrentStation(parseInt(params.currentStation as string, 10));
        setStep(1);
      }
    };
    loadExistingData();
  }, [isEditing, params.existingData, params.currentStation]);

  // Initialize GPS
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        setGps(location.coords);
      }
    })();
  }, []);

  const calculateMeasurements = (freq: number, txCurrent: string, rxVoltage: string) => {
    const intercoilValue = parseFloat(commonParams.intercoil);
    const avgRes = parseFloat(commonParams.averageResistivity);
    const rxVoltage_mV = parseFloat(rxVoltage);
    const txCurrent_A = parseFloat(txCurrent);

    const rxVoltage_V = rxVoltage_mV / 1000;
    const ht = (100 * rxVoltage_V) / (4 * intercoilValue);
    const term1 = 2 * ht;
    const term2 = (0.00000232 * intercoilValue) / Math.pow(intercoilValue, 3);
    const numerator = term1 - term2;
    const conductivity = ((numerator / 0.0000039478) * freq * Math.pow(intercoilValue, 2)) / 100000000;
    const resistivity = (1 / conductivity) * 10000;
    const depth = -(503 / 5) * Math.sqrt(avgRes / freq);

    return {
      conductivity,
      resistivity,
      depth,
      txCurrent: txCurrent_A.toFixed(2),
      rxVoltage: rxVoltage_mV.toFixed(2),
    };
  };

  const handleFetchData = async () => {
    setSensorStatus("loading");
    try {
      const response = await fetch("http://192.168.4.1/start");
      const data = await response.json();
      
      const calculations = calculateMeasurements(
        frequencyList[currentFrequencyIndex],
        data.current.toFixed(2),
        (data.voltage * 1000).toFixed(2)
      );

      setStationMeasurements(prev => ({
              ...prev,
              [frequencyList[currentFrequencyIndex]]: {
                frequency: frequencyList[currentFrequencyIndex],
                txCurrent: calculations.txCurrent,
                rxVoltage: calculations.rxVoltage,
                latitude: gps?.latitude?.toFixed(6) || "0.000000",
                longitude: gps?.longitude?.toFixed(6) || "0.000000",
                distance: (currentStation - (parseInt(commonParams.transcat, 10) * 100 + 1)) *
                  parseFloat(commonParams.interstation),
                calculatedDepth: calculations.depth,
                calculatedConductivity: calculations.conductivity,
                calculatedResistivity: calculations.resistivity,
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
              },
            }));

      await (await Audio.Sound.createAsync(beepSound)).sound.playAsync();
      setSensorStatus("idle");
    } catch (error) {
      setSensorStatus("error");
      Alert.alert("Sensor Error", "Failed to fetch sensor data");
    }
  };

  const handleSaveStation = async () => {
    const stationData = Object.values(stationMeasurements);
    if (stationData.length !== frequencyList.length) {
      Alert.alert("Incomplete Data", "Complete all frequencies before saving");
      return;
    }

    const updatedData = {
      ...resultData,
      stations: { ...resultData.stations, [currentStation]: stationData },
    };

    try {
      const storedResults = await AsyncStorage.getItem("results");
      const results = storedResults ? JSON.parse(storedResults) : [];
      
      if (isEditing && typeof projectIndex === "number") {
        results[projectIndex] = updatedData;
      } else {
        results.push(updatedData);
      }

      await AsyncStorage.setItem("results", JSON.stringify(results));
      setCurrentStation(prev => prev + 1);
      setCurrentFrequencyIndex(0);
      setStationMeasurements({});
      Alert.alert("Success", `Station ${currentStation} saved successfully`);
    } catch (error) {
      Alert.alert("Error", "Failed to save station data");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={primaryColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 0 ? "Project Setup" : `Station ${currentStation}`}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {step === 0 ? (
        <Animatable.View animation="fadeIn" style={styles.card}>
          <Text style={styles.cardTitle}>Configure Project</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Project Name</Text>
            <TextInput
              style={styles.input}
              value={resultName}
              onChangeText={setResultName}
              placeholder="Enter project name"
            />
          </View>

          <View style={styles.paramGrid}>
            <View style={styles.paramItem}>
              <Text style={styles.label}>Transect Number</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={commonParams.transcat}
                onChangeText={t => setCommonParams(p => ({ ...p, transcat: t }))}
              />
            </View>

            <View style={styles.paramItem}>
              <Text style={styles.label}>Interstation (m)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={commonParams.interstation}
                onChangeText={t => setCommonParams(p => ({ ...p, interstation: t }))}
              />
            </View>

            <View style={styles.paramItem}>
              <Text style={styles.label}>Resistivity (Ω·m)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={commonParams.averageResistivity}
                onChangeText={t => setCommonParams(p => ({ ...p, averageResistivity: t }))}
              />
            </View>

            <View style={styles.paramItem}>
              <Text style={styles.label}>Intercoil (m)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={commonParams.intercoil}
                onChangeText={t => setCommonParams(p => ({ ...p, intercoil: t }))}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              const isValid = Object.values(commonParams).every(v => !!v) && !!resultName;
              if (isValid) {
                const startStation = parseInt(commonParams.transcat, 10) * 100 + 1;
                setCurrentStation(startStation);
                setStep(1);
              } else {
                Alert.alert("Missing Fields", "Fill all required parameters");
              }
            }}
          >
            <Text style={styles.buttonText}>Initialize Project</Text>
          </TouchableOpacity>
        </Animatable.View>
      ) : (
        <Animatable.View animation="fadeIn" style={styles.card}>
          <View style={styles.progressHeader}>
            <Text style={styles.frequencyLabel}>
              {frequencyList[currentFrequencyIndex]} Hz
            </Text>
            <Text style={styles.progressText}>
              {currentFrequencyIndex + 1}/{frequencyList.length}
            </Text>
          </View>

          <View style={styles.sensorContainer}>
            <TouchableOpacity
              style={[
                styles.sensorButton,
                sensorStatus === "loading" && styles.sensorLoading,
                sensorStatus === "error" && styles.sensorError
              ]}
              onPress={handleFetchData}
              disabled={sensorStatus === "loading"}
            >
              {sensorStatus === "loading" ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons
                    name={sensorStatus === "error" ? "alert-circle" : "radio"}
                    size={32}
                    color="#FFF"
                  />
                  <Text style={styles.sensorButtonText}>
                    {sensorStatus === "error" ? "Retry Connection" : "Acquire Data"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.dataDisplay}>
              <View style={styles.dataItem}>
                <Text style={styles.dataLabel}>Tx Current (A)</Text>
                <Text style={styles.dataValue}>
                  {stationMeasurements[frequencyList[currentFrequencyIndex]]?.txCurrent || "--"}
                </Text>
              </View>
              <View style={styles.dataItem}>
                <Text style={styles.dataLabel}>Rx Voltage (mV)</Text>
                <Text style={styles.dataValue}>
                  {stationMeasurements[frequencyList[currentFrequencyIndex]]?.rxVoltage || "--"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.navigationControls}>
            <TouchableOpacity
              style={[styles.navButton, currentFrequencyIndex === 0 && styles.disabledButton]}
              onPress={() => setCurrentFrequencyIndex(prev => prev - 1)}
              disabled={currentFrequencyIndex === 0}
            >
              <Text style={styles.navButtonText}>Previous</Text>
            </TouchableOpacity>

            {currentFrequencyIndex === frequencyList.length - 1 ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSaveStation}
                disabled={!stationMeasurements[frequencyList[currentFrequencyIndex]]}
              >
                <Text style={styles.buttonText}>Complete Station</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navButton, !stationMeasurements[frequencyList[currentFrequencyIndex]] && styles.disabledButton]}
                onPress={() => setCurrentFrequencyIndex(prev => prev + 1)}
                disabled={!stationMeasurements[frequencyList[currentFrequencyIndex]]}
              >
                <Text style={styles.navButtonText}>Next</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animatable.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F9F9FB",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "JosefinSans_600SemiBold",
    color: primaryColor,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: "JosefinSans_600SemiBold",
    color: "#2D3436",
    textAlign: "center",
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontFamily: "JosefinSans_500Medium",
    fontSize: 14,
    color: "#6C63FF",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: "JosefinSans_400Regular",
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  paramGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  paramItem: {
    width: "48%",
  },
  primaryButton: {
    backgroundColor: primaryColor,
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  frequencyLabel: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 24,
    color: "#2D3436",
  },
  progressText: {
    fontFamily: "JosefinSans_500Medium",
    fontSize: 16,
    color: primaryColor,
  },
  sensorContainer: {
    marginBottom: 32,
    alignItems: "center",
  },
  sensorButton: {
    backgroundColor: primaryColor,
    borderRadius: 100,
    padding: 24,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  sensorLoading: {
    backgroundColor: "#4A90E2",
  },
  sensorError: {
    backgroundColor: "#FF6B6B",
  },
  sensorButtonText: {
    color: "#FFF",
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
  },
  dataDisplay: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
  },
  dataItem: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  dataLabel: {
    fontFamily: "JosefinSans_500Medium",
    fontSize: 14,
    color: "#6C63FF",
    marginBottom: 8,
  },
  dataValue: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 18,
    color: "#2D3436",
  },
  navigationControls: {
    flexDirection: "row",
    gap: 12,
  },
  navButton: {
    flex: 1,
    backgroundColor: "#E9ECEF",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
  },
  navButtonText: {
    color: primaryColor,
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
}); 