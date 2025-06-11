import { useState, useEffect, useCallback } from 'react';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, Timestamp, addDoc, writeBatch, doc } from 'firebase/firestore';
import { RecordForm } from './src/RecordForm';
import { SheetImporter } from './src/SheetImporter';

// Interfaces
export interface MeterReadings {
    wasserzaehlerNrDigital: string;
    wasserzaehlerStandDigital: number;
    wasserzaehlerNrAnalog: string;
    wasserzaehlerStandAnalog: number;
    heizungNr: string;
    heizungStand: number;
    stromNr: string;      // <--- Ergänzt
    stromStand: number;   // <--- Ergänzt
}
export interface TenantData { name: string; phone: string; email: string; }
export interface RecordDataDetails {
    area: number;
    houseNumber?: string;
    location: string;
    persons: number;
    stellplatz1?: string;
    stellplatz2?: string;
    stellplatz3?: string;
    stellplatz4?: string; // <--- Ergänzt
}
export interface Kautionszahlung { betrag: number; datum: string; }
export interface RecordDataContract {
    contractDate: string;
    moveInDate: string;
    terminationDate?: string;
    contractEndDate?: string;
    kautionHoehe: number;
    kautionszahlungen: Kautionszahlung[];
}
export interface RecordDataPayment { iban: string; directDebitMandateDate?: string; mandateReference: string; }
export interface RecordDataRent { base: number; utilities: number; heating: number; parking: number; total: number; }
export interface FullRecordData {
    details: RecordDataDetails;
    tenants: { tenant1: TenantData; tenant2?: TenantData; };
    contract: RecordDataContract;
    payment: RecordDataPayment;
    rent: RecordDataRent;
    meterReadings: MeterReadings;
    notes: string;
}
export interface TenantRecord {
    id: string;
    propertyCode: string;
    apartmentId: string;
    effectiveDate: Timestamp;
    data: FullRecordData;
}

const firebaseConfig = {
    apiKey: "AIzaSyDKCUfRQAldZXFjF6PT_qcInBewvHmnKFU",
    authDomain: "immobiliendaten-9ce02.firebaseapp.com",
    projectId: "immobiliendaten-9ce02",
    storageBucket: "immobiliendaten-9ce02.firebasestorage.app",
    messagingSenderId: "260402835458",
    appId: "1:260402835458:web:617a310f512c6779d2f71b"
};

const PROPERTY_CODES: { [key: string]: { name: string; hasHouseNumbers: boolean } } = { 
    TRI: { name: "Triftstraße", hasHouseNumbers: true }, 
    PAS: { name: "Pasewalker Str.", hasHouseNumbers: false }, 
    RITA: { name: "Rosenthaler Str.", hasHouseNumbers: false },
    'TRI-P': { name: "Parkplätze Triftstraße", hasHouseNumbers: false } // NEU: Parkplätze als eigenes Objekt
};

// Hilfsfunktion zum Sortieren der Wohnungen
const sortRecords = (records: TenantRecord[], propertyCode: string) => {
    return records.sort((a, b) => {
        if (propertyCode === 'TRI') {
            const houseNumberA = parseInt(a.data.details.houseNumber || '0');
            const houseNumberB = parseInt(b.data.details.houseNumber || '0');
            if (houseNumberA !== houseNumberB) {
                return houseNumberA - houseNumberB;
            }
        }
        // Vereinfachte Sortierung nach Etage und Lage, kann verfeinert werden
        const locationA = (a.data.details.location || '').replace('EG', '0').replace('OG', '');
        const locationB = (b.data.details.location || '').replace('EG', '0').replace('OG', '');
        return locationA.localeCompare(locationB);
    });
};

