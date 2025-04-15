// app/detail-data.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";

// Import for Excel export
import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

const primaryColor = "#6C63FF";

interface CommonParams {
  transcat: string;
  interstation: string;
  averageResistivity: string;
  intercoil: string;
}

interface StationMeasurement {
  frequency: number;
  latitude: string;               // added latitude (6 decimals)
  longitude: string;              // added longitude (6 decimals)
  distance: number;               // station distance (m)
  txCurrent: string;              // Tx Current (A)
  rxVoltage: string;              // Rx Voltage (mV)
  calculatedDepth: number;        // Depth (m)
  calculatedConductivity: number; // Conductivity (µS/cm)
  calculatedResistivity: number;  // Resistivity (Ω·m)
  date: string;                   // Date of measurement
  time: string;                   // Time of measurement
}

interface ResultData {
  name: string;
  common: CommonParams;
  stations: { [key: string]: StationMeasurement[] };
  gps?: { latitude: number; longitude: number };
}

export default function DetailDataScreen() {
  const { index } = useLocalSearchParams();
  const router = useRouter();
  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);

  // Loads the stored result by index.
  const loadResult = async () => {
    try {
      const storedResults = await AsyncStorage.getItem("results");
      if (storedResults) {
        const resultsArray: ResultData[] = JSON.parse(storedResults);
        const selected = resultsArray[Number(index)];
        setResult(selected);
      }
    } catch (error) {
      console.error("Error loading result details:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadResult();
    }, [index])
  );

  // Function to export the result data to an Excel file.
  const exportToExcel = async () => {
    if (!result) {
      Alert.alert("No data", "There is no result data to export.");
      return;
    }

    try {
      // Flatten the data: create an array of objects (rows)
      const exportData: any[] = [];
      // Header columns: adjust as needed.
      // For each station, include a row per measurement.
      Object.keys(result.stations).forEach((stationKey) => {
        const measurements = result.stations[stationKey];
        measurements.forEach((m) => {
          exportData.push({
            "Result Name": result.name,
            Transcat: result.common.transcat,
            "Interstation (m)": result.common.interstation,
            "Avg Resistivity (Ω·m)": result.common.averageResistivity,
            "Intercoil (m)": result.common.intercoil,
            GPS: result.gps
              ? `${result.gps.latitude.toFixed(6)}, ${result.gps.longitude.toFixed(6)}`
              : "",
            Station: stationKey,
            "Frequency (Hz)": m.frequency,
            Latitude: parseFloat(m.latitude).toFixed(6),
            Longitude: parseFloat(m.longitude).toFixed(6),
            "Distance (m)": m.distance,
            "Depth (m)": m.calculatedDepth.toFixed(3),
            "Tx (A)": m.txCurrent,
            "Rx (mV)": m.rxVoltage,
            "Conductivity (µS/cm)": m.calculatedConductivity.toFixed(3),
            "Resistivity (Ω·m)": m.calculatedResistivity.toFixed(3),
            Date: m.date,
            Time: m.time,
          });
        });
      });

      // Create a worksheet from the JSON data.
      const ws = XLSX.utils.json_to_sheet(exportData);
      // Create a new workbook and append the worksheet.
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ResultData");

      // Write the workbook to a binary string in base64 format.
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "base64" });

      // Define the file path in the app's document directory.
      const uri = FileSystem.documentDirectory + `${result.name.replace(/\s+/g, "_")}_data.xlsx`;

      // Write the file to disk.
      await FileSystem.writeAsStringAsync(uri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Alert.alert("Export Successful", "Excel file has been generated.");

      // Open share dialog to allow user to share the file.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Sharing not available", "Your device does not support file sharing.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Export Failed", "An error occurred while exporting the data.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Result not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnContainer}>
          <Ionicons name="arrow-back" size={24} color={primaryColor} />
          <Text style={styles.backText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render the table header with the new order:
  // Frequency, Latitude, Longitude, Distance, Depth, Tx, Rx, Conductivity, Resistivity, Date, Time.
  const renderMeasurementTableHeader = () => (
    <View style={[styles.tableRow, styles.tableHeader]}>
      <Text style={[styles.tableCell, styles.headerText]}>Freq (Hz)</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Lat</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Long</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Distance (m)</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Depth (m)</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Tx (A)</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Rx (mV)</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Cond (µS/cm)</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Resist (Ω·m)</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Date</Text>
      <Text style={[styles.tableCell, styles.headerText]}>Time</Text>
    </View>
  );

  // Render each measurement row in the order established above.
  const renderMeasurementRow = (m: StationMeasurement, idx: number) => (
    <View key={idx} style={styles.tableRow}>
      <Text style={styles.tableCell}>{m.frequency}</Text>
      <Text style={styles.tableCell}>{parseFloat(m.latitude).toFixed(6)}</Text>
      <Text style={styles.tableCell}>{parseFloat(m.longitude).toFixed(6)}</Text>
      <Text style={styles.tableCell}>{m.distance}</Text>
      <Text style={styles.tableCell}>{m.calculatedDepth.toFixed(3)}</Text>
      <Text style={styles.tableCell}>{m.txCurrent}</Text>
      <Text style={styles.tableCell}>{m.rxVoltage}</Text>
      <Text style={styles.tableCell}>{m.calculatedConductivity.toFixed(3)}</Text>
      <Text style={styles.tableCell}>{m.calculatedResistivity.toFixed(3)}</Text>
      <Text style={styles.tableCell}>{m.date}</Text>
      <Text style={styles.tableCell}>{m.time}</Text>
    </View>
  );

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

      <TouchableOpacity style={styles.backBtnContainer} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={primaryColor} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{result.name}</Text>
      
      {/* Export Button */}
      <TouchableOpacity style={styles.exportButton} onPress={exportToExcel}>
        <Text style={styles.exportText}>Export as Excel</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Common Parameters</Text>
        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Transcat:</Text>
          <Text style={styles.paramValue}>{result.common.transcat}</Text>
        </View>
        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Interstation (m):</Text>
          <Text style={styles.paramValue}>{result.common.interstation}</Text>
        </View>
        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Avg Resistivity (Ω·m):</Text>
          <Text style={styles.paramValue}>{result.common.averageResistivity}</Text>
        </View>
        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Intercoil (m):</Text>
          <Text style={styles.paramValue}>{result.common.intercoil}</Text>
        </View>
        {result.gps && (
          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>GPS:</Text>
            <Text style={styles.paramValue}>
              {result.gps.latitude.toFixed(6)}, {result.gps.longitude.toFixed(6)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stations & Measurements</Text>
        {Object.keys(result.stations).map((stationKey) => (
          <View key={stationKey} style={styles.stationContainer}>
            <Text style={styles.stationTitle}>Station {stationKey}</Text>
            <ScrollView horizontal>
              <View style={styles.table}>
                {renderMeasurementTableHeader()}
                {result.stations[stationKey].map((measurement, idx) =>
                  renderMeasurementRow(measurement, idx)
                )}
              </View>
            </ScrollView>
          </View>
        ))}
      </View>
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
  navTitle: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 20,
    color: primaryColor,
  },
  backBtnContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backText: {
    marginLeft: 5,
    fontSize: 16,
    color: primaryColor,
    fontFamily: "JosefinSans_600SemiBold",
  },
  title: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 26,
    textAlign: "center",
    marginBottom: 20,
    color: "#2d3436",
  },
  exportButton: {
    backgroundColor: primaryColor,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: "center",
  },
  exportText: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  section: { marginBottom: 25 },
  sectionTitle: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 20,
    marginBottom: 10,
    color: "#2d3436",
  },
  paramRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  paramLabel: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 16,
    color: "#444",
    marginRight: 10,
    width: 150,
  },
  paramValue: {
    fontFamily: "JosefinSans_400Regular",
    fontSize: 16,
    color: "#555",
  },
  stationContainer: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  stationTitle: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 18,
    marginBottom: 10,
    color: primaryColor,
  },
  table: {
    minWidth: 800,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#eee",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  tableHeader: {
    backgroundColor: "#f2f2f2",
  },
  tableCell: {
    flex: 1,
    fontFamily: "JosefinSans_400Regular",
    fontSize: 10,
    color: "#333",
    paddingHorizontal: 5,
    textAlign: "center",
  },
  headerText: {
    fontFamily: "JosefinSans_600SemiBold",
    fontSize: 10,
    color: primaryColor,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 18,
    color: "#cc0000",
    marginBottom: 20,
  },
});

export { DetailDataScreen };
