import React, { useState, useEffect } from 'react';
import type { Firestore } from 'firebase/firestore';
import { writeBatch, doc, collection, Timestamp } from 'firebase/firestore';
import Papa from 'papaparse';
import { zaehlerZuordnung } from "./RecordForm"; // Importiere zaehlerZuordnung

interface SheetImporterProps {
    db: Firestore;
    userId: string;
    appId: string;
    onImportComplete: (importedDate: string) => void;
}

const TARGET_FIELDS = [
    { key: "apartmentId", label: "Wohnungs-ID (Pflichtfeld!)" },
    { key: "details.area", label: "Details: Fläche (m²)" },
    { key: "details.location", label: "Details: Lage" },
    { key: "details.persons", label: "Details: Personenanzahl" },
    { key: "details.houseNumber", label: "Details: Hausnummer" },
    { key: "details.stellplatz1", label: "Details: Stellplatz 1" },
    { key: "details.stellplatz2", label: "Details: Stellplatz 2" },
    { key: "details.stellplatz3", label: "Details: Stellplatz 3" },
    { key: "tenants.tenant1.name", label: "Mieter 1: Name" },
    { key: "tenants.tenant1.phone", label: "Mieter 1: Telefon" },
    { key: "tenants.tenant1.email", label: "Mieter 1: E-Mail" },
    { key: "tenants.tenant2.name", label: "Mieter 2: Name" },
    { key: "tenants.tenant2.phone", label: "Mieter 2: Telefon" },
    { key: "tenants.tenant2.email", label: "Mieter 2: E-Mail" },
    { key: "contract.contractDate", label: "Vertrag: Datum" },
    { key: "contract.moveInDate", label: "Vertrag: Einzug" },
    { key: "contract.terminationDate", label: "Vertrag: Gekündigt zum" },
    { key: "contract.contractEndDate", label: "Vertrag: Ende" },
    { key: "contract.kautionHoehe", label: "Kaution Höhe (€)" },
    { key: "contract.kautionszahlungen", label: "Kautionszahlungen (JSON)" },
    { key: "rent.base", label: "Miete: Kaltmiete" },
    { key: "rent.utilities", label: "Miete: Nebenkosten" },
    { key: "rent.heating", label: "Miete: Heizkosten" },
    { key: "rent.parking", label: "Miete: Parkplatz" },
    { key: "payment.iban", label: "Zahlung: IBAN" },
    { key: "payment.directDebitMandateDate", label: "Zahlung: Datum Lastschrift" },
    { key: "payment.mandateReference", label: "Zahlung: Mandatsreferenz" },
    { key: "meterReadings.wasserzaehlerNrDigital", label: "Zähler: Wasser-Nr Digital" },
    { key: "meterReadings.wasserzaehlerStandDigital", label: "Zähler: Wasser-Stand Digital" },
    { key: "meterReadings.wasserzaehlerNrAnalog", label: "Zähler: Wasser-Nr Analog" },
    { key: "meterReadings.wasserzaehlerStandAnalog", label: "Zähler: Wasser-Stand Analog" },
    { key: "meterReadings.heizungNr", label: "Zähler: Heizung-Nr" },
    { key: "meterReadings.heizungStand", label: "Zähler: Heizung-Stand" },
    { key: "meterReadings.stromNr", label: "Zähler: Strom-Nr" },
    { key: "meterReadings.stromStand", label: "Zähler: Strom-Stand" },
    { key: "notes", label: "Notizen" },
];

const PROPERTY_LABELS: { [key: string]: string } = {
    TRI: "Triftstraße",
    PAS: "Pasewalker Str.",
    RITA: "Rosenthaler Str."
};

