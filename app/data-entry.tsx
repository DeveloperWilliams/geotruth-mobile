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
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Animatable from "react-native-animatable";
import { useRouter } from "expo-router";
import * as Location from "expo-location";

const primaryColor = "#6C63FF";
// Frequencies arranged in descending order
const frequencyList = [813, 559, 407, 254, 203, 153, 102];

interface CommonParams {
  transcat: string;
  interstation: string;
  averageResistivity: string;
  intercoil: string;
}

interface StationMeasurement {
  frequency: number;
  latitude: string;               // formatted to 6 decimals
  longitude: string;              // formatted to 6 decimals
  distance: number;               // calculated based on station and interstation value
  txCurrent: string;              // entered value (A)
  rxVoltage: string;              // entered value (mV)
  calculatedResistivity: number;  // in Ω·m
  calculatedConductivity: number; // in µS/cm
  calculatedDepth: number;        // in m (negative indicates below ground)
  date: string;                   // current date at time of saving
  time: string;                   // current time at time of saving
}

interface ResultData {
  name: string;
  common: CommonParams;
  stations: { [key: number]: StationMeasurement[] };
  gps?: { latitude: number; longitude: number };
}

export default function DataEntryScreen() {
  const router = useRouter();

  // step 0 = project setup, 1 = measurement entry.
  const [step, setStep] = useState(0);
  const [resultName, setResultName] = useState("");
  const [commonParams, setCommonParams] = useState<CommonParams>({
    transcat: "",
    interstation: "",
    averageResistivity: "",
    intercoil: "",
  });
  // Current station number will be set based on transcat (e.g. transcat 1 → 101).
  const [currentStation, setCurrentStation] = useState<number>(0);

  // Store measurement inputs per frequency for the current station.
  // The keys are frequencies.
  const [stationMeasurements, setStationMeasurements] = useState<{
    [freq: number]: { txCurrent: string; rxVoltage: string };
  }>({});

  const [resultData, setResultData] = useState<ResultData>({
    name: "",
    common: {
      transcat: "",
      interstation: "",
      averageResistivity: "",
      intercoil: "",
    },
    stations: {},
  });
  
  // GPS coordinates state.
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);

  // Request GPS location on mount.
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to capture GPS coordinates."
        );
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      setGps({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    })();
  }, []);

  // Helper function to navigate back.
  const handleGoBack = () => {
    router.back();
  };

  // Handler for updating a measurement for a given frequency.
  const updateMeasurement = (
    frequency: number,
    field: "txCurrent" | "rxVoltage",
    value: string
  ) => {
    setStationMeasurements((prev) => ({
      ...prev,
      [frequency]: {
        ...prev[frequency],
        [field]: value,
      },
    }));
  };

  // When the user saves a station’s data, calculate parameters and attach extra fields.
  const saveStationMeasurements = () => {
    if (!commonParams.intercoil) {
      Alert.alert(
        "Missing Data",
        "Intercoil spacing is required (set in project setup)."
      );
      return;
    }
    const intercoilValue = parseFloat(commonParams.intercoil);
    if (isNaN(intercoilValue) || intercoilValue <= 0) {
      Alert.alert("Invalid Data", "Please enter a valid intercoil spacing value.");
      return;
    }
    const avgRes = parseFloat(commonParams.averageResistivity);
    if (isNaN(avgRes) || avgRes <= 0) {
      Alert.alert("Invalid Data", "Please enter a valid average resistivity value.");
      return;
    }
    
    // Get current date and time
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    // Calculate starting station based on transcat.
    const transcatNumber = parseInt(commonParams.transcat, 10);
    if (isNaN(transcatNumber)) {
      Alert.alert("Invalid Transcat", "Transcat must be a numeric value.");
      return;
    }
    const startingStation = transcatNumber * 100 + 1;
    const distanceInterval = parseFloat(commonParams.interstation);
    if (isNaN(distanceInterval) || distanceInterval < 0) {
      Alert.alert("Invalid Interstation", "Please enter a valid interstation value.");
      return;
    }
    // Compute distance: (currentStation - startingStation) * interstation
    const stationDistance = (currentStation - startingStation) * distanceInterval;

    let stationData: StationMeasurement[] = [];
    
    for (let freq of frequencyList) {
      const measurement = stationMeasurements[freq];
      if (!measurement || !measurement.txCurrent || !measurement.rxVoltage) {
        Alert.alert(
          "Missing Data",
          `Please fill Tx Current and Rx Voltage for ${freq} Hz`
        );
        return;
      }

      const txCurrent = parseFloat(measurement.txCurrent);
      const rxVoltage_mV = parseFloat(measurement.rxVoltage);
      
      if (txCurrent === 0) {
        Alert.alert("Invalid Input", `Tx Current cannot be zero at ${freq} Hz`);
        return;
      }

      // Convert Rx Voltage from mV to Volts
      const rxVoltage_V = rxVoltage_mV / 1000;

      // 1. Calculate Total Field (Ht) - Excel column J
      const ht = (100 * rxVoltage_V) / (4 * intercoilValue);

      // 2. Calculate Conductivity - Excel column K
      const term1 = 2 * ht;
      const term2 = (0.00000232 * intercoilValue) / Math.pow(intercoilValue, 3);
      const numerator = term1 - term2;
      const conductivity =
        (numerator / 0.0000039478 * freq * Math.pow(intercoilValue, 2)) / 100000000;

      // 3. Calculate Resistivity - Excel column L
      const resistivity = (1 / conductivity) * 10000;

      // 4. Calculate Depth - Excel column G
      const depth = -(503 / 5) * Math.sqrt(avgRes / freq);

      // Include new parameters in the measurement record.
      stationData.push({
        frequency: freq,
        latitude: gps ? gps.latitude.toFixed(6) : "0.000000",
        longitude: gps ? gps.longitude.toFixed(6) : "0.000000",
        distance: stationDistance,
        calculatedDepth: depth,
        txCurrent: measurement.txCurrent,
        rxVoltage: measurement.rxVoltage,
        calculatedConductivity: conductivity,
        calculatedResistivity: resistivity,
        date: dateStr,
        time: timeStr,
      });
    }

    const updatedStations = { ...resultData.stations };
    updatedStations[currentStation] = stationData;
    setResultData({ ...resultData, stations: updatedStations });
    setStationMeasurements({});
    setCurrentStation(currentStation + 1);
    Alert.alert("Station Saved", `Station ${currentStation} data saved.`);
  };

  // Save the complete project.
  const saveResult = async () => {
    if (
      !resultName ||
      !commonParams.transcat ||
      !commonParams.interstation ||
      !commonParams.averageResistivity ||
      !commonParams.intercoil
    ) {
      Alert.alert("Incomplete Data", "Please complete all setup fields");
      return;
    }
    // Determine starting station number based on transcat (e.g., transcat 1 becomes 101).
    const transcatNumber = parseInt(commonParams.transcat, 10);
    if (isNaN(transcatNumber)) {
      Alert.alert("Invalid Transcat", "Transcat must be a numeric value.");
      return;
    }
    const startingStation = transcatNumber * 100 + 1;
    // If no station has been added, assign the starting station.
    let finalData = {
      ...resultData,
      name: resultName,
      common: commonParams,
      gps: gps || { latitude: 0, longitude: 0 },
    };
    if (Object.keys(finalData.stations).length === 0) {
      finalData.stations[startingStation] = [];
    }
    const storedResults = await AsyncStorage.getItem("results");
    let resultsArray = storedResults ? JSON.parse(storedResults) : [];
    resultsArray.push(finalData);
    await AsyncStorage.setItem("results", JSON.stringify(resultsArray));
    Alert.alert("Success", "Result saved successfully");
    handleGoBack();
  };

  return (
    <ScrollView style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.navbar}>
        <Image 
          source={require("../assets/images/icon.png")} 
          style={styles.logo} 
        />
        <Text style={styles.navTitle}>Lambda EM</Text>
      </View>

      <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={24} color={primaryColor} />
      </TouchableOpacity>
      
      {step === 0 && (
        <Animatable.View animation="fadeInLeft" duration={600}>
          <Text style={styles.sectionTitle}>Project Setup</Text>
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Project Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter project name"
              value={resultName}
              onChangeText={setResultName}
            />
            {/* Transcat input */}
            <Text style={styles.inputLabel}>Transect (numeric)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter transcat value"
              value={commonParams.transcat}
              keyboardType="numeric"
              onChangeText={(text) =>
                setCommonParams({ ...commonParams, transcat: text })
              }
            />
            {/* Interstation input */}
            <Text style={styles.inputLabel}>Interstation Spacing (m)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter interstation value"
              value={commonParams.interstation}
              keyboardType="numeric"
              onChangeText={(text) =>
                setCommonParams({ ...commonParams, interstation: text })
              }
            />
            <Text style={styles.inputLabel}>Average Resistivity (Ω·m)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter average resistivity"
              value={commonParams.averageResistivity}
              keyboardType="numeric"
              onChangeText={(text) =>
                setCommonParams({ ...commonParams, averageResistivity: text })
              }
            />
            <Text style={styles.inputLabel}>Intercoil Spacing (m)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter intercoil spacing"
              value={commonParams.intercoil}
              keyboardType="numeric"
              onChangeText={(text) =>
                setCommonParams({ ...commonParams, intercoil: text })
              }
            />
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                if (
                  !resultName ||
                  !commonParams.transcat ||
                  !commonParams.interstation ||
                  !commonParams.averageResistivity ||
                  !commonParams.intercoil
                ) {
                  Alert.alert("Validation Error", "All fields are required");
                  return;
                }
                // Set starting station number based on transcat (e.g. 1 becomes 101)
                const transcatNumber = parseInt(commonParams.transcat, 10);
                const startingStation = transcatNumber * 100 + 1;
                setCurrentStation(startingStation);
                setResultData({
                  ...resultData,
                  name: resultName,
                  common: commonParams,
                });
                setStep(1);
              }}
            >
              <Text style={styles.buttonText}>Proceed to Measurements</Text>
            </TouchableOpacity>
          </View>
        </Animatable.View>
      )}
      
      {step === 1 && (
        <Animatable.View animation="fadeInRight" duration={600}>
          <Text style={styles.sectionTitle}>
            Station {currentStation} Measurements
          </Text>
          <View style={styles.formCard}>
            {frequencyList.map((freq) => (
              <View key={freq} style={styles.measurementRow}>
                {/* The order of displayed fields: frequency, tx and rx inputs.
                    The new fields (latitude, longitude, distance, date, time, depth,
                    conductivity and resistivity) will be computed and stored – you may choose to display them elsewhere if needed. */}
                <Text style={styles.frequencyLabel}>{freq} Hz</Text>
                <TextInput
                  style={styles.measurementInput}
                  placeholder="Tx Current (A)"
                  keyboardType="numeric"
                  value={stationMeasurements[freq]?.txCurrent || ""}
                  onChangeText={(text) => updateMeasurement(freq, "txCurrent", text)}
                />
                <TextInput
                  style={styles.measurementInput}
                  placeholder="Rx Voltage (mV)"
                  keyboardType="numeric"
                  value={stationMeasurements[freq]?.rxVoltage || ""}
                  onChangeText={(text) => updateMeasurement(freq, "rxVoltage", text)}
                />
              </View>
            ))}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={saveStationMeasurements}
            >
              <Text style={styles.buttonText}>Save Station Measurements</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={saveResult}
            >
              <Text style={[styles.buttonText, { color: primaryColor }]}>
                Save Project
              </Text>
            </TouchableOpacity>
          </View>
        </Animatable.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  logo: { width: 40, height: 40, resizeMode: "contain" },
  navTitle: { fontFamily: "JosefinSans_600SemiBold", fontSize: 20, color: primaryColor },
  backButton: { padding: 10, alignSelf: "flex-start" },
  sectionTitle: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 26,
    color: "#2d3436",
    marginVertical: 20,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inputLabel: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
    color: "#2d3436",
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#f8f9fa",
    fontFamily: "JosefinSans_400Regular",
  },
  primaryButton: {
    backgroundColor: primaryColor,
    borderRadius: 8,
    padding: 16,
    marginTop: 25,
    alignItems: "center",
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: primaryColor,
    borderRadius: 8,
    padding: 16,
    marginTop: 15,
    alignItems: "center",
  },
  buttonText: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
    color: "white",
  },
  measurementRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
  },
  frequencyLabel: {
    flex: 0.3,
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
    color: "#2d3436",
  },
  measurementInput: {
    flex: 0.35,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#f8f9fa",
    marginHorizontal: 5,
    fontFamily: "JosefinSans_400Regular",
  },
});

export { DataEntryScreen };