function App() {
    const [auth, setAuth] = useState<Auth | null>(null);
    const [db, setDb] = useState<Firestore | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const [recordsByProperty, setRecordsByProperty] = useState<{ [key: string]: TenantRecord[] }>({});
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [queryDate, setQueryDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [showAddForm, setShowAddForm] = useState<boolean>(false);
    const [recordToUpdate, setRecordToUpdate] = useState<TenantRecord | undefined>(undefined);
    const [isTenantChangeMode, setIsTenantChangeMode] = useState<boolean>(false);
    const [showImporter, setShowImporter] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [recordToDelete, setRecordToDelete] = useState<TenantRecord | undefined>(undefined);
    const [deleteRelatedParkingRecords, setDeleteRelatedParkingRecords] = useState<boolean>(false);
    
    // Neue State-Variablen für Filterung
    const [selectedProperties, setSelectedProperties] = useState<string[]>(['TRI', 'TRI-P', 'PAS', 'RITA']);
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [showPropertyDropdown, setShowPropertyDropdown] = useState<boolean>(false);

    useEffect(() => {
        const app: FirebaseApp = initializeApp(firebaseConfig);
        setAuth(getAuth(app));
        setDb(getFirestore(app));
    }, []);

    useEffect(() => {
        if (auth) {
            const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                setUser(currentUser);
            });
            return () => unsubscribe();
        }
    }, [auth]);

    const fetchRecords = useCallback(async () => {
        if (!db || !user) return;
        setIsLoading(true);
        const recordsPath = `propertyManagement/${db.app.options.appId}/users/${user.uid}/tenantRecords`;
        const recordsRef = collection(db, recordsPath);
        
        // Hole alle Datensätze für die verfügbaren Daten
        const allRecordsQuery = query(recordsRef);
        const allRecordsSnapshot = await getDocs(allRecordsQuery);
        const uniqueDates = new Set<string>();
        
        allRecordsSnapshot.forEach(doc => {
            const record = { id: doc.id, ...(doc.data() as Omit<TenantRecord, 'id'>) };
            // Nur Datensätze von ausgewählten Objekten berücksichtigen
            if (selectedProperties.includes(record.propertyCode)) {
                const dateStr = record.effectiveDate.toDate().toISOString().split('T')[0];
                uniqueDates.add(dateStr);
            }
        });
        
        const sortedDates = Array.from(uniqueDates).sort((a, b) => b.localeCompare(a)); // Neueste zuerst
        setAvailableDates(sortedDates);
        
        // Bestehende Logik für Datensätze bis zum ausgewählten Datum
        const targetTimestamp = Timestamp.fromDate(new Date(queryDate));
        const q = query(recordsRef, where("effectiveDate", "<=", targetTimestamp));
        
        const querySnapshot = await getDocs(q);
        const allRecordsUntilDate: TenantRecord[] = [];
        querySnapshot.forEach(doc => { allRecordsUntilDate.push({ id: doc.id, ...(doc.data() as Omit<TenantRecord, 'id'>) }); });
        
        const latestRecordsMap = new Map<string, TenantRecord>();
        for (const record of allRecordsUntilDate) {
            const uniqueKey = `${record.propertyCode}-${record.apartmentId}`;
            const existing = latestRecordsMap.get(uniqueKey);
            if (!existing || record.effectiveDate.toMillis() > existing.effectiveDate.toMillis()) {
                latestRecordsMap.set(uniqueKey, record);
            }
        }
        const finalRecords = Array.from(latestRecordsMap.values());

        const groupedRecords: { [key: string]: TenantRecord[] } = {};
        for (const propertyCode of Object.keys(PROPERTY_CODES)) {
            const propertyRecords = finalRecords.filter(r => r.propertyCode === propertyCode);
            groupedRecords[propertyCode] = sortRecords(propertyRecords, propertyCode);
        }
        
        setRecordsByProperty(groupedRecords);
        setIsLoading(false);
    }, [db, user, queryDate, selectedProperties]);

    useEffect(() => {
        if (user && db) {
            fetchRecords();
        }
    }, [user, db, queryDate, selectedProperties, fetchRecords]);

    // Initiales Laden der verfügbaren Daten
    useEffect(() => {
        const loadInitialDates = async () => {
            if (!db || !user) return;
            
            const recordsPath = `propertyManagement/${db.app.options.appId}/users/${user.uid}/tenantRecords`;
            const recordsRef = collection(db, recordsPath);
            const allRecordsQuery = query(recordsRef);
            const allRecordsSnapshot = await getDocs(allRecordsQuery);
            const uniqueDates = new Set<string>();
            
            allRecordsSnapshot.forEach(doc => {
                const record = { id: doc.id, ...(doc.data() as Omit<TenantRecord, 'id'>) };
                const dateStr = record.effectiveDate.toDate().toISOString().split('T')[0];
                uniqueDates.add(dateStr);
            });
            
            const sortedDates = Array.from(uniqueDates).sort((a, b) => b.localeCompare(a)); // Neueste zuerst
            setAvailableDates(sortedDates);
            
            // Setze das Datum auf das neueste verfügbare, wenn es noch nicht gesetzt ist
            if (sortedDates.length > 0 && !sortedDates.includes(queryDate)) {
                setQueryDate(sortedDates[0]);
            }
        };
        
        if (user && db) {
            loadInitialDates();
        }
    }, [user, db]); // Nur beim ersten Laden

    const handleGoogleSignIn = async () => {
        if (!auth) return;
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider).catch(err => console.error(err));
    };

    const handleSignOut = async () => {
        if (!auth) return;
        await signOut(auth);
    };
    
    const handleAddNew = () => {
        setRecordToUpdate(undefined);
        setIsTenantChangeMode(false);
        setShowImporter(false);
        setShowAddForm(true);
    };

    const handleShowUpdateForm = (record: TenantRecord) => {
        setRecordToUpdate(record);
        setIsTenantChangeMode(false);
        setShowAddForm(true);
    };

    const handleShowTenantChangeForm = (record: TenantRecord) => {
        setRecordToUpdate(record);
        setIsTenantChangeMode(true);
        setShowAddForm(true);
    };

    const handleImportSuccess = (importedDate: string) => {
        setQueryDate(importedDate);
        setShowImporter(false);
    };

    // Handler für Objektauswahl
    const handlePropertyToggle = (propertyCode: string) => {
        setSelectedProperties(prev => {
            if (prev.includes(propertyCode)) {
                return prev.filter(p => p !== propertyCode);
            } else {
                return [...prev, propertyCode];
            }
        });
    };

    const handleSelectAllProperties = () => {
        setSelectedProperties(['TRI', 'TRI-P', 'PAS', 'RITA']);
    };

    const handleDeselectAllProperties = () => {
        setSelectedProperties([]);
    };

    // Löschfunktionen
    const handleShowDeleteModal = (record: TenantRecord) => {
        setRecordToDelete(record);
        setDeleteRelatedParkingRecords(false);
        setShowDeleteModal(true);
        // Wenn aus der RecordForm heraus gelöscht wird, Form schließen
        if (showAddForm) {
            setShowAddForm(false);
        }
    };

    const handleCancelDelete = () => {
        setShowDeleteModal(false);
        setRecordToDelete(undefined);
        setDeleteRelatedParkingRecords(false);
    };

    const handleConfirmDelete = async () => {
        if (!db || !user || !recordToDelete) return;

        try {
            const recordsPath = `propertyManagement/${db.app.options.appId}/users/${user.uid}/tenantRecords`;
            const recordsRef = collection(db, recordsPath);
            
            // Batch für atomare Löschung
            const batch = writeBatch(db);
            
            // Hauptdatensatz löschen
            const mainRecordRef = doc(recordsRef, recordToDelete.id);
            batch.delete(mainRecordRef);
            
            // Prüfe auf verbundene Parkplatz-Datensätze, wenn gewünscht
            if (deleteRelatedParkingRecords) {
                // Finde alle Parkplatz-Datensätze mit matching Stellplätzen
                const allRecords = Object.values(recordsByProperty).flat();
                const parkingRecordsToDelete = allRecords.filter(record => {
                    // Nur Parkplatz-Datensätze betrachten
                    if (!isParkingRecord(record)) return false;
                    
                    // Prüfe ob einer der Stellplätze des zu löschenden Datensatzes in diesem Parkplatz-Datensatz vorkommt
                    const stellplaetzeToCheck = [
                        recordToDelete.data.details?.stellplatz1,
                        recordToDelete.data.details?.stellplatz2,
                        recordToDelete.data.details?.stellplatz3,
                        recordToDelete.data.details?.stellplatz4
                    ].filter(Boolean);
                    
                    const parkingStellplaetze = [
                        record.data.details?.stellplatz1,
                        record.data.details?.stellplatz2,
                        record.data.details?.stellplatz3,
                        record.data.details?.stellplatz4
                    ].filter(Boolean);
                    
                    // Wenn einer der Stellplätze übereinstimmt, ist es ein verbundener Datensatz
                    return stellplaetzeToCheck.some(stellplatz => parkingStellplaetze.includes(stellplatz));
                });
                
                // Lösche verbundene Parkplatz-Datensätze
                parkingRecordsToDelete.forEach(parkingRecord => {
                    const parkingRecordRef = doc(recordsRef, parkingRecord.id);
                    batch.delete(parkingRecordRef);
                });
            }
            
            // Führe alle Löschungen aus
            await batch.commit();
            
            // Daten neu laden
            await fetchRecords();
            
            // Modal schließen
            handleCancelDelete();
            
        } catch (error) {
            console.error('Fehler beim Löschen des Datensatzes:', error);
            alert('Fehler beim Löschen des Datensatzes. Bitte versuchen Sie es erneut.');
        }
    };

    // NEU: Speichern-Callback für RecordForm
    const handleSaveRecord = async (formData: any) => {
        if (!db || !user) return;
        
        // Hilfsfunktion für deutsche Zahlenformatierung
        const parseGermanNumber = (value: string): number => {
            if (!value) return 0;
            const cleaned = value.replace(/\./g, "").replace(",", ".");
            return parseFloat(cleaned) || 0;
        };
        
        // Datenstruktur für Firestore aufbauen
        const details = {
            area: parseGermanNumber(formData.formArea),
            houseNumber: formData.formHouseNumber || '',
            location: formData.formPosition || '',
            persons: parseInt(formData.formPersons) || 0,
            stellplatz1: formData.formStellplatz1 || '',
            stellplatz2: formData.formStellplatz2 || '',
            stellplatz3: formData.formStellplatz3 || '',
            stellplatz4: formData.formStellplatz4 || '',
        };
        const tenants = {
            tenant1: {
                name: `${formData.tenant1Salutation} ${formData.tenant1FirstName} ${formData.tenant1LastName}`.trim(),
                phone: formData.tenant1Phone || '',
                email: formData.tenant1Email || '',
            },
            tenant2: formData.tenant2FirstName || formData.tenant2LastName ? {
                name: `${formData.tenant2Salutation} ${formData.tenant2FirstName} ${formData.tenant2LastName}`.trim(),
                phone: formData.tenant2Phone || '',
                email: formData.tenant2Email || '',
            } : undefined,
        };
        const contract = {
            contractDate: formData.formContractDate || '',
            moveInDate: formData.formMoveInDate || '',
            terminationDate: formData.formTerminationDate || '',
            contractEndDate: formData.formContractEndDate || '',
            kautionHoehe: parseGermanNumber(formData.formKautionHoehe),
            kautionszahlungen: (formData.formKautionszahlungen || []).map((z: any) => ({
                betrag: parseGermanNumber(z.betrag),
                datum: z.datum || '',
            })),
        };
        const payment = {
            iban: formData.formIban || '',
            directDebitMandateDate: formData.formDirectDebitMandateDate || '',
            mandateReference: formData.formMandateReference || '',
        };
        const rent = {
            base: parseGermanNumber(formData.formRentBase),
            utilities: parseGermanNumber(formData.formRentUtilities),
            heating: parseGermanNumber(formData.formRentHeating),
            parking: parseGermanNumber(formData.formRentParking),
            total: parseGermanNumber(formData.formRentBase) + parseGermanNumber(formData.formRentUtilities) + parseGermanNumber(formData.formRentHeating) + parseGermanNumber(formData.formRentParking),
        };
        const meterReadings = {
            wasserzaehlerNrDigital: formData.formWasserzaehlerNrDigital || '',
            wasserzaehlerStandDigital: parseGermanNumber(formData.formWasserzaehlerStandDigital),
            wasserzaehlerNrAnalog: formData.formWasserzaehlerNrAnalog || '',
            wasserzaehlerStandAnalog: parseGermanNumber(formData.formWasserzaehlerStandAnalog),
            heizungNr: formData.formHeizungNr || '',
            heizungStand: parseGermanNumber(formData.formHeizungStand),
            stromNr: formData.formStromNr || '',
            stromStand: parseGermanNumber(formData.formStromStand),
        };
        const notes = formData.formNotes || '';
        const fullRecordData = { details, tenants, contract, payment, rent, meterReadings, notes };
        const recordsPath = `propertyManagement/${db.app.options.appId}/users/${user.uid}/tenantRecords`;
        const recordsRef = collection(db, recordsPath);
        const effectiveDate = formData.formEffectiveDate ? Timestamp.fromDate(new Date(formData.formEffectiveDate)) : Timestamp.now();
        const newRecord = {
            propertyCode: formData.selectedProperty || 'TRI',
            apartmentId: formData.formApartmentId,
            effectiveDate,
            data: fullRecordData,
        };
        await addDoc(recordsRef, newRecord);
        await fetchRecords();
    };

    // Sortier-Logik für Tabellenköpfe
    const [sortConfig, setSortConfig] = useState<{ [key: string]: { key: string; direction: 'asc' | 'desc' } }>({});
    const handleSort = (propertyCode: string, key: string) => {
        setSortConfig(prev => {
            const prevConfig = prev[propertyCode];
            if (prevConfig && prevConfig.key === key) {
                // Richtung umdrehen
                return { ...prev, [propertyCode]: { key, direction: prevConfig.direction === 'asc' ? 'desc' : 'asc' } };
            }
            return { ...prev, [propertyCode]: { key, direction: 'asc' } };
        });
    };
    // Hilfsfunktion für Nachnamen-Extraktion
    function getLastName(name: string): string {
        if (!name) return '';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        return parts[parts.length - 1];
    }
    // Hilfsfunktion für verschachtelte Felder
    function getNestedValue(obj: any, path: string): any {
        // Spezialfall: tenants.tenant1.name -> Nachname für Sortierung
        if (path === 'tenants.tenant1.name') {
            const name = obj?.data?.tenants?.tenant1?.name || '';
            return getLastName(name).toLowerCase();
        }
        // Standard: verschachtelte Felder
        return path.split('.').reduce((acc, part) => acc && acc[part], obj?.data ?? obj);
    }

    // Hilfsfunktion um zu erkennen, ob ein Datensatz ein Parkplatz ist
    function isParkingRecord(record: TenantRecord): boolean {
        return record.apartmentId.startsWith('P') || record.propertyCode.endsWith('-P');
    }
    
    // Funktion zur Berechnung der freien Parkplätze für TRI-P
    const calculateFreeParkingSpaces = (records: TenantRecord[]): number => {
        const totalParkingSpaces = 19; // Gesamtanzahl der Parkplätze
        
        // Zähle alle belegten Stellplätze aus allen Parkplatz-Datensätzen
        const occupiedSpaces = records.reduce((count, record) => {
            if (isParkingRecord(record)) {
                // Zähle alle ausgefüllten Stellplatz-Felder
                const stellplaetze = [
                    record.data.details?.stellplatz1,
                    record.data.details?.stellplatz2,
                    record.data.details?.stellplatz3,
                    record.data.details?.stellplatz4
                ].filter(stellplatz => stellplatz && stellplatz.toString().trim() !== '');
                
                return count + stellplaetze.length;
            }
            return count;
        }, 0);
        
        return Math.max(0, totalParkingSpaces - occupiedSpaces);
    };

    // Hilfsfunktion zur Formatierung der Wohnungs-ID für Triftstraße und Pasewalker Str.
    const formatApartmentId = (apartmentId: string, propertyCode: string): string => {
        if ((propertyCode === 'TRI' || propertyCode === 'PAS') && /^[0-9]+$/.test(apartmentId)) {
            // Numerische IDs für TRI und PAS werden zu WE formatiert
            return `WE${apartmentId.padStart(2, '0')}`;
        }
        return apartmentId;
    };

    // Hilfsfunktion zur Berechnung der offenen Kaution
    const calculateOpenDeposit = (record: TenantRecord): number => {
        const kautionHoehe = record.data.contract?.kautionHoehe || 0;
        const kautionszahlungen = record.data.contract?.kautionszahlungen || [];
        
        const gezahlt = kautionszahlungen.reduce((sum, zahlung) => {
            return sum + (zahlung.betrag || 0);
        }, 0);
        
        return Math.max(0, kautionHoehe - gezahlt);
    };

    // Hilfsfunktion für Vor- und Nachname-Extraktion
    const extractName = (fullName: string): { firstName: string; lastName: string } => {
        if (!fullName) return { firstName: '', lastName: '' };
        const parts = fullName.trim().split(/\s+/);
        
        if (parts.length === 1) {
            return { firstName: parts[0], lastName: '' };
        } else if (parts.length === 2) {
            return { firstName: parts[0], lastName: parts[1] };
        } else if (parts.length > 2) {
            return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
        }
        
        return { firstName: '', lastName: '' };
    };

    // Sortierfunktion für Records
    const getSortedRecords = (propertyCode: string, records: TenantRecord[]) => {
        const config = sortConfig[propertyCode];
        let sorted = [...records];
        
        // Spezielle Sortierung für TRI, PAS und RITA: Datensätze mit offener Kaution nach unten
        if (propertyCode === 'TRI' || propertyCode === 'PAS' || propertyCode === 'RITA') {
            sorted = sorted.sort((a, b) => {
                const openDepositA = calculateOpenDeposit(a);
                const openDepositB = calculateOpenDeposit(b);
                const isEndedA = a.data.contract?.contractEndDate && new Date(a.data.contract.contractEndDate) < new Date();
                const isEndedB = b.data.contract?.contractEndDate && new Date(b.data.contract.contractEndDate) < new Date();
                
                // Erste Priorität: Beendete Verträge mit offener Kaution nach ganz unten
                if (isEndedA && openDepositA > 0 && (!isEndedB || openDepositB === 0)) return 1;
                if (isEndedB && openDepositB > 0 && (!isEndedA || openDepositA === 0)) return -1;
                
                // Zweite Priorität: Aktive Verträge mit offener Kaution nach unten
                if (!isEndedA && openDepositA > 0 && !isEndedB && openDepositB === 0) return 1;
                if (!isEndedB && openDepositB > 0 && !isEndedA && openDepositA === 0) return -1;
                
                // Standard-Sortierung nach Hausnummer (nur bei TRI)
                if (propertyCode === 'TRI') {
                    const houseA = parseInt(a.data.details?.houseNumber || '0');
                    const houseB = parseInt(b.data.details?.houseNumber || '0');
                    return houseA - houseB;
                }
                
                // Standard-Sortierung nach apartmentId bei PAS und RITA
                return a.apartmentId.localeCompare(b.apartmentId);
            });
        }
        
        if (config) {
            sorted.sort((a, b) => {
                // Spezialfall: apartmentId numerisch (z.B. P1-P19, WE01, 1a, ...)
                if (config.key === 'apartmentId') {
                    const getNum = (id: string) => {
                        const match = id.match(/P(\d+)/i);
                        if (match) return parseInt(match[1], 10);
                        const num = parseInt(id.replace(/\D/g, ''));
                        return isNaN(num) ? id : num;
                    };
                    const valA = getNum(a.apartmentId);
                    const valB = getNum(b.apartmentId);
                    if (typeof valA === 'number' && typeof valB === 'number') {
                        return config.direction === 'asc' ? valA - valB : valB - valA;
                    }
                    return config.direction === 'asc'
                        ? String(valA).localeCompare(String(valB))
                        : String(valB).localeCompare(String(valA));
                }
                // Standard: alle anderen Felder
                const valA = getNestedValue(a, config.key);
                const valB = getNestedValue(b, config.key);
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return config.direction === 'asc' ? valA - valB : valB - valA;
                }
                return config.direction === 'asc'
                    ? String(valA || '').localeCompare(String(valB || ''))
                    : String(valB || '').localeCompare(String(valA || ''));
            });
        }
        return sorted;
    };

    if (!auth || !db) {
        return <div className="text-center p-10">Dienste werden initialisiert...</div>;
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="p-10 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl text-center">
                    <h1 className="text-2xl font-bold mb-4 text-white">Bitte anmelden</h1>
                    <button onClick={handleGoogleSignIn} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">Mit Google anmelden</button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 sm:p-6">
            <header className="mb-8 p-6 bg-gray-800 border border-gray-700 rounded-xl shadow-lg flex justify-between items-center">
                <h1 className="text-3xl font-bold text-white">Immobilienverwaltung</h1>
                <div>
                    <p className="text-right text-gray-400">{user.email}</p>
                    <button onClick={handleSignOut} className="text-sm text-blue-400 hover:underline font-semibold">Abmelden</button>
                </div>
            </header>
            
            {showAddForm ? (
                <RecordForm
                    selectedProperty={'TRI'}
                    onCancel={() => setShowAddForm(false)}
                    recordToUpdate={recordToUpdate}
                    isTenantChangeMode={isTenantChangeMode}
                    onSave={handleSaveRecord}
                    onDelete={handleShowDeleteModal}
                />
            ) : showImporter ? (
                <SheetImporter db={db} userId={user.uid} appId={db.app.options.appId!} onImportComplete={handleImportSuccess} />
            ) : (
                <>
                    <div className="mb-6 p-6 bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                            {/* Objekt-Auswahlmenü */}
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                <div className="relative">
                                    <label className="font-semibold text-gray-300 mr-2">Objekte:</label>
                                    <button
                                        onClick={() => setShowPropertyDropdown(!showPropertyDropdown)}
                                        className="p-2 border border-gray-600 bg-gray-700 text-white rounded-md shadow-sm min-w-[200px] text-left flex justify-between items-center"
                                    >
                                        <span>
                                            {selectedProperties.length === 0 
                                                ? 'Keine Objekte ausgewählt'
                                                : selectedProperties.length === 4
                                                ? 'Alle Objekte'
                                                : `${selectedProperties.length} Objekt${selectedProperties.length > 1 ? 'e' : ''} ausgewählt`
                                            }
                                        </span>
                                        <span className="ml-2">▼</span>
                                    </button>
                                    
                                    {showPropertyDropdown && (
                                        <div className="absolute top-full left-0 mt-1 w-full bg-gray-700 border border-gray-600 rounded-md shadow-lg z-50">
                                            <div className="p-2 border-b border-gray-600">
                                                <button
                                                    onClick={handleSelectAllProperties}
                                                    className="text-sm text-blue-400 hover:text-blue-300 mr-3"
                                                >
                                                    Alle auswählen
                                                </button>
                                                <button
                                                    onClick={handleDeselectAllProperties}
                                                    className="text-sm text-red-400 hover:text-red-300"
                                                >
                                                    Alle abwählen
                                                </button>
                                            </div>
                                            {Object.entries(PROPERTY_CODES).map(([code, info]) => (
                                                <label key={code} className="flex items-center p-2 hover:bg-gray-600 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedProperties.includes(code)}
                                                        onChange={() => handlePropertyToggle(code)}
                                                        className="mr-2 rounded border-gray-500 bg-gray-600 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-white">{info.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Datums-Auswahlmenü */}
                                <div>
                                    <label className="font-semibold text-gray-300 mr-2">Datenstand vom:</label>
                                    <select
                                        value={queryDate}
                                        onChange={e => setQueryDate(e.target.value)}
                                        className="p-2 border border-gray-600 bg-gray-700 text-white rounded-md shadow-sm"
                                    >
                                        {availableDates.map(date => {
                                            const dateObj = new Date(date);
                                            const formattedDate = dateObj.toLocaleDateString('de-DE', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit'
                                            });
                                            return (
                                                <option key={date} value={date}>
                                                    {formattedDate}
                                                </option>
                                            );
                                        })}
                                        {!availableDates.includes(queryDate) && (
                                            <option value={queryDate}>
                                                {new Date(queryDate).toLocaleDateString('de-DE', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit'
                                                })}
                                            </option>
                                        )}
                                    </select>
                                </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-4">
                                <button onClick={handleAddNew} className="btn btn-success">Neuen Datensatz</button>
                                <button onClick={() => setShowImporter(true)} className="btn btn-special">Daten importieren</button>
                            </div>
                        </div>
                    </div>

                    {/* Click-Handler um Dropdown zu schließen */}
                    {showPropertyDropdown && (
                        <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setShowPropertyDropdown(false)}
                        />
                    )}

                    {isLoading ? <p className="text-center p-10">Lade Daten...</p> : (
                        <div className="space-y-8">
                            {selectedProperties.filter(propertyCode => recordsByProperty[propertyCode] && recordsByProperty[propertyCode].length > 0).map(propertyCode => (
                                <div key={propertyCode} className="p-4 sm:p-6 bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
                                    <h2 className="block-title">
                                        {PROPERTY_CODES[propertyCode as keyof typeof PROPERTY_CODES].name}
                                        {propertyCode === 'TRI-P' && (
                                            <span className="text-sm text-gray-400 ml-2">
                                                (freie Parkplätze: {calculateFreeParkingSpaces(recordsByProperty[propertyCode]).toString()})
                                            </span>
                                        )}
                                    </h2>
<div className="overflow-x-auto bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
    <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-700">
            <tr>
                {/* Gemeinsame Spalten für alle */}
                {PROPERTY_CODES[propertyCode as keyof typeof PROPERTY_CODES].hasHouseNumbers && <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.houseNumber')}>Hausnr.</th>}
                <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'apartmentId')}>Wohnung</th>
                
                {/* Spezifische Spalten je nach Typ */}
                {propertyCode.endsWith('-P') ? (
                    // Parkplatz-spezifische Spalten
                    <>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant1.name')}>Mieter</th>
                        <th className="th-style">Stellplatz 1</th>
                        <th className="th-style">Stellplatz 2</th>
                        <th className="th-style">Stellplatz 3</th>
                        <th className="th-style">Stellplatz 4</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.parking')}>Stellplatzmiete</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.total')}>Gesamtmiete</th>
                    </>
                ) : propertyCode === 'TRI' ? (
                    // Triftstraße-spezifische Spalten
                    <>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.location')}>Lage</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant1.name')}>Mieter 1</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant2.name')}>Mieter 2</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'details.area')}>Fläche</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.utilities')}>Nebenkosten</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.heating')}>Heizkosten</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.baseAndUtilities')}>Gesamtmiete</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.stellplatz1')}>Stellplätze</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'contract.kautionOffen')}>Kaution</th>
                    </>
                ) : propertyCode === 'PAS' ? (
                    // Pasewalker-spezifische Spalten (ohne Hausnummer und Stellplätze)
                    <>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.location')}>Lage</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant1.name')}>Mieter 1</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant2.name')}>Mieter 2</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'details.area')}>Fläche</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.utilities')}>Nebenkosten</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.heating')}>Heizkosten</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.baseAndUtilities')}>Gesamtmiete</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'contract.kautionOffen')}>Kaution</th>
                    </>
                ) : propertyCode === 'RITA' ? (
                    // Rosenthaler-spezifische Spalten (ohne Hausnummer, Stellplätze und Mieter 2)
                    <>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.location')}>Lage</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant1.name')}>Mieter 1</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'details.area')}>Fläche</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.utilities')}>Nebenkosten</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.heating')}>Heizkosten</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.baseAndUtilities')}>Gesamtmiete</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'contract.kautionOffen')}>Kaution</th>
                    </>
                ) : (
                    // Standard Wohnungs-spezifische Spalten (Fallback)
                    <>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.location')}>Lage</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant1.name')}>Mieter 1</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'details.area')}>Fläche</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.total')}>Gesamtmiete</th>
                        <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.stellplatz1')}>Stellplätze</th>
                        <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'contract.kautionszahlungen')}>Kaution</th>
                    </>
                )}
                <th className="th-style text-center">Aktionen</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
            {getSortedRecords(propertyCode, recordsByProperty[propertyCode]).map(record => {
                const area = record.data?.details?.area;
                const totalRent = record.data?.rent?.total;
                const parkingRent = record.data?.rent?.parking;
                const isParking = isParkingRecord(record);
                
                return (
                    <tr key={record.id} className="hover:bg-gray-700/50">
                        {/* Gemeinsame Spalten */}
                        {PROPERTY_CODES[propertyCode as keyof typeof PROPERTY_CODES].hasHouseNumbers && <td className="td-style">{record.data.details?.houseNumber || '-'}</td>}
                        <td className="td-style font-medium text-white">{formatApartmentId(record.apartmentId, propertyCode)}</td>
                        
                        {/* Spezifische Spalten je nach Typ */}
                        {isParking ? (
                            // Parkplatz-Zeile
                            <>
                                <td className="td-style">{
                                    (() => {
                                        const t1 = record.data.tenants?.tenant1;
                                        if (!t1) return 'N/A';
                                        const { firstName, lastName } = extractName(t1.name || '');
                                        return `${firstName} ${lastName}`.trim();
                                    })()
                                }</td>
                                <td className="td-style text-gray-400">{record.data.details?.stellplatz1 || '-'}</td>
                                <td className="td-style text-gray-400">{record.data.details?.stellplatz2 || '-'}</td>
                                <td className="td-style text-gray-400">{record.data.details?.stellplatz3 || '-'}</td>
                                <td className="td-style text-gray-400">{record.data.details?.stellplatz4 || '-'}</td>
                                <td className="td-style text-right font-semibold text-blue-400">
                                    {typeof parkingRent === 'number' ? `${parkingRent.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-right font-semibold">
                                    {typeof totalRent === 'number' ? `${totalRent.toFixed(2)} €` : '-'}
                                </td>
                            </>
                        ) : propertyCode === 'TRI' ? (
                            // Triftstraße-spezifische Spalten
                            <>
                                <td className="td-style text-gray-400">{record.data.details?.location || '-'}</td>
                                <td className="td-style">{
                                    (() => {
                                        const t1 = record.data.tenants?.tenant1;
                                        if (!t1) return '-';
                                        const { firstName, lastName } = extractName(t1.name || '');
                                        return `${firstName} ${lastName}`.trim() || '-';
                                    })()
                                }</td>
                                <td className="td-style">{
                                    (() => {
                                        const t2 = record.data.tenants?.tenant2;
                                        if (!t2) return '-';
                                        const { firstName, lastName } = extractName(t2.name || '');
                                        return `${firstName} ${lastName}`.trim() || '-';
                                    })()
                                }</td>
                                <td className="td-style text-right">
                                    {typeof area === 'number' ? `${area.toFixed(2)} m²` : '-'}
                                </td>
                                <td className="td-style text-right">
                                    {typeof record.data.rent?.utilities === 'number' ? `${record.data.rent.utilities.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-right">
                                    {typeof record.data.rent?.heating === 'number' ? `${record.data.rent.heating.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-right font-semibold">
                                    {(() => {
                                        const base = record.data.rent?.base || 0;
                                        const utilities = record.data.rent?.utilities || 0;
                                        const heating = record.data.rent?.heating || 0;
                                        const gesamtOhneStellplatz = base + utilities + heating;
                                        return gesamtOhneStellplatz > 0 ? `${gesamtOhneStellplatz.toFixed(2)} €` : '-';
                                    })()
                                }</td>
                                <td className="td-style text-gray-400">
                                    {[record.data.details?.stellplatz1, record.data.details?.stellplatz2, record.data.details?.stellplatz3, record.data.details?.stellplatz4].filter(Boolean).join(', ') || '-'}
                                </td>
                                <td className="td-style text-right">
                                    {(() => {
                                        const openDeposit = calculateOpenDeposit(record);
                                        const isContractEnded = record.data.contract?.contractEndDate && new Date(record.data.contract.contractEndDate) < new Date();
                                        
                                        if (openDeposit > 0) {
                                            const className = isContractEnded ? "text-red-600 font-bold" : "";
                                            return <span className={className}>{openDeposit.toFixed(2)} €</span>;
                                        }
                                        return '-';
                                    })()
                                }</td>
                            </>
                        ) : propertyCode === 'PAS' ? (
                            // Pasewalker-spezifische Spalten (ohne Hausnummer und Stellplätze)
                            <>
                                <td className="td-style text-gray-400">{record.data.details?.location || '-'}</td>
                                <td className="td-style">{
                                    (() => {
                                        const t1 = record.data.tenants?.tenant1;
                                        if (!t1) return '-';
                                        const { firstName, lastName } = extractName(t1.name || '');
                                        return `${firstName} ${lastName}`.trim() || '-';
                                    })()
                                }</td>
                                <td className="td-style">{
                                    (() => {
                                        const t2 = record.data.tenants?.tenant2;
                                        if (!t2) return '-';
                                        const { firstName, lastName } = extractName(t2.name || '');
                                        return `${firstName} ${lastName}`.trim() || '-';
                                    })()
                                }</td>
                                <td className="td-style text-right">
                                    {typeof area === 'number' ? `${area.toFixed(2)} m²` : '-'}
                                </td>
                                <td className="td-style text-right">
                                    {typeof record.data.rent?.utilities === 'number' ? `${record.data.rent.utilities.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-right">
                                    {typeof record.data.rent?.heating === 'number' ? `${record.data.rent.heating.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-right font-semibold">
                                    {(() => {
                                        const base = record.data.rent?.base || 0;
                                        const utilities = record.data.rent?.utilities || 0;
                                        const heating = record.data.rent?.heating || 0;
                                        const gesamtOhneStellplatz = base + utilities + heating;
                                        return gesamtOhneStellplatz > 0 ? `${gesamtOhneStellplatz.toFixed(2)} €` : '-';
                                    })()
                                }</td>
                                <td className="td-style text-right">{
                                    (() => {
                                        const openDeposit = calculateOpenDeposit(record);
                                        const isContractEnded = record.data.contract?.contractEndDate && new Date(record.data.contract.contractEndDate) < new Date();
                                        
                                        if (openDeposit > 0) {
                                            return (
                                                <span className={isContractEnded ? "text-red-600 font-bold" : ""}>
                                                    {openDeposit.toFixed(2)} €
                                                </span>
                                            );
                                        }
                                        return '-';
                                    })()
                                }</td>
                            </>
                        ) : propertyCode === 'RITA' ? (
                            // Rosenthaler-spezifische Spalten (ohne Hausnummer, Stellplätze und Mieter 2)
                            <>
                                <td className="td-style text-gray-400">{record.data.details?.location || '-'}</td>
                                <td className="td-style">{
                                    (() => {
                                        const t1 = record.data.tenants?.tenant1;
                                        if (!t1) return '-';
                                        const { firstName, lastName } = extractName(t1.name || '');
                                        return `${firstName} ${lastName}`.trim() || '-';
                                    })()
                                }</td>
                                <td className="td-style text-right">
                                    {typeof area === 'number' ? `${area.toFixed(2)} m²` : '-'}
                                </td>
                                <td className="td-style text-right">
                                    {typeof record.data.rent?.utilities === 'number' ? `${record.data.rent.utilities.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-right">
                                    {typeof record.data.rent?.heating === 'number' ? `${record.data.rent.heating.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-right font-semibold">
                                    {(() => {
                                        const base = record.data.rent?.base || 0;
                                        const utilities = record.data.rent?.utilities || 0;
                                        const heating = record.data.rent?.heating || 0;
                                        const gesamtOhneStellplatz = base + utilities + heating;
                                        return gesamtOhneStellplatz > 0 ? `${gesamtOhneStellplatz.toFixed(2)} €` : '-';
                                    })()
                                }</td>
                                <td className="td-style text-right">{
                                    (() => {
                                        const openDeposit = calculateOpenDeposit(record);
                                        const isContractEnded = record.data.contract?.contractEndDate && new Date(record.data.contract.contractEndDate) < new Date();
                                        
                                        if (openDeposit > 0) {
                                            return (
                                                <span className={isContractEnded ? "text-red-600 font-bold" : ""}>
                                                    {openDeposit.toFixed(2)} €
                                                </span>
                                            );
                                        }
                                        return '-';
                                    })()
                                }</td>
                            </>
                        ) : (
                            // Standard Wohnungs-Zeile (Fallback)
                            <>
                                <td className="td-style text-gray-400">{record.data.details?.location || '-'}</td>
                                <td className="td-style">{
                                    (() => {
                                        const t1 = record.data.tenants?.tenant1;
                                        if (!t1) return 'N/A';
                                        const { firstName, lastName } = extractName(t1.name || '');
                                        return `${firstName} ${lastName}`.trim();
                                    })()
                                }</td>
                                <td className="td-style text-right">
                                    {typeof area === 'number' ? `${area.toFixed(2)} m²` : '-'}
                                </td>
                                <td className="td-style text-right font-semibold">
                                    {typeof totalRent === 'number' ? `${totalRent.toFixed(2)} €` : '-'}
                                </td>
                                <td className="td-style text-gray-400">
                                    {[record.data.details?.stellplatz1, record.data.details?.stellplatz2, record.data.details?.stellplatz3].filter(Boolean).join(', ') || '-'}
                                </td>
                                <td className="td-style text-right">{
                                    (() => {
                                        const kz = record.data.contract?.kautionszahlungen;
                                        if (Array.isArray(kz) && kz.length > 0) {
                                            const sum = kz.reduce((s, z) => {
                                                if (typeof z === "object" && z !== null) {
                                                    return s + (parseFloat(String(z.betrag)) || 0);
                                                }
                                                if (typeof z === "number" || typeof z === "string") {
                                                    return s + (parseFloat(z as string) || 0);
                                                }
                                                return s;
                                            }, 0);
                                            return `${sum.toFixed(2)} € (${kz.length} Rate${kz.length > 1 ? 'n' : ''})`;
                                        }
                                        return '-';
                                    })()
                                }</td>
                            </>
                        )}
                        <td className="td-style text-center space-x-2">
                            <button onClick={() => handleShowUpdateForm(record)} className="btn btn-edit">Details</button>
                            <button onClick={() => handleShowTenantChangeForm(record)} className="btn btn-primary">Mieterwechsel</button>
                            <button onClick={() => handleShowDeleteModal(record)} className="btn btn-danger">Löschen</button>
                        </td>
                    </tr>
                );
            })}
        </tbody>
    </table>
</div>
                                </div>
                                )
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Lösch-Modal */}
            {showDeleteModal && recordToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Datensatz löschen</h2>
                        
                        <div className="mb-4">
                            <p className="text-gray-300 mb-2">
                                Möchten Sie den folgenden Datensatz wirklich löschen?
                            </p>
                            <div className="bg-gray-700 p-3 rounded border">
                                <p className="text-white font-semibold">
                                    {PROPERTY_CODES[recordToDelete.propertyCode]?.name} - {formatApartmentId(recordToDelete.apartmentId, recordToDelete.propertyCode)}
                                </p>
                                <p className="text-gray-400">
                                    {recordToDelete.data.tenants?.tenant1?.name || 'Kein Mieter'}
                                </p>
                            </div>
                        </div>

                        {/* Checkbox für verbundene Parkplatz-Datensätze */}
                        {(() => {
                            const hasStellplaetze = [
                                recordToDelete.data.details?.stellplatz1,
                                recordToDelete.data.details?.stellplatz2,
                                recordToDelete.data.details?.stellplatz3,
                                recordToDelete.data.details?.stellplatz4
                            ].some(Boolean);
                            
                            if (hasStellplaetze) {
                                return (
                                    <div className="mb-6">
                                        <label className="flex items-center space-x-2 text-gray-300">
                                            <input
                                                type="checkbox"
                                                checked={deleteRelatedParkingRecords}
                                                onChange={(e) => setDeleteRelatedParkingRecords(e.target.checked)}
                                                className="rounded border-gray-600 bg-gray-700 text-red-600 focus:ring-red-500 focus:ring-2"
                                            />
                                            <span>Verbundene Parkplatz-Datensätze ebenfalls löschen</span>
                                        </label>
                                        <p className="text-sm text-gray-500 mt-1 ml-6">
                                            Stellplätze: {[
                                                recordToDelete.data.details?.stellplatz1,
                                                recordToDelete.data.details?.stellplatz2,
                                                recordToDelete.data.details?.stellplatz3,
                                                recordToDelete.data.details?.stellplatz4
                                            ].filter(Boolean).join(', ')}
                                        </p>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        <div className="flex space-x-3">
                            <button
                                onClick={handleCancelDelete}
                                className="btn btn-primary flex-1"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="btn btn-danger flex-1"
                            >
                                Löschen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;