export const SheetImporter: React.FC<SheetImporterProps> = ({ db, userId, appId, onImportComplete }) => {
    const [apiKey] = useState<string>('AIzaSyDjQrJmmSRjnd47WeEMIm7qXQQde68LI4w');
    const [spreadsheetId] = useState<string>('1bqt-gnTwS0_zk6jGA_phat_v1pxNtSHYblPJVNbgDGY');
    const [sheets, setSheets] = useState<{ title: string }[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<string>('');
    const [headers, setHeaders] = useState<string[]>([]);
    const [data, setData] = useState<any[][]>([]);
    const [mapping, setMapping] = useState<{ [columnIndex: number]: string }>({});
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [effectiveDate, setEffectiveDate] = useState('');
    const [selectedObject, setSelectedObject] = useState('');
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorEditRows, setErrorEditRows] = useState<any[]>([]); // Für Editierfunktion

    const fetchSheets = async () => {
        setError(''); setIsLoading(true); setStatus('Lade Tabellenblätter...');
        try {
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}`);
            const responseData = await response.json();
            if (responseData.error) { throw new Error(responseData.error.message || 'Unbekannter Fehler'); }
            setSheets(responseData.sheets.map((s: any) => ({ title: s.properties.title })));
            setStatus('Tabellenblätter geladen. Bitte wählen Sie eines aus.');
        } catch (e: any) {
            setError(`Fehler: ${e.message}.`);
        } finally { setIsLoading(false); }
    };

    const fetchSheetData = () => {
        if (!selectedSheet) return;
        setIsLoading(true); setStatus('Lade Daten aus Tabellenblatt...');
        setError('');
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(selectedSheet)}`;
        Papa.parse(url, {
            download: true, header: false, skipEmptyLines: false,
            complete: (results) => {
                const rawData = results.data as any[][];
                // Dynamisch: Finde die erste Zeile mit >= 5 nicht-leeren Zellen als Header
                let headerRowIdx = -1;
                for (let i = 0; i < rawData.length; i++) {
                    const filled = rawData[i].filter(cell => String(cell).trim()).length;
                    if (filled >= 5) { headerRowIdx = i; break; }
                }
                if (headerRowIdx === -1) {
                    setError('Keine Kopfzeile mit ausreichend Spalten gefunden!');
                    setIsLoading(false); return;
                }
                const newHeaders = rawData[headerRowIdx].map((header, idx) => header || `Spalte ${idx + 1}`);
                setHeaders(newHeaders);                // Automapping je nach effectiveDate (Stichtag) UND selectedObject
                let stichtag = effectiveDate;
                // Fallback: versuche aus selectedSheet zu extrahieren, falls effectiveDate leer
                if (!stichtag && selectedSheet) {
                    const dateMatch = selectedSheet.match(/\d{4}-\d{2}-\d{2}/);
                    if (dateMatch) stichtag = dateMatch[0];
                }
                
                let autoMapping: { [key: number]: string } = {};
                
                // Objektspezifische Mappings
                if (selectedObject === 'PAS') {
                    // PAS-spezifisches Mapping basierend auf der bereitgestellten Tabelle
                    autoMapping = {
                        0: "apartmentId",              // Spalte 1: Wohnungs-ID
                        // Spalte 2: nicht importieren
                        2: "details.location",         // Spalte 3: Lage
                        3: "tenants.tenant1.name",     // Spalte 4: Mieter 1 Name
                        4: "tenants.tenant2.name",     // Spalte 5: Mieter 2 Name
                        5: "details.area",             // Spalte 6: Fläche (m²)
                        6: "details.persons",          // Spalte 7: Personenanzahl
                        7: "rent.base",                // Spalte 8: Kaltmiete
                        // Spalte 9: nicht importieren
                        9: "rent.utilities",           // Spalte 10: Nebenkosten
                        // Spalte 11: nicht importieren
                        11: "rent.heating",            // Spalte 12: Heizkosten
                        // Spalten 13-17: nicht importieren
                        17: "tenants.tenant1.email",  // Spalte 18: Mieter 1 Mail
                        18: "tenants.tenant1.phone",  // Spalte 19: Mieter 1 Telefon
                        19: "tenants.tenant2.email",  // Spalte 20: Mieter 2 Mail
                        20: "tenants.tenant2.phone",  // Spalte 21: Mieter 2 Telefon
                        21: "contract.contractDate",  // Spalte 22: Vertrag Datum
                        22: "contract.moveInDate",    // Spalte 23: Vertrag Einzug
                        23: "contract.kautionHoehe",  // Spalte 24: Kaution Höhe
                        // Spalte 25: nicht importieren
                        25: "meterReadings.wasserzaehlerNrAnalog",     // Spalte 26: Wasser-Nr. analog
                        26: "meterReadings.wasserzaehlerStandAnalog",  // Spalte 27: Wasser-Stand analog
                        27: "meterReadings.wasserzaehlerNrDigital",    // Spalte 28: Wasser-Nr. Digital
                        28: "meterReadings.wasserzaehlerStandDigital", // Spalte 29: Wasser-Stand Digital
                        29: "meterReadings.heizungNr",                 // Spalte 30: Heizung-Nr.
                        30: "meterReadings.heizungStand",              // Spalte 31: Heizung-Stand
                        31: "meterReadings.stromNr",                   // Spalte 32: Strom-Nr.
                        32: "meterReadings.stromStand"                 // Spalte 33: Strom-Stand
                    };                } else if (selectedObject === 'RITA') {
                    // RITA-spezifisches Mapping basierend auf der korrigierten Tabelle
                    autoMapping = {
                        0: "apartmentId",              // Spalte 1: Wohnungs-ID
                        // Spalte 2: nicht importieren
                        2: "details.location",         // Spalte 3: Lage
                        3: "tenants.tenant1.name",     // Spalte 4: Mieter 1 Name
                        4: "tenants.tenant2.name",     // Spalte 5: Mieter 2 Name
                        5: "details.area",             // Spalte 6: Fläche (m²)
                        6: "rent.base",                // Spalte 7: Kaltmiete
                        // Spalte 8: nicht importieren
                        8: "rent.utilities",           // Spalte 9: Nebenkosten
                        // Spalte 10: nicht importieren
                        // Spalte 11: nicht importieren
                        11: "rent.heating",            // Spalte 12: Heizkosten
                        // Spalten 13-17: nicht importieren
                        17: "tenants.tenant1.email",  // Spalte 18: Mieter 1 Mail
                        18: "tenants.tenant1.phone",  // Spalte 19: Mieter 1 Telefon
                        19: "tenants.tenant2.email",  // Spalte 20: Mieter 2 Mail
                        20: "tenants.tenant2.phone",  // Spalte 21: Mieter 2 Telefon
                        21: "contract.contractDate",  // Spalte 22: Vertrag Datum
                        22: "contract.moveInDate",    // Spalte 23: Vertrag Einzug
                        23: "contract.kautionHoehe"   // Spalte 24: Kaution Höhe
                        // Spalten 25-34: nicht importieren
                    };
                } else if (selectedObject === 'TRI' || selectedObject === 'TRI-P') {
                    // Bestehendes TRI/TRI-P Mapping mit Datum-Logik
                    // Default: Mapping MIT Stellplatz 3 (ab 2024-11-01)
                    autoMapping = {
                        0: "details.houseNumber",
                        1: "details.location",
                        2: "apartmentId",
                        3: "tenants.tenant1.name",
                        4: "tenants.tenant2.name",
                        5: "details.area",
                        6: "rent.base",
                        8: "rent.utilities",
                        9: "rent.heating",
                        11: "details.stellplatz1",
                        12: "details.stellplatz2",
                        13: "details.stellplatz3",
                        15: "details.persons",
                        17: "tenants.tenant1.email",
                        18: "tenants.tenant1.phone",
                        19: "tenants.tenant2.email",
                        20: "tenants.tenant2.phone",
                        21: "contract.contractDate",
                        22: "contract.moveInDate",
                        23: "contract.kautionHoehe",
                        24: "contract.kautionszahlungen",
                        27: "meterReadings.wasserzaehlerNrAnalog",
                        28: "meterReadings.wasserzaehlerStandAnalog",
                        29: "meterReadings.wasserzaehlerNrDigital",
                        30: "meterReadings.wasserzaehlerStandDigital",
                        31: "meterReadings.heizungNr",
                        32: "meterReadings.heizungStand",
                        33: "meterReadings.stromNr",
                        34: "meterReadings.stromStand"
                    };
                    // Wenn das Stichtagsdatum vor 2024-11-01 liegt, Mapping OHNE Stellplatz 3
                    if (stichtag && stichtag < "2024-11-01") {
                        autoMapping = {
                            0: "details.houseNumber",
                            1: "details.location",
                            2: "apartmentId",
                            3: "tenants.tenant1.name",
                            4: "tenants.tenant2.name",
                            5: "details.area",
                            6: "rent.base",
                            8: "rent.utilities",
                            9: "rent.heating",
                            11: "details.stellplatz1",
                            12: "details.stellplatz2",
                            // 13 entfällt (kein Stellplatz 3)
                            14: "details.persons",
                            16: "tenants.tenant1.email",
                            17: "tenants.tenant1.phone",
                            18: "tenants.tenant2.email",
                            19: "tenants.tenant2.phone",
                            20: "contract.contractDate",
                            21: "contract.moveInDate",
                            22: "contract.kautionHoehe",
                            23: "contract.kautionszahlungen",
                            26: "meterReadings.wasserzaehlerNrAnalog",
                            27: "meterReadings.wasserzaehlerStandAnalog",
                            28: "meterReadings.wasserzaehlerNrDigital",
                            29: "meterReadings.wasserzaehlerStandDigital",
                            30: "meterReadings.heizungNr",
                            31: "meterReadings.heizungStand",
                            32: "meterReadings.stromNr",
                            33: "meterReadings.stromStand"
                        };
                    }
                }setMapping(autoMapping);                // Daten ab der nächsten Zeile
                const allDataRows = rawData.slice(headerRowIdx + 1);
                
                // Erweiterte Filterung: Sammle alle relevanten Zeilen (Wohnungen + Parkplätze)
                const dataRows: any[][] = [];
                let foundParkingSection = false;
                
                for (let i = 0; i < allDataRows.length; i++) {
                    const row = allDataRows[i];
                    const houseNumber = (row[0] || '').toString().trim().toUpperCase();
                      // Erkenne Parkplatz-Sektion
                    if (houseNumber === 'P' || (row[1] || '').toString().trim().toLowerCase().includes('parkplatz')) {
                        foundParkingSection = true;
                        console.log(`Debug: Parkplatz-Sektion gefunden bei Zeile ${headerRowIdx + 2 + i} (${houseNumber === 'P' ? 'Hausnummer=P' : 'Lage=Parkplatz'})`);
                    }
                      // Füge Zeilen hinzu wenn sie Inhalt haben
                    if (row.some(cell => String(cell).trim())) {
                        // Überspringe Summenzeilen
                        const locationText = (row[1] || '').toString().trim().toLowerCase();
                        if (locationText.includes('summe') || locationText.includes('gesamt')) {
                            console.log(`Debug: Summenzeile erkannt und übersprungen bei Zeile ${headerRowIdx + 2 + i}`);
                            continue;
                        }
                          if (houseNumber === 'P' || (row[1] || '').toString().trim().toLowerCase().includes('parkplatz')) {
                            // Immer Parkplatz-Zeilen hinzufügen
                            console.log(`Debug: Parkplatz-Zeile hinzugefügt (${houseNumber === 'P' ? 'Hausnummer=P' : 'Lage=Parkplatz'})`);
                            dataRows.push(row);} else if (!foundParkingSection) {
                            // Normale Datenverarbeitung vor Parkplätzen
                            if (selectedObject === 'TRI' && !houseNumber) {                                console.log(`Debug: Potentielles Datenende bei leerer Hausnummer, Zeile ${headerRowIdx + 2 + i}`);
                                // Schaue voraus nach Parkplatz-Zeilen (erweiterte Suche)
                                let hasMoreParkingData = false;
                                console.log(`Debug: Starte Vorausschau ab Index ${i + 1}, maximal bis ${allDataRows.length - 1} (insgesamt ${allDataRows.length} Zeilen)`);
                                for (let j = i + 1; j < allDataRows.length; j++) {
                                    const nextRow = allDataRows[j];
                                    const nextHouseNumber = (nextRow[0] || '').toString().trim().toUpperCase();
                                    const nextLocation = (nextRow[1] || '').toString().trim();
                                    const nextApartmentId = (nextRow[2] || '').toString().trim();
                                    console.log(`Debug: Prüfe Zeile ${headerRowIdx + 2 + j}: Hausnummer="${nextHouseNumber}", Lage="${nextLocation}", ApartmentId="${nextApartmentId}"`);
                                    
                                    // Überspringe Summenzeilen in der Vorausschau
                                    if (nextLocation.toLowerCase().includes('summe') || nextLocation.toLowerCase().includes('gesamt')) {
                                        console.log(`Debug: Überspringe Summenzeile in Vorausschau`);
                                        continue;
                                    }
                                      // Prüfe auf Parkplatz-Zeilen: "P" in Hausnummer ODER "Parkplatz" in Lage
                                    if ((nextHouseNumber === 'P' || nextLocation.toLowerCase().includes('parkplatz')) && nextRow.some(cell => String(cell).trim())) {
                                        hasMoreParkingData = true;
                                        console.log(`Debug: ✅ Parkplatz-Zeilen gefunden ab Zeile ${headerRowIdx + 2 + j} (${nextHouseNumber === 'P' ? 'Hausnummer=P' : 'Lage=Parkplatz'}), setze Verarbeitung fort`);
                                        break;
                                    }
                                }if (!hasMoreParkingData) {
                                    console.log(`Debug: Keine weiteren Parkplatz-Zeilen gefunden, beende Verarbeitung`);
                                    break;
                                } else {
                                    // Es gibt Parkplatz-Daten, also auch diese leere Zeile hinzufügen (könnte Summenzeile sein)
                                    console.log(`Debug: Füge Zeile hinzu trotz leerer Hausnummer (Parkplatz-Daten folgen)`);
                                    dataRows.push(row);
                                }                            } else if ((selectedObject === 'PAS' || selectedObject === 'RITA') && 
                                     !(row[2] || '').toString().trim()) {
                                console.log(`Debug: Datenende bei leerer apartmentId, Zeile ${headerRowIdx + 2 + i}`);
                                break;
                            } else {
                                // Normale Zeile hinzufügen
                                dataRows.push(row);
                            }
                        } else {
                            // Nach Parkplatz-Sektion: nur noch Parkplatz-Zeilen
                            if (houseNumber) {
                                dataRows.push(row);
                            }
                        }
                    }
                }
                
                console.log(`Debug: ${dataRows.length} Datenzeilen nach verbessertem Filter geladen`);
                setData(dataRows);
                setStatus(`${dataRows.length} Datenzeilen geladen (mit verbesserter End-of-Data-Erkennung). Bitte Spalten zuordnen.`);
                setIsLoading(false);
            },
            error: (err: any) => { setError(`Fehler beim Verarbeiten der Sheet-Daten: ${err.message}`); console.error(err); setIsLoading(false); }
        });
    };

    const handleMappingChange = (columnIndex: number, dbField: string) => {
        setMapping(prev => ({ ...prev, [columnIndex]: dbField }));
    };

    // Hilfsfunktion: Vornamen-Geschlechtserkennung (vereinfachte Liste)
    function guessSalutation(firstName: string): string {
      const femaleNames = [
        "Anna", "Maria", "Sabine", "Petra", "Julia", "Laura", "Lisa", "Sophie", "Claudia", "Katrin", "Monika", "Susanne", "Sandra", "Nicole", "Andrea", "Christina", "Stefanie", "Nina", "Sarah", "Jessica", "Katharina", "Carina", "Lena", "Lea", "Michaela", "Vanessa", "Carolin", "Melanie", "Jana", "Tina", "Birgit", "Heike", "Ute", "Silke", "Martina", "Anja", "Sonja", "Daniela", "Angela", "Cornelia", "Renate", "Gabriele", "Elisabeth", "Theresa", "Helga", "Ingrid", "Marina", "Franziska", "Johanna", "Pauline", "Luisa", "Emilia", "Clara", "Helene", "Charlotte", "Emma", "Mia", "Hannah", "Sofia", "Lina", "Leonie", "Amelie", "Marie", "Emily", "Ella", "Anna-Lena", "Annika"
      ];
      if (!firstName) return "Herr";
      return femaleNames.some(n => n.toLowerCase() === firstName.toLowerCase()) ? "Frau" : "Herr";
    }

    // Hilfsfunktion: Fläche und Geldbetrag robust parsen
    function parseNumber(str: string): number {
      if (!str) return 0;
      // Entferne alles außer Ziffern, Komma, Punkt
      let cleaned = String(str).replace(/[^0-9,.-]/g, '');
      // Tausenderpunkt entfernen, falls vorhanden (z.B. 2.065,00)
      cleaned = cleaned.replace(/\.(?=\d{3}(,|$))/, '');
      // Komma zu Punkt
      cleaned = cleaned.replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }

    // Hilfsfunktion: Fläche aus "65 m²" oder "65,00 m²" extrahieren
    function parseArea(str: string): number {
      if (!str) return 0;
      let cleaned = String(str).replace(/[^0-9,.,-]/g, '');
      cleaned = cleaned.replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }    // Hilfsfunktion: Datum ins ISO-Format bringen
    function parseToISODate(dateStr: string): string {
        // Wenn schon im ISO-Format, direkt zurückgeben
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        // Wenn im deutschen Format (DD.MM.YYYY)
        const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (match) {
            const [, d, m, y] = match;
            return `${y}-${m}-${d}`;
        }
        return dateStr; // Fallback: unverändert
    }

    // Hilfsfunktion: Kombinierte Parkplatz-IDs aufteilen
    function splitParkingIds(parkingValue: string): string[] {
        if (!parkingValue || typeof parkingValue !== 'string') return [];
        
        console.log(`Debug: Parkplatz-Wert verarbeiten: "${parkingValue}"`);
        
        // Entferne alle "P" Präfixe für die Verarbeitung
        let cleanValue = parkingValue.toString().trim();
        
        // Verschiedene Separatoren unterstützen: +, ,, ;, Leerzeichen
        const separators = /[\s,;+]+/;
        let parts = cleanValue.split(separators);
        
        // Entferne "P" Präfixe und filtere leere Teile
        parts = parts.map(part => part.replace(/^P/i, '').trim()).filter(part => part.length > 0);
        
        console.log(`Debug: Geteilte Parkplatz-Teile:`, parts);
        
        // Validiere und bereinige die Teile
        const validParts = parts.filter(part => {
            // Nur Zahlen oder Zahlen+Buchstaben erlauben (z.B. "14", "2a")
            return /^[0-9]+[a-zA-Z]*$/.test(part);
        });
        
        console.log(`Debug: Gültige Parkplatz-IDs:`, validParts);
        return validParts;
    }    // Hilfsfunktion: Prüfung auf Parkplatz-Master-Zeile
    function isParkplatzMasterRow(row: any[]): boolean {
        if (!row || row.length === 0) return false;
        
        const houseNumber = (row[0] || '').toString().trim().toUpperCase();
        const location = (row[1] || '').toString().trim().toLowerCase();
        const apartmentId = (row[2] || '').toString().trim();
        
        // Parkplatz-Zeile: Hausnummer "P" ODER Lage enthält "parkplatz"
        if ((houseNumber === 'P' || location.includes('parkplatz')) && apartmentId) {
            return true;
        }
        
        return false;
    }// Hilfsfunktion: Fallback-Suche in Stellplatz-Spalten
    function findParkingInColumns(row: any[], mapping: { [key: number]: string }): string[] {
        const parkingIds: string[] = [];
        
        // Finde alle Stellplatz-Spalten
        const stellplatzColumns = Object.entries(mapping)
            .filter(([_, field]) => field && field.startsWith('details.stellplatz'))
            .map(([colIndex, _]) => parseInt(colIndex));
        
        stellplatzColumns.forEach(colIndex => {
            const value = (row[colIndex] || '').toString().trim();
            if (value) {
                const ids = splitParkingIds(value);
                parkingIds.push(...ids);
            }
        });
        
        return parkingIds;
    }

    const handleImport = async () => {
        const errorRows: any[] = [];
        if (data.length === 0) { alert("Keine Daten zum Importieren vorhanden."); return; }
        if (!selectedObject || !effectiveDate) {
            alert("Fehler: Objekt oder Datum konnten nicht aus dem Tabellenblattnamen extrahiert werden.");
            return;
        }
        // --- NEU: Datum vorab prüfen und normalisieren ---
        const isoDate = parseToISODate(effectiveDate);
        const dateObj = new Date(isoDate);
        if (isNaN(dateObj.getTime())) {
            alert(`Fehler: Das gewählte Stichtagsdatum ('${effectiveDate}') ist ungültig. Bitte im Format JJJJ-MM-TT oder TT.MM.JJJJ eingeben.`);
            return;
        }
        setIsLoading(true); setStatus(`Importiere ${data.length} Datensätze...`);        const batch = writeBatch(db);
        const recordsPath = `propertyManagement/${appId}/users/${userId}/tenantRecords`;
        const recordsCollectionRef = collection(db, recordsPath);
          data.forEach((row, rowIndex) => {
            console.log(`Debug: Verarbeite Zeile ${rowIndex + 4}:`, row);
            
            // Prüfe auf Parkplatz-Zeilen (kombiniert oder einzeln)
            if (isParkplatzMasterRow(row)) {
                console.log(`Debug: Parkplatz-Zeile erkannt in Zeile ${rowIndex + 4}`);
                const apartmentIdValue = (row[2] || '').toString().trim();
                const splitIds = splitParkingIds(apartmentIdValue);
                
                // Fallback für einzelne IDs ohne Separatoren
                if (splitIds.length === 0 && apartmentIdValue) {
                    // Einzelne ID ohne Separatoren
                    const cleanId = apartmentIdValue.replace(/^P/i, '').trim();
                    if (/^[0-9]+[a-zA-Z]*$/.test(cleanId)) {
                        splitIds.push(cleanId);
                    }
                }
                
                console.log(`Debug: Verarbeite Parkplatz-IDs:`, splitIds);
                
                // Erstelle separate Parkplatz-Datensätze für jede ID
                splitIds.forEach(parkingId => {                    console.log(`Debug: Erstelle Parkplatz-Datensatz für ID: P${parkingId}`);
                      // Initialisiere nur die für Parkplätze benötigten Datenstrukturen
                    let recordData: any = { 
                        details: { stellplatz1: '', stellplatz2: '', stellplatz3: '', stellplatz4: '' }, 
                        tenants: { tenant1: { 
                            name: '', phone: '', email: '', firstName: '', lastName: '', 
                            salutation: '', address: '', birthDate: '' 
                        } }, 
                        contract: { contractDate: '', moveInDate: '', contractEndDate: '' }, 
                        payment: { iban: '', mandateReference: '' }, 
                        rent: { parking: 0, base: 0, total: 0 }, 
                        notes: '' 
                    };
                    let originalMappedData: { [key: string]: string } = {};
                      // Sammle alle gemappten Daten
                    row.forEach((cellValue, colIndex) => {
                        const dbField = mapping[colIndex];
                        if (dbField) {
                            originalMappedData[dbField] = cellValue ?? '';
                        }
                    });
                      // Definiere erlaubte Felder für Parkplätze
                    const allowedParkingFields = [
                        'details.stellplatz1', 'details.stellplatz2', 'details.stellplatz3', 'details.stellplatz4',
                        'tenants.tenant1.name', 'tenants.tenant1.phone', 'tenants.tenant1.email', 
                        'tenants.tenant1.address', 'tenants.tenant1.birthDate', 'tenants.tenant1.salutation',
                        'contract.contractDate', 'contract.moveInDate', 'contract.contractEndDate',
                        'rent.parking', 'rent.base', // Stellplatzmiete
                        'payment.iban', 'payment.mandateReference'
                    ];
                    
                    // Baue Parkplatz-Datensatz auf (nur mit erlaubten Feldern)
                    for (const dbField in originalMappedData) {
                        if (dbField === 'apartmentId') continue; // Überspringen, wird separat gesetzt
                        
                        // Prüfe ob Feld für Parkplätze erlaubt ist
                        if (!allowedParkingFields.includes(dbField)) {
                            console.log(`Debug: Überspringe Feld für Parkplatz: ${dbField}`);
                            continue;
                        }
                        
                        const keys = dbField.split('.');
                        let currentLevel = recordData;
                        for (let i = 0; i < keys.length - 1; i++) {
                            if (typeof currentLevel[keys[i]] !== 'object' || currentLevel[keys[i]] === null) {
                                currentLevel[keys[i]] = {};
                            }
                            currentLevel = currentLevel[keys[i]];
                        }
                        const lastKey = keys[keys.length - 1];
                        const value = originalMappedData[dbField];
                          // Spezielle Behandlung für verschiedene Feldtypen
                        if (dbField === 'tenants.tenant1.name') {
                            const parts = value ? value.trim().split(/\s+/) : [];
                            let firstName = '';
                            let lastName = '';
                            if (parts.length === 2) {
                                lastName = parts[0];
                                firstName = parts[1];
                            } else if (parts.length > 2) {
                                lastName = parts[0];
                                firstName = parts.slice(1).join(' ');
                            } else if (parts.length === 1) {
                                firstName = parts[0];
                                lastName = '';
                            }
                            const salutation = guessSalutation(firstName.split(' ')[0] || '');
                            currentLevel['name'] = value;
                            currentLevel['firstName'] = firstName;
                            currentLevel['lastName'] = lastName;
                            currentLevel['salutation'] = salutation;
                            continue;
                        }
                        
                        if (dbField.startsWith('rent.') || dbField === 'contract.kautionHoehe') {
                            currentLevel[lastKey] = parseNumber(value);
                            continue;
                        }
                        
                        if (dbField.startsWith('contract.') && dbField.toLowerCase().includes('date')) {
                            const dateVal = value ? new Date(value) : null;
                            currentLevel[lastKey] = (dateVal && !isNaN(dateVal.getTime())) ? dateVal.toISOString().slice(0, 10) : '';
                            continue;
                        }
                        
                        // Standard-Zuweisung
                        currentLevel[lastKey] = value ?? '';
                    }
                    
                    // Setze die spezifische Parkplatz-ID
                    recordData.apartmentId = `P${parkingId}`;
                    
                    // Parkplatz-spezifische Felder setzen
                    recordData.details.stellplatz1 = parkingId;
                    recordData.details.stellplatz2 = '';
                    recordData.details.stellplatz3 = '';
                    recordData.details.stellplatz4 = '';
                    recordData.notes = `Aufgeteilt aus kombinierter Parkplatz-ID "${apartmentIdValue}" in Zeile ${rowIndex + 4}`;
                    
                    console.log(`Debug: Parkplatz-Datensatz erstellt:`, recordData);
                    
                    const parkingFinalRecord = {
                        propertyCode: selectedObject + '-P',
                        apartmentId: recordData.apartmentId,
                        effectiveDate: Timestamp.fromDate(dateObj),
                        createdAt: Timestamp.now(),
                        changeType: 'Importiert (Parkplatz aufgeteilt)',
                        data: recordData
                    };
                    
                    const parkingDocRef = doc(recordsCollectionRef);
                    batch.set(parkingDocRef, parkingFinalRecord);
                });
                
                return; // Verarbeitung der Master-Zeile beendet
            }
            
            // Normale Zeilen-Verarbeitung
            let recordData: any = { details: {}, tenants: {}, contract: {}, payment: {}, rent: {}, meterReadings: {}, notes: '' };
            let originalMappedData: { [key: string]: string } = {};
            row.forEach((cellValue, colIndex) => {
                const dbField = mapping[colIndex];
                if (dbField) {
                    originalMappedData[dbField] = cellValue ?? '';
                }
            });

            // PAS Spezialfall
            if (selectedObject === 'PAS') {
                const lage = originalMappedData['details.location'] || '';
                const wohnungsId = originalMappedData['apartmentId'] || '';
                if (lage.toLowerCase().includes('rosenthaler')) {
                    recordData.apartmentId = lage.slice(-3).trim();
                    recordData.details.location = '';
                } else {
                    recordData.apartmentId = wohnungsId;
                    recordData.details.location = lage;
                }
            } else {
                recordData.apartmentId = originalMappedData['apartmentId'];
                if (originalMappedData['details.location']) {
                    recordData.details.location = originalMappedData['details.location'];
                }
            }

            // --- Mapping und Spezialbehandlung ---
            for (const dbField in originalMappedData) {
                if (dbField === 'apartmentId' || dbField === 'details.location') continue;
                const keys = dbField.split('.');
                let currentLevel = recordData;
                for (let i = 0; i < keys.length - 1; i++) {
                    if (typeof currentLevel[keys[i]] !== 'object' || currentLevel[keys[i]] === null) {
                        currentLevel[keys[i]] = {};
                    }
                    currentLevel = currentLevel[keys[i]];
                }
                const lastKey = keys[keys.length - 1];
                const value = originalMappedData[dbField];

                // Name & Geschlecht
                if (dbField === 'tenants.tenant1.name' || dbField === 'tenants.tenant2.name') {
                    // Korrigierte Logik: Name splitten, Nachname und Vorname korrekt zuweisen
                    const parts = value ? value.trim().split(/\s+/) : [];
                    let firstName = '';
                    let lastName = '';
                    if (parts.length === 2) {
                        // Im deutschen Mietrecht ist oft Nachname Vorname, daher:
                        lastName = parts[0];
                        firstName = parts[1];
                    } else if (parts.length > 2) {
                        lastName = parts[0];
                        firstName = parts.slice(1).join(' ');
                    } else if (parts.length === 1) {
                        firstName = parts[0];
                        lastName = '';
                    }
                    const salutation = guessSalutation(firstName.split(' ')[0] || '');
                    currentLevel['name'] = value;
                    currentLevel['firstName'] = firstName;
                    currentLevel['lastName'] = lastName;
                    currentLevel['salutation'] = salutation;
                    continue;
                }
                // Fläche
                if (dbField === 'details.area') {
                    currentLevel[lastKey] = parseArea(value);
                    continue;
                }
                // Geldbetrag (Kaution, Miete, etc.)
                if (dbField.startsWith('rent.') || dbField === 'contract.kautionHoehe') {
                    currentLevel[lastKey] = parseNumber(value);
                    continue;
                }
                // Kautionszahlungen (JSON oder Einzelwert)
                if (dbField === 'contract.kautionszahlungen') {
                    try {
                        if (value && value.trim().startsWith('[')) {
                            currentLevel[lastKey] = JSON.parse(value);
                        } else if (value && value.trim()) {
                            // Einzelbetrag (z.B. "1234,56")
                            const betrag = parseNumber(value);
                            if (betrag > 0) {
                                currentLevel[lastKey] = [{ betrag, datum: '' }];
                            } else {
                                currentLevel[lastKey] = [];
                            }
                        } else {
                            currentLevel[lastKey] = [];
                        }
                    } catch {
                        currentLevel[lastKey] = [];
                    }
                    continue;
                }
                // Datum
                if (dbField.startsWith('contract.') && dbField.toLowerCase().includes('date')) {
                  const dateVal = value ? new Date(value) : null;
                  currentLevel[lastKey] = (dateVal && !isNaN(dateVal.getTime())) ? dateVal.toISOString().slice(0, 10) : '';
                  continue;
                }
                // Zählernummern: Sheet-Wert bevorzugen, sonst Zuordnung
                const meterNumberFields = [
                  'meterReadings.wasserzaehlerNrDigital',
                  'meterReadings.wasserzaehlerNrAnalog',
                  'meterReadings.heizungNr',
                  'meterReadings.stromNr'
                ];
                if (meterNumberFields.includes(dbField)) {
                  currentLevel[lastKey] = value || '';
                  continue;
                }
                // Zählerstände: Sheet-Wert bevorzugen
                const meterReadingFields = [
                  'meterReadings.wasserzaehlerStandDigital',
                  'meterReadings.wasserzaehlerStandAnalog',
                  'meterReadings.heizungStand',
                  'meterReadings.stromStand'
                ];
                if (meterReadingFields.includes(dbField)) {
                  currentLevel[lastKey] = parseNumber(value);
                  continue;
                }
                // Standard
                currentLevel[lastKey] = value ?? '';
            }            // --- apartmentId robust prüfen (vor Zählerzuordnung!) ---
            const hausnr = originalMappedData['details.houseNumber'] || '';
            let aptIdTrimmed = (recordData.apartmentId || '').toString().trim();
            
            // Spezielle Behandlung für leere apartmentId mit Fallback-Suche
            if (!aptIdTrimmed) {
                console.log(`Debug: Leere apartmentId in Zeile ${rowIndex + 4}, suche in Stellplatz-Spalten...`);
                const foundParkingIds = findParkingInColumns(row, mapping);
                
                if (foundParkingIds.length > 0) {
                    console.log(`Debug: Gefundene Parkplatz-IDs in Spalten:`, foundParkingIds);
                    aptIdTrimmed = foundParkingIds[0]; // Verwende die erste gefundene ID
                } else {
                    // Fehlerhafte Zeile merken, aber ohne Fehler
                    console.log(`Debug: Überspringe Zeile ${rowIndex + 4} - keine apartmentId und keine Stellplätze gefunden`);
                    return;
                }
            }
            
            // NEU: Für Parkplätze apartmentId = 'P' + Whg
            if (hausnr.trim().toUpperCase() === 'P' && !aptIdTrimmed.startsWith('P')) {
                aptIdTrimmed = 'P' + aptIdTrimmed;
            }
            
            recordData.apartmentId = aptIdTrimmed;
            console.log(`Debug: Finale apartmentId für Zeile ${rowIndex + 4}: "${aptIdTrimmed}"`);

            // --- Zählernummern: Falls leer, Zuordnungslogik ---
            const wohnungsId = recordData.apartmentId;
            const zuordnung = zaehlerZuordnung[wohnungsId];
            if (zuordnung) {
              if (!recordData.meterReadings.wasserzaehlerNrDigital) recordData.meterReadings.wasserzaehlerNrDigital = zuordnung.wasserzaehlerNrDigital || '';
              if (!recordData.meterReadings.wasserzaehlerNrAnalog) recordData.meterReadings.wasserzaehlerNrAnalog = zuordnung.wasserzaehlerNrAnalog || '';
              if (!recordData.meterReadings.heizungNr) recordData.meterReadings.heizungNr = zuordnung.heizungNr || '';
              if (!recordData.meterReadings.stromNr) recordData.meterReadings.stromNr = zuordnung.stromNr || '';
            }            // --- Prüfe ob Parkplätze extrahiert werden und entferne dann die Stellplatzmiete ---
            const parkingFields = ['details.stellplatz1', 'details.stellplatz2', 'details.stellplatz3'];
            const hasParkingSpaces = parkingFields.some(field => {
                const parkingValue = originalMappedData[field];
                return parkingValue && parkingValue.toString().trim() !== '';
            });
            
            // Wenn Parkplätze als separate Datensätze extrahiert werden, entferne die Stellplatzmiete von der Wohnung
            if (hasParkingSpaces) {
                console.log(`Debug: Entferne Stellplatzmiete von Wohnung ${recordData.apartmentId} da Parkplätze separat extrahiert werden`);
                recordData.rent.parking = 0;
                // Gesamtmiete neu berechnen ohne Stellplatzmiete
                recordData.rent.total = (recordData.rent.base || 0) + (recordData.rent.utilities || 0) + (recordData.rent.heating || 0);
            }

            // --- Wohnung importieren ---
            // Verwende das geprüfte Datum für alle Datensätze
            const finalRecord = {
                propertyCode: selectedObject,
                apartmentId: recordData.apartmentId,
                effectiveDate: Timestamp.fromDate(dateObj), // <--- geprüfter Wert
                createdAt: Timestamp.now(),
                changeType: 'Importiert',
                data: recordData
            };
            const newDocRef = doc(recordsCollectionRef);            batch.set(newDocRef, finalRecord);            // --- Parkplätze importieren (mit verbesserter Split-Logik!) ---
            // Verwende die bereits definierte parkingFields Variable
            parkingFields.forEach((field) => {
                const parkingValue = originalMappedData[field];
                if (parkingValue && parkingValue.toString().trim() !== '') {
                    console.log(`Debug: Verarbeite Stellplatz-Feld ${field} mit Wert: "${parkingValue}"`);
                    
                    // Verwende die neue Split-Funktion für kombinierte IDs
                    const parkingIds = splitParkingIds(parkingValue.toString());
                      parkingIds.forEach(parkingId => {
                        console.log(`Debug: Erstelle Parkplatz-Datensatz für ID: P${parkingId} aus Feld ${field}`);
                        
                        // Parkplatz-Datensatz erzeugen (nur relevante Felder für Parkplätze)
                        const parkingRecord: any = {
                            details: {
                                stellplatz1: parkingId,  // Setze spezifische Parkplatz-ID
                                stellplatz2: '',
                                stellplatz3: '',
                                stellplatz4: ''
                            },
                            tenants: {
                                tenant1: {
                                    name: recordData.tenants?.tenant1?.name || '',
                                    firstName: recordData.tenants?.tenant1?.firstName || '',
                                    lastName: recordData.tenants?.tenant1?.lastName || '',
                                    salutation: recordData.tenants?.tenant1?.salutation || '',
                                    email: recordData.tenants?.tenant1?.email || '',
                                    phone: recordData.tenants?.tenant1?.phone || '',
                                    address: recordData.tenants?.tenant1?.address || '',
                                    birthDate: recordData.tenants?.tenant1?.birthDate || ''
                                }
                            },
                            contract: {
                                contractDate: recordData.contract?.contractDate || '',
                                moveInDate: recordData.contract?.moveInDate || '',
                                contractEndDate: recordData.contract?.contractEndDate || ''
                            },
                            payment: {
                                iban: recordData.payment?.iban || '',
                                mandateReference: recordData.payment?.mandateReference || ''
                            },
                            rent: {
                                parking: recordData.rent?.parking || 0,
                                base: recordData.rent?.base || 0,
                                total: (recordData.rent?.parking || 0) + (recordData.rent?.base || 0)
                            },
                            notes: `Importiert aus Zeile ${rowIndex + 4}, zu Wohnung ${recordData.apartmentId}${parkingIds.length > 1 ? `, aufgeteilt aus "${parkingValue}"` : ''}`
                        };
                        
                        // apartmentId: P + Nummer (z.B. P4)
                        parkingRecord.apartmentId = 'P' + parkingId;

                        const parkingFinalRecord = {
                            propertyCode: selectedObject + '-P',
                            apartmentId: parkingRecord.apartmentId,
                            effectiveDate: Timestamp.fromDate(dateObj),
                            createdAt: Timestamp.now(),
                            changeType: parkingIds.length > 1 ? 'Importiert (aufgeteilt)' : 'Importiert',
                            data: parkingRecord
                        };
                        const parkingDocRef = doc(recordsCollectionRef);
                        batch.set(parkingDocRef, parkingFinalRecord);
                    });
                }
            });
        });

        // Wenn Fehler aufgetreten sind, zeige Modal und breche Import ab
        if (errorRows.length > 0) {
            setErrorEditRows(errorRows.map(e => ({ ...e })));
            setShowErrorModal(true);
            setIsLoading(false);
            setStatus('Es wurden fehlerhafte Zeilen gefunden. Bitte korrigieren.');
            return; // <--- Import-Flow hier beenden!
        }        // Nur wenn keine Fehler: commit und Alert
        try {
            await batch.commit();
              // Berechne Statistiken für bessere Rückmeldung
            let wohnungCount = 0;
            let parkplatzCount = 0;
            let splitParkplatzCount = 0;
            
            data.forEach((row) => {
                if (isParkplatzMasterRow(row)) {
                    const apartmentIdValue = (row[2] || '').toString().trim();
                    const splitIds = splitParkingIds(apartmentIdValue);
                    splitParkplatzCount += splitIds.length;
                } else {
                    wohnungCount++;
                    
                    // Zähle normale Parkplätze
                    const parkingFields = ['details.stellplatz1', 'details.stellplatz2', 'details.stellplatz3'];
                    let originalMappedData: { [key: string]: string } = {};
                    row.forEach((cellValue: any, colIndex: number) => {
                        const dbField = mapping[colIndex];
                        if (dbField) {
                            originalMappedData[dbField] = cellValue ?? '';
                        }
                    });
                    
                    parkingFields.forEach((field) => {
                        const parkingValue = originalMappedData[field];
                        if (parkingValue && parkingValue.toString().trim() !== '') {
                            const parkingIds = splitParkingIds(parkingValue.toString());
                            parkplatzCount += parkingIds.length;
                        }
                    });
                }
            });
            
            const totalParkingSpaces = parkplatzCount + splitParkplatzCount;
            let successMessage = `Import erfolgreich! ${wohnungCount} Wohnungen`;
            if (totalParkingSpaces > 0) {
                successMessage += ` und ${totalParkingSpaces} Parkplätze`;
                if (splitParkplatzCount > 0) {
                    successMessage += ` (${splitParkplatzCount} davon aus kombinierten IDs aufgeteilt)`;
                }
            }
            successMessage += ` wurden importiert.`;
            
            setStatus(successMessage);
            alert(successMessage);
            onImportComplete(effectiveDate);
        } catch (e: any) {
            setError("Fehler beim Schreiben in die Datenbank: " + e.message);
        } finally { setIsLoading(false); }

        if (errorRows.length > 0) {
            setErrorEditRows(errorRows.map(e => ({ ...e }))); // Kopie für Editierfunktion
            setShowErrorModal(true);
        }
    };

    // Handler für das Speichern der korrigierten Zeilen
    const handleSaveErrorRows = async () => {
        setShowErrorModal(false);
        setIsLoading(true);
        const batch = writeBatch(db);
        const recordsPath = `propertyManagement/${appId}/users/${userId}/tenantRecords`;
        const recordsCollectionRef = collection(db, recordsPath);
        let savedCount = 0;
        for (const errorRow of errorEditRows) {
            let recordData: any = { details: {}, tenants: {}, contract: {}, payment: {}, rent: {}, meterReadings: {}, notes: '' };
            // Mapping wie im Import
            Object.entries(errorRow.originalMappedData).forEach(([dbField, value]) => {
                // ...Mapping-Logik wie oben...
                // Hier reicht für die Demo: apartmentId und details.location
                if (dbField === 'apartmentId') recordData.apartmentId = value;
                if (dbField === 'details.location') recordData.details.location = value;
            });
            if (!recordData.apartmentId) continue;
            const finalRecord = {
                propertyCode: selectedObject,
                apartmentId: recordData.apartmentId,
                effectiveDate: Timestamp.fromDate(new Date(parseToISODate(effectiveDate))),
                createdAt: Timestamp.now(),
                changeType: 'Importiert (manuell korrigiert)',
                data: recordData
            };
            const newDocRef = doc(recordsCollectionRef);
            batch.set(newDocRef, finalRecord);
            savedCount++;
        }
        await batch.commit();
        setIsLoading(false);
        setStatus(`${savedCount} korrigierte Datensätze wurden importiert.`);
        setErrorEditRows([]);
        setShowErrorModal(false);
    };

    useEffect(() => {
        if (selectedSheet) {
            const dateMatch = selectedSheet.match(/^\d{4}-\d{2}-\d{2}/);
            if (dateMatch) setEffectiveDate(dateMatch[0]);
            const objMatch = selectedSheet.match(/\b(TRI|PAS|RITA)\b$/i);
            if (objMatch) setSelectedObject(objMatch[1].toUpperCase());
        } else {
            setEffectiveDate('');
            setSelectedObject('');
        }
    }, [selectedSheet]);

return (
    <div className="mb-10 p-6 sm:p-8 bg-gray-800 text-gray-200 rounded-xl shadow-2xl border border-gray-700">
        <div className="flex justify-between items-center border-b border-gray-600 pb-4 mb-6">
            <h2 className="text-3xl font-semibold text-white">Google Sheet Import</h2>
            <div className="flex gap-4">
                 <button onClick={handleImport} disabled={isLoading || data.length === 0} className="px-5 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg disabled:bg-gray-500">
                    {isLoading ? 'Importiere...' : 'Daten importieren'}
                </button>
                <button onClick={() => onImportComplete(effectiveDate || new Date().toISOString().split('T')[0])} className="px-5 py-2 text-sm bg-rose-700 hover:bg-rose-600 text-white font-semibold rounded-lg">
                    Abbrechen
                </button>
            </div>
        </div>


        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
                <button onClick={fetchSheets} disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-700 w-full sm:w-auto">
                    {isLoading ? 'Lade...' : '1. Tabellenblätter laden'}
                </button>

                {sheets.length > 0 && (
                    <select value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)} className="block w-full p-2 border border-gray-600 bg-gray-700 rounded-md shadow-sm">
                        <option value="">-- 2. Tabellenblatt auswählen --</option>
                        {sheets.map(s => <option key={s.title} value={s.title}>{s.title}</option>)}
                    </select>
                )}

                {selectedSheet && (
                    <button onClick={fetchSheetData} disabled={!selectedSheet || isLoading} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-700 w-full sm:w-auto">
                        3. Daten für Mapping laden
                    </button>
                )}
            </div>

            {error && <p className="text-red-400 text-sm mt-1">{error}</p>}

            {/* NEU: Bessere Anzeige für das erkannte Datum */}
            {selectedSheet && (
                <div className="p-3 bg-gray-700 border border-gray-600 rounded-lg">
                    <p className="text-sm text-gray-300">
                        Erkannt aus dem Blattnamen:
                        <span className="font-bold text-blue-400 ml-2">{PROPERTY_LABELS[selectedObject] || "..."}</span>
                        <span className="font-bold text-blue-400 ml-2">({effectiveDate || "Kein Datum erkannt"})</span>
                    </p>
                </div>
            )}

            {headers.length > 0 && data.length > 0 && (
            <div className="space-y-4">
                {/* Eingabefeld für das erkannte/zu importierende Datum */}
                <div className="mb-2">
                    <label className="block text-base font-medium text-gray-300 mb-1">Stichtagsdatum für Import</label>
                    <input
                        type="date"
                        className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-200"
                        value={effectiveDate}
                        onChange={e => setEffectiveDate(e.target.value)}
                    />
                    <span className="text-xs text-gray-400 ml-2">(Wird für alle importierten Datensätze verwendet)</span>
                </div>
                <label className="block text-base font-medium text-gray-300">4. Spalten zuordnen</label>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {headers.map((header, index) => {
                        if (!header.trim() && data.every(row => !row[index])) return null;
                        const mappedFields = Object.entries(mapping)
                            .filter(([i, v]) => v && Number(i) !== index)
                            .map(([_, v]) => v);
                        return (
                            <div key={index} className="p-4 bg-gray-700 rounded-lg border border-gray-600 flex items-center justify-between gap-6">
                                <div style={{width: "280px"}} className="flex-shrink-0">
                                    <p className="font-bold text-blue-400 truncate" title={header || `Spalte ${index + 1}`}>
                                        {header && header.trim() ? header : `Spalte ${index + 1}`}
                                    </p>
                                    <div className="mt-1 text-xs text-gray-400 bg-gray-900 p-2 rounded border border-dashed border-gray-500 h-16 overflow-y-auto">
                                        {data.slice(0, 3).map((row, rowIndex) => (
                                            <p key={rowIndex} className="truncate">{row[index] || <span className="italic text-gray-500">leer</span>}</p>
                                        ))}
                                    </div>
                                </div>
                                <div style={{width: "280px"}} className="flex-shrink-0">
                                    <select value={mapping[index] || ''} onChange={e => handleMappingChange(index, e.target.value)} className="block w-full p-2 border border-gray-600 bg-gray-900 text-gray-200 rounded-md shadow-sm">
                                        <option value="">-- Nicht importieren --</option>
                                        {TARGET_FIELDS.filter(field => !mappedFields.includes(field.key) || mapping[index] === field.key).map(field => (
                                            <option key={field.key} value={field.key}>{field.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
            )}

            {status && <p className="mt-2 text-sm font-medium">{status}</p>}

            <div className="flex gap-4 pt-6 border-t border-gray-600">
                 <button onClick={handleImport} disabled={isLoading || data.length === 0} className="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed">
                    {isLoading ? 'Importiere...' : 'Daten importieren'}
                </button>
                <button onClick={() => onImportComplete(effectiveDate || new Date().toISOString().split('T')[0])} className="px-8 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700">
                    Abbrechen
                </button>
            </div>
        </div>

        {/* Fehlerkorrektur-Modal */}
        {showErrorModal && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                <div className="bg-gray-900 border border-gray-600 rounded-lg p-8 w-full max-w-2xl">
                    <h3 className="text-lg font-bold text-red-400 mb-4">Fehlerhafte Zeilen – bitte korrigieren</h3>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {errorEditRows.map((err, idx) => (
                            <div key={idx} className="bg-gray-800 border border-gray-700 rounded p-4 flex flex-col gap-2">
                                <div className="text-xs text-gray-400">Zeile im Sheet: {err.rowIndex} – Grund: {err.reason}</div>
                                <div className="flex gap-2 items-center">
                                    <label className="text-sm">Wohnungs-ID:</label>
                                    <input type="text" value={err.originalMappedData.apartmentId || ''} onChange={e => {
                                        const newRows = [...errorEditRows];
                                        newRows[idx].originalMappedData.apartmentId = e.target.value;
                                        setErrorEditRows(newRows);
                                    }} className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-gray-200" />
                                </div>
                                <div className="flex gap-2 items-center">
                                    <label className="text-sm">Lage:</label>
                                    <input type="text" value={err.originalMappedData['details.location'] || ''} onChange={e => {
                                        const newRows = [...errorEditRows];
                                        newRows[idx].originalMappedData['details.location'] = e.target.value;
                                        setErrorEditRows(newRows);
                                    }} className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-gray-200" />
                                </div>
                                <div className="flex gap-2 items-center">
                                    <label className="text-sm">Mieter 1 Name:</label>
                                    <input type="text" value={err.originalMappedData['tenants.tenant1.name'] || ''} readOnly className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-gray-400 cursor-not-allowed" />
                                </div>
                                <div className="flex gap-2 items-center">
                                    <label className="text-sm">Kaltmiete:</label>
                                    <input type="text" value={err.originalMappedData['rent.base'] || ''} readOnly className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-gray-400 cursor-not-allowed" />
                                </div>
                                <div className="flex justify-end mt-2">
                                    <button onClick={() => {
                                        const newRows = errorEditRows.filter((_, i) => i !== idx);
                                        setErrorEditRows(newRows);
                                    }} className="btn btn-danger text-xs">Datensatz verwerfen</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button onClick={handleSaveErrorRows} className="btn btn-success">Korrigierte Zeilen importieren</button>
                        <button onClick={() => setShowErrorModal(false)} className="btn btn-danger">Abbrechen</button>
                    </div>
                </div>
            </div>
        )}
    </div>
);
};