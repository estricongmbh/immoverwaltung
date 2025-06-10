import { useState, useEffect, useCallback } from 'react';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, Timestamp, addDoc } from 'firebase/firestore';
import { RecordForm } from './RecordForm';
import { SheetImporter } from './SheetImporter';

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
    }, [db, user, queryDate]);

    useEffect(() => {
        if (user && db) {
            fetchRecords();
        }
    }, [user, db, queryDate, fetchRecords]);

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

    // NEU: Speichern-Callback für RecordForm
    const handleSaveRecord = async (formData: any) => {
        if (!db || !user) return;
        // Datenstruktur für Firestore aufbauen
        const details = {
            area: parseFloat(formData.formArea) || 0,
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
            kautionHoehe: parseFloat(formData.formKautionHoehe) || 0,
            kautionszahlungen: (formData.formKautionszahlungen || []).map((z: any) => ({
                betrag: parseFloat(z.betrag) || 0,
                datum: z.datum || '',
            })),
        };
        const payment = {
            iban: formData.formIban || '',
            directDebitMandateDate: formData.formDirectDebitMandateDate || '',
            mandateReference: formData.formMandateReference || '',
        };
        const rent = {
            base: parseFloat(formData.formRentBase) || 0,
            utilities: parseFloat(formData.formRentUtilities) || 0,
            heating: parseFloat(formData.formRentHeating) || 0,
            parking: parseFloat(formData.formRentParking) || 0,
            total: (parseFloat(formData.formRentBase) || 0) + (parseFloat(formData.formRentUtilities) || 0) + (parseFloat(formData.formRentHeating) || 0) + (parseFloat(formData.formRentParking) || 0),
        };
        const meterReadings = {
            wasserzaehlerNrDigital: formData.formWasserzaehlerNrDigital || '',
            wasserzaehlerStandDigital: parseFloat(formData.formWasserzaehlerStandDigital) || 0,
            wasserzaehlerNrAnalog: formData.formWasserzaehlerNrAnalog || '',
            wasserzaehlerStandAnalog: parseFloat(formData.formWasserzaehlerStandAnalog) || 0,
            heizungNr: formData.formHeizungNr || '',
            heizungStand: parseFloat(formData.formHeizungStand) || 0,
            stromNr: formData.formStromNr || '',
            stromStand: parseFloat(formData.formStromStand) || 0,
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
    // Sortierfunktion für Records
    const getSortedRecords = (propertyCode: string, records: TenantRecord[]) => {
        const config = sortConfig[propertyCode];
        let sorted = [...records];
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
                />
            ) : showImporter ? (
                <SheetImporter db={db} userId={user.uid} appId={db.app.options.appId!} onImportComplete={handleImportSuccess} />
            ) : (
                <>
                    <div className="mb-6 p-6 bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div>
                                <label className="font-semibold text-gray-300 mr-2">Datenstand vom:</label>
                                <input type="date" value={queryDate} onChange={e => setQueryDate(e.target.value)} className="p-2 border border-gray-600 bg-gray-700 text-white rounded-md shadow-sm"/>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={handleAddNew} className="btn btn-success">Neuen Datensatz</button>
                                <button onClick={() => setShowImporter(true)} className="btn btn-special">Daten importieren</button>
                            </div>
                        </div>
                    </div>

                    {isLoading ? <p className="text-center p-10">Lade Daten...</p> : (
                        <div className="space-y-8">
                            {['TRI', 'TRI-P', 'PAS', 'RITA'].map(propertyCode => (
                                recordsByProperty[propertyCode] && (
                                <div key={propertyCode} className="p-4 sm:p-6 bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
                                    <h2 className="block-title">
                                        {PROPERTY_CODES[propertyCode as keyof typeof PROPERTY_CODES].name}
                                    </h2>
<div className="overflow-x-auto bg-gray-800 border border-gray-700 rounded-xl shadow-lg">
    <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-700">
            <tr>
                {PROPERTY_CODES[propertyCode as keyof typeof PROPERTY_CODES].hasHouseNumbers && <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.houseNumber')}>Hausnr.</th>}
                <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'apartmentId')}>Wohnung</th>
                <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.location')}>Lage</th>
                <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'tenants.tenant1.name')}>Mieter 1</th>
                <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'details.area')}>Fläche</th>
                <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'rent.total')}>Gesamtmiete</th>
                <th className="th-style cursor-pointer" onClick={() => handleSort(propertyCode, 'details.stellplatz1')}>Stellplätze</th>
                <th className="th-style cursor-pointer text-right" onClick={() => handleSort(propertyCode, 'contract.kautionszahlungen')}>Kaution</th>
                <th className="th-style text-center">Aktionen</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
            {getSortedRecords(propertyCode, recordsByProperty[propertyCode]).map(record => {
                const area = record.data?.details?.area;
                const totalRent = record.data?.rent?.total;
                return (
                    <tr key={record.id} className="hover:bg-gray-700/50">
                        {PROPERTY_CODES[propertyCode as keyof typeof PROPERTY_CODES].hasHouseNumbers && <td className="td-style">{record.data.details?.houseNumber || '-'}</td>}
                        <td className="td-style font-medium text-white">{record.apartmentId}</td>
                        <td className="td-style text-gray-400">{record.data.details?.location || '-'}</td>
                        <td className="td-style">{
  (() => {
    const t1 = record.data.tenants?.tenant1;
    if (!t1) return 'N/A';
    const parts = (t1.name || '').trim().split(/\s+/);
    let firstName = '', lastName = '';
    if (parts.length === 2) {
      firstName = parts[0]; lastName = parts[1];
    } else if (parts.length > 2) {
      firstName = parts.slice(0, -1).join(' '); lastName = parts[parts.length - 1];
    } else if (parts.length === 1) {
      firstName = parts[0]; lastName = '';
    }
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
                    <td className="td-style text-center space-x-2">
    <button onClick={() => handleShowUpdateForm(record)} className="btn btn-edit">Details</button>
    <button onClick={() => handleShowTenantChangeForm(record)} className="btn btn-primary">Mieterwechsel</button>
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
        </div>
    );
}

export default App;