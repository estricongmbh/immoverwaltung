import { useState, useEffect, useRef } from "react";
// import type { Firestore } from "firebase/firestore";
// import { collection, addDoc, Timestamp, writeBatch, doc } from "firebase/firestore";
import type { TenantRecord } from "../App";

interface RecordFormProps {
  // db: Firestore | null;
  // userId: string;
  selectedProperty: string;
  onCancel: () => void;
  recordToUpdate?: TenantRecord;
  isTenantChangeMode: boolean;
  onSave: (formData: any) => Promise<void> | void; // NEU: Callback für das Speichern
  onDelete?: (record: TenantRecord) => void; // NEU: Callback für das Löschen
}

// Deutsche Zahlenformatierung
function formatGermanNumber(value: string | number): string {
  if (!value && value !== 0) return "";
  const num = typeof value === "string" ? parseFloat(value.replace(/\./g, "").replace(",", ".")) : value;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function parseGermanNumber(value: string): number {
  if (!value) return 0;
  
  // Entferne alle Leerzeichen
  let cleaned = value.replace(/\s/g, "");
  
  // Deutsche Formatierung: Tausendertrennpunkte entfernen, Komma zu Punkt
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  
  return parseFloat(cleaned) || 0;
}

export const zaehlerZuordnung: Record<
  string,
  {
    wasserzaehlerNrDigital?: string;
    wasserzaehlerNrAnalog?: string;
    heizungNr?: string;
    stromNr?: string;
  }
> = {
  WE01: {
    wasserzaehlerNrDigital: "D-1001",
    wasserzaehlerNrAnalog: "A-1001",
    heizungNr: "H-1001",
    stromNr: "S-1001",
  },
  WE02: {
    wasserzaehlerNrDigital: "D-1002",
    wasserzaehlerNrAnalog: "A-1002",
    heizungNr: "H-1002",
    stromNr: "S-1002",
  },
  "1a": {
    wasserzaehlerNrDigital: "D-2001",
    wasserzaehlerNrAnalog: "A-2001",
    heizungNr: "H-2001",
    stromNr: "S-2001",
  },
};

function formatWohnungsId(id: string): string {
  // Numerische IDs (1-19) werden zu WE + ID formatiert
  if (/^([1-9]|1[0-9])$/.test(id)) return `WE${id.padStart(2, "0")}`;
  return id;
}

function generateMandateReference(property: string, id: string, lage: string, nachname: string, vorname: string) {
  // Wohnungs-ID formatieren für Mandatsreferenz
  const formattedId = /^([1-9]|1[0-9])$/.test(id) ? `WE${id.padStart(2, "0")}` : id;
  
  // Lage bereinigen: nur Buchstaben und Zahlen behalten
  const cleanedLage = (lage || "").replace(/[^a-zA-Z0-9]/g, "");
  
  return (
    (property || "") +
    (formattedId || "") +
    cleanedLage +
    (nachname || "").replace(/[^a-zA-Z]/g, "") +
    (vorname || "").replace(/[^a-zA-Z]/g, "")
  );
}

// Hilfsfunktion: Adresse automatisch generieren basierend auf Objekt und Vertragsstatus
function generateAddress(property: string, apartmentId: string, houseNumber: string, isContractActive: boolean): string {
  if (!isContractActive) return ""; // Leere Adresse wenn Vertrag beendet
  
  switch (property) {
    case "TRI":
      return `Triftstraße ${houseNumber}, 13127 Berlin`;
    case "PAS":
      // Wohnungs-ID 1-10: Pasewalker Str. 67
      // Wohnungs-ID 1a-1f: Rosenthaler Str. + WohnungsID
      if (/^([1-9]|10)$/.test(apartmentId)) {
        return "Pasewalker Str. 67, 13127 Berlin";
      } else if (/^1[a-f]$/.test(apartmentId)) {
        return `Rosenthaler Str. ${apartmentId}, 13127 Berlin`;
      }
      return "";
    case "RITA":
      return "Rosenthaler Straße 1, 13127 Berlin";
    default:
      return "";
  }
}
function parseName(name: string): { salutation: string; firstName: string; lastName: string } {
  if (!name) return { salutation: "Herr", firstName: "", lastName: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { salutation: "Herr", firstName: parts[0], lastName: "" };
  if (parts.length === 2) return { salutation: "Herr", firstName: parts[1], lastName: parts[0] };
  // Mehr als zwei Teile: alles außer erstes als Vorname, erstes als Nachname
  return { salutation: "Herr", firstName: parts.slice(1).join(" "), lastName: parts[0] };
}

export const RecordForm: React.FC<RecordFormProps> = ({
  selectedProperty,
  onCancel,
  recordToUpdate,
  isTenantChangeMode,
  onSave,
  onDelete,
}) => {
  // Ref für automatische Kaution, um mehrfache Berechnungen zu verhindern
  const autoDepositCalculationRef = useRef<NodeJS.Timeout | null>(null);
  
  // Zentraler State
  const [currentState, setCurrentState] = useState({
    formApartmentId: "",
    formEffectiveDate: new Date().toISOString().split("T")[0],
    formMoveOutDate: "",
    formArea: "",
    formFloor: "",
    formPosition: "",
    formPersons: "",
    formHouseNumber: "",
    formContractDate: "",
    formMoveInDate: "",
    formTerminationDate: "",
    formContractEndDate: "",
    formIban: "",
    formDirectDebitMandateDate: "",
    formMandateReference: "",
    formRentBase: "",
    formRentUtilities: "",
    formRentHeating: "",
    formRentParking: "",
    formNotes: "",
    isLoading: false,
    formStellplatz1: "",
    formStellplatz2: "",
    formStellplatz3: "",
    formStellplatz4: "",
    formWasserzaehlerNrDigital: "",
    formWasserzaehlerStandDigital: "",
    formWasserzaehlerNrAnalog: "",
    formWasserzaehlerStandAnalog: "",
    formHeizungNr: "",
    formHeizungStand: "",
    formStromNr: "",
    formStromStand: "",
    formKautionHoehe: "",
    formKautionszahlungen: [{ betrag: "", datum: "" }],
    formKautionsauszahlungen: [{ betrag: "", datum: "" }],
    isParkingOnly: false,
    customRentPerSqm: "",
    parkingCount: 1,
    tenant1Salutation: "Herr",
    tenant1FirstName: "",
    tenant1LastName: "",
    tenant1BirthDate: "",
    tenant1Address: "",
    tenant1Email: "",
    tenant1Phone: "",
    tenant2Salutation: "Herr",
    tenant2FirstName: "",
    tenant2LastName: "",
    tenant2BirthDate: "",    tenant2Address: "",
    tenant2Email: "",
    tenant2Phone: "",
    formBuergschaftLiegtVor: false,
    formBuergschaftZurueckGesendetAm: "",
  });
  
  // State für Bürgschaft-Modal
  const [showBuergschaftModal, setShowBuergschaftModal] = useState(false);
  const [tempBuergschaftReturnDate, setTempBuergschaftReturnDate] = useState("");
  
  // Undo/Redo
  const [history, setHistory] = useState<typeof currentState[]>([]);
  const [future, setFuture] = useState<typeof currentState[]>([]);

  function handleChange<K extends keyof typeof currentState>(
    key: K,
    value: typeof currentState[K]
  ) {
    setHistory([...history, currentState]);
    setCurrentState({ ...currentState, [key]: value });
    setFuture([]);
  }

  function undo() {
    if (history.length === 0) return;
    setFuture([currentState, ...future]);
    setCurrentState(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }  function redo() {
    if (future.length === 0) return;
    setHistory([...history, currentState]);
    setCurrentState(future[0]);
    setFuture(future.slice(1));
  }

  // Handler für Bürgschaft-Modal-Aktionen
  const handleBuergschaftModalConfirm = () => {
    setHistory([...history, currentState]);
    setCurrentState(prev => ({
      ...prev,
      formBuergschaftLiegtVor: false,
      formBuergschaftZurueckGesendetAm: tempBuergschaftReturnDate || ''
    }));
    setFuture([]);
    setShowBuergschaftModal(false);
    setTempBuergschaftReturnDate('');
  };

  const handleBuergschaftModalCancel = () => {
    setShowBuergschaftModal(false);
    setTempBuergschaftReturnDate('');
  };

  // Automatische Mandatsreferenz
  useEffect(() => {
    if (!recordToUpdate) {
      const ref = generateMandateReference(
        selectedProperty,
        currentState.formApartmentId,
        currentState.formPosition,
        currentState.tenant1LastName,
        currentState.tenant1FirstName
      );
      setCurrentState(cs => ({ ...cs, formMandateReference: ref }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProperty,
    currentState.formApartmentId,
    currentState.formPosition,
    currentState.tenant1LastName,
    currentState.tenant1FirstName,
  ]);

  // Automatische Zählerdaten nach Wohnung
  useEffect(() => {
    const wohnungsId = formatWohnungsId(currentState.formApartmentId);
    const zuordnung = zaehlerZuordnung[wohnungsId];
    // Nur vorbelegen, wenn die Felder leer sind!
    if (zuordnung) {
      setCurrentState((cs) => ({
        ...cs,
        formWasserzaehlerNrDigital: cs.formWasserzaehlerNrDigital || zuordnung.wasserzaehlerNrDigital || "",
        formWasserzaehlerNrAnalog: cs.formWasserzaehlerNrAnalog || zuordnung.wasserzaehlerNrAnalog || "",
        formHeizungNr: cs.formHeizungNr || zuordnung.heizungNr || "",
        formStromNr: cs.formStromNr || zuordnung.stromNr || "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState.formApartmentId]);
  // Kaltmiete/m² und Kaltmiete synchronisieren
  useEffect(() => {
    if (currentState.customRentPerSqm && currentState.formArea) {
      const perSqm = parseGermanNumber(currentState.customRentPerSqm);
      const area = parseFloat(currentState.formArea);
      const newBase = (perSqm * area).toFixed(2);
      setCurrentState(cs => ({ ...cs, formRentBase: formatGermanNumber(newBase) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState.customRentPerSqm]);  // Kaution automatisch setzen (nur bei Neuanlage und leerem Feld)
  useEffect(() => {
    // Nur bei Neuanlage und wenn keine Kaution gesetzt ist
    if (!recordToUpdate && currentState.formRentBase && !currentState.formKautionHoehe) {
      // Vorherigen Timer löschen
      if (autoDepositCalculationRef.current) {
        clearTimeout(autoDepositCalculationRef.current);
      }
        // Neuen Timer setzen
      autoDepositCalculationRef.current = setTimeout(() => {
        const baseRent = parseGermanNumber(currentState.formRentBase);
        
        // Nur ausführen wenn eine realistische Kaltmiete vorhanden ist (mind. 100€)
        if (baseRent >= 100) {
          const deposit = baseRent * 3;
          const formattedDeposit = formatGermanNumber(deposit);
          
          setCurrentState(cs => ({
            ...cs,
            formKautionHoehe: formattedDeposit,
          }));
        }
        
        autoDepositCalculationRef.current = null;
      }, 800); // Längeres Debouncing - 800ms
    }
    
    return () => {
      if (autoDepositCalculationRef.current) {
        clearTimeout(autoDepositCalculationRef.current);
        autoDepositCalculationRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState.formRentBase, recordToUpdate]);// Funktion für 3xKaltmiete Button
  const setTripleRentAsDeposit = () => {
    if (currentState.formRentBase) {
      const baseRent = parseGermanNumber(currentState.formRentBase);
      if (baseRent > 0) {
        const deposit = baseRent * 3;
        setCurrentState(cs => ({
          ...cs,
          formKautionHoehe: formatGermanNumber(deposit),
        }));
      }
    }
  };
  // Adresse automatisch vorbelegen (bei laufendem Vertrag)
  useEffect(() => {
    const isContractActive = !currentState.formContractEndDate || new Date(currentState.formContractEndDate) > new Date();
    const address = generateAddress(selectedProperty, currentState.formApartmentId, currentState.formHouseNumber, isContractActive);
      setCurrentState(cs => ({
      ...cs,
      tenant1Address: address,
      tenant2Address: address,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProperty, currentState.formApartmentId, currentState.formHouseNumber, currentState.formContractEndDate]);

  // Automatischer Parkplatz-Modus bei Eingabe von Parkplatz-IDs
  useEffect(() => {
    if (currentState.formApartmentId && currentState.formApartmentId.startsWith('P') && !currentState.isParkingOnly) {
      console.log('Aktiviere Parkplatz-Modus automatisch für ID:', currentState.formApartmentId);
      handleChange("isParkingOnly", true);
    }
  }, [currentState.formApartmentId, currentState.isParkingOnly]);

  // Felder aus recordToUpdate übernehmen
  useEffect(() => {
    if (recordToUpdate) {
      const data = recordToUpdate.data;
      // Tenant 1
      const t1 = parseName(data.tenants?.tenant1?.name || "");
      // Tenant 2
      const t2 = data.tenants?.tenant2 ? parseName(data.tenants.tenant2.name || "") : { salutation: "Herr", firstName: "", lastName: "" };
      
      // Automatische Erkennung von Parkplatz-Datensätzen
      const isParkingRecord = recordToUpdate.apartmentId?.startsWith('P') || recordToUpdate.propertyCode?.endsWith('-P');
      
      setCurrentState((cs) => ({
        ...cs,
        formApartmentId: recordToUpdate.apartmentId || "",
        formArea: data.details?.area?.toString() || "",
        formHouseNumber: data.details?.houseNumber || "",
        formFloor: data.details?.location?.split(" ")[0] || "",
        formPosition: data.details?.location?.split(" ")[1] || "",
        formPersons: data.details?.persons?.toString() || "",
        formStellplatz1: data.details?.stellplatz1 || "",
        formStellplatz2: data.details?.stellplatz2 || "",
        formStellplatz3: data.details?.stellplatz3 || "",
        formStellplatz4: data.details?.stellplatz4 || "",
        formContractDate: data.contract?.contractDate || "",
        formMoveInDate: data.contract?.moveInDate || "",
        formTerminationDate: data.contract?.terminationDate || "",
        formContractEndDate: data.contract?.contractEndDate || "",
        formKautionHoehe: data.contract?.kautionHoehe ? formatGermanNumber(data.contract.kautionHoehe) : "",        formKautionszahlungen: Array.isArray(data.contract?.kautionszahlungen) && data.contract.kautionszahlungen.length > 0
          ? data.contract.kautionszahlungen.map((z: any) => {
        if (typeof z === "object" && z !== null) {
          return { betrag: z.betrag ? formatGermanNumber(z.betrag) : "", datum: z.datum || "" };
        }
        if (typeof z === "number" || typeof z === "string") {
          return { betrag: formatGermanNumber(z), datum: "" };
        }
        return { betrag: "", datum: "" };
      })
          : [{ betrag: "", datum: "" }],        formKautionsauszahlungen: [{ betrag: "", datum: "" }], // Immer Default, da nicht im Datensatz        formBuergschaftLiegtVor: data.contract?.buergschaftLiegtVor || false,
        formBuergschaftZurueckGesendetAm: data.contract?.buergschaftZurueckGesendetAm || "",
        formIban: data.payment?.iban || "",
        formDirectDebitMandateDate: data.payment?.directDebitMandateDate || "",
        formMandateReference: data.payment?.mandateReference || "",        formRentBase: data.rent?.base ? formatGermanNumber(data.rent.base) : "",
        formRentUtilities: data.rent?.utilities ? formatGermanNumber(data.rent.utilities) : "",
        formRentHeating: data.rent?.heating ? formatGermanNumber(data.rent.heating) : "",
        formRentParking: data.rent?.parking ? formatGermanNumber(data.rent.parking) : "",
        formNotes: data.notes || "",
        formWasserzaehlerNrDigital: data.meterReadings?.wasserzaehlerNrDigital || "",
        formWasserzaehlerStandDigital: data.meterReadings?.wasserzaehlerStandDigital?.toString() || "",
        formWasserzaehlerNrAnalog: data.meterReadings?.wasserzaehlerNrAnalog || "",
        formWasserzaehlerStandAnalog: data.meterReadings?.wasserzaehlerStandAnalog?.toString() || "",
        formHeizungNr: data.meterReadings?.heizungNr || "",
        formHeizungStand: data.meterReadings?.heizungStand?.toString() || "",
        formStromNr: data.meterReadings?.stromNr || "",
        formStromStand: data.meterReadings?.stromStand?.toString() || "",
        tenant1Salutation: t1.salutation,
        tenant1FirstName: t1.firstName,
        tenant1LastName: t1.lastName,
        tenant1BirthDate: "",
        tenant1Address: "",
        tenant1Email: data.tenants?.tenant1?.email || "",
        tenant1Phone: data.tenants?.tenant1?.phone || "",
        tenant2Salutation: t2.salutation,
        tenant2FirstName: t2.firstName,
        tenant2LastName: t2.lastName,
        tenant2BirthDate: "",
        tenant2Address: "",        tenant2Email: data.tenants?.tenant2?.email || "",
        tenant2Phone: data.tenants?.tenant2?.phone || "",        isParkingOnly: isParkingRecord, // Automatische Aktivierung für Parkplatz-Datensätze
      }));
      
      // Debug: Log der geladenen Bürgschaftsdaten
      console.log('Loaded surety data from record:', {
        buergschaftLiegtVor: data.contract?.buergschaftLiegtVor,
        buergschaftZurueckGesendetAm: data.contract?.buergschaftZurueckGesendetAm,
        recordId: recordToUpdate.id
      });
    } else {
      // Bei Neuanlage: State auf Defaultwerte zurücksetzen (inkl. selectedProperty)
      setCurrentState({
        formApartmentId: "",
        formEffectiveDate: new Date().toISOString().split("T")[0],
        formMoveOutDate: "",
        formArea: "",
        formFloor: "",
        formPosition: "",
        formPersons: "",
        formHouseNumber: "",
        formContractDate: "",
        formMoveInDate: "",
        formTerminationDate: "",
        formContractEndDate: "",
        formIban: "",
        formDirectDebitMandateDate: "",
        formMandateReference: "",
        formRentBase: "",
        formRentUtilities: "",
        formRentHeating: "",
        formRentParking: "",
        formNotes: "",
        isLoading: false,
        formStellplatz1: "",
        formStellplatz2: "",
        formStellplatz3: "",
        formStellplatz4: "",
        formWasserzaehlerNrDigital: "",
        formWasserzaehlerStandDigital: "",
        formWasserzaehlerNrAnalog: "",
        formWasserzaehlerStandAnalog: "",
        formHeizungNr: "",
        formHeizungStand: "",
        formStromNr: "",
        formStromStand: "",
        formKautionHoehe: "",
        formKautionszahlungen: [{ betrag: "", datum: "" }],
        formKautionsauszahlungen: [{ betrag: "", datum: "" }],
        isParkingOnly: false,
        customRentPerSqm: "",
        parkingCount: 1,
        tenant1Salutation: "Herr",
        tenant1FirstName: "",
        tenant1LastName: "",
        tenant1BirthDate: "",
        tenant1Address: "",
        tenant1Email: "",
        tenant1Phone: "",
        tenant2Salutation: "Herr",
        tenant2FirstName: "",
        tenant2LastName: "",        tenant2BirthDate: "",
        tenant2Address: "",
        tenant2Email: "",
        tenant2Phone: "",
        formBuergschaftLiegtVor: false,
        formBuergschaftZurueckGesendetAm: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordToUpdate, selectedProperty]);
  // Hilfsfunktionen für Berechnungen
  const area = parseFloat(currentState.formArea) || 0;
  const rentBase = parseGermanNumber(currentState.formRentBase);
  const rentPerSqm = area > 0 ? (rentBase / area).toFixed(2) : "";
  // Korrektur: Nur belegte Stellplätze zählen (leere Felder ignorieren)
  const parkingCount = [
    currentState.formStellplatz1,
    currentState.formStellplatz2,
    currentState.formStellplatz3,
    currentState.formStellplatz4,
  ].filter(s => typeof s === 'string' ? s.trim() !== "" : String(s || "").trim() !== "").length;  const parkingRent = currentState.formRentParking !== ""
    ? parseGermanNumber(currentState.formRentParking)
    : parkingCount * 40;
  const totalRent =
    rentBase +
    parseGermanNumber(currentState.formRentUtilities) +
    parseGermanNumber(currentState.formRentHeating) +
    parkingRent;  // Korrektur: Offene Kaution nur anzeigen, wenn Kautionshöhe > 0
  const gezahlteKaution = currentState.formKautionszahlungen.reduce((sum, z) => sum + parseGermanNumber(z.betrag), 0);
  const ausgezahlteKaution = currentState.formKautionsauszahlungen.reduce((sum, z) => sum + parseGermanNumber(z.betrag), 0);
  const kautionHoehe = parseGermanNumber(currentState.formKautionHoehe);
  
  // Hilfsfunktion: Berechnung der offenen Kaution
  const calculateOpenDeposit = (): number => {
    // Wenn Bürgschaft vorliegt, ist die offene Kaution automatisch 0
    if (currentState.formBuergschaftLiegtVor) {
      return 0;
    }
    
    return kautionHoehe > 0 ? kautionHoehe - gezahlteKaution : 0;
  };
  
  const offeneKaution = calculateOpenDeposit();
  const nochNichtAusgezahlt = gezahlteKaution - ausgezahlteKaution;

  // Hilfsfunktion für Kautionszahlungen
  const handleKautionszahlungChange = (
    idx: number,
    field: "betrag" | "datum",
    value: string
  ) => {
    const updated = [...currentState.formKautionszahlungen];
    updated[idx][field] = value;
    handleChange("formKautionszahlungen", updated);
  };
  // Hilfsfunktion für Kautionsauszahlungen
  const handleKautionsauszahlungChange = (
    idx: number,
    field: "betrag" | "datum",
    value: string
  ) => {
    const updated = [...currentState.formKautionsauszahlungen];
    updated[idx][field] = value;
    handleChange("formKautionsauszahlungen", updated);
  };
  // Speichern-Logik für das Formular
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCurrentState(cs => ({ ...cs, isLoading: true }));
    try {
      await onSave({ ...currentState, selectedProperty }); // selectedProperty zu FormData hinzufügen
    } finally {
      setCurrentState(cs => ({ ...cs, isLoading: false }));
      if (onCancel) onCancel();
    }
  }

  // --- Formular-Rendering ---
  return (
    <div className="mb-10 p-8 bg-gray-800 rounded-xl shadow-2xl border">
      {/* Kopfzeile mit Buttons */}
      <div className="flex items-center justify-between mb-8 border-b pb-4">
        <h2 className="text-3xl font-semibold text-gray-200">
          {isTenantChangeMode
            ? "Mieterwechsel durchführen"
            : recordToUpdate
            ? "Datensatz aktualisieren"
            : "Neuen Datensatz erstellen"}
        </h2>        <div className="flex gap-4">
          <button
            type="button"
            className="btn btn-special"
            onClick={() =>
              handleChange("isParkingOnly", !currentState.isParkingOnly)
            }
          >
            {currentState.isParkingOnly
              ? "Vollständige Eingabe"
              : "Nur Parkplatz"}
          </button>
          <button
            type="button"
            onClick={undo}
            className="btn btn-edit"
            disabled={history.length === 0}
          >
            Rückgängig
          </button>
          <button
            type="button"
            onClick={redo}
            className="btn btn-edit"
            disabled={future.length === 0}
          >
            Wiederholen
          </button>
          {recordToUpdate && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(recordToUpdate)}
              className="btn btn-danger"
            >
              Löschen
            </button>
          )}          <button
            type="submit"
            disabled={currentState.isLoading}
            className="btn btn-success"
            form="record-form"
          >
            {currentState.isLoading ? "Speichern..." : "Speichern"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-edit"
          >
            Abbrechen
          </button>
        </div>
      </div>      <form
        id="record-form"
        onSubmit={handleSubmit}
        className="space-y-10"
      >
        {/* Parkplatz-Modus: Spezielle Felder nur für Parkplätze */}
        {currentState.isParkingOnly && (
          <>
            <fieldset className="p-5 border rounded-lg">
              <legend className="text-xl font-semibold px-2 mb-2">Parkplatz-Stammdaten</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div>
                  <label className="block mb-1">Datensatz-Datum</label>
                  <input
                    type="date"
                    value={currentState.formEffectiveDate}
                    onChange={e => handleChange("formEffectiveDate", e.target.value)}
                    className="p-2 border rounded w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1">Parkplatz-ID</label>
                  <input
                    value={currentState.formApartmentId}
                    onChange={e => handleChange("formApartmentId", e.target.value)}
                    className="p-2 border rounded w-full"
                    required
                    placeholder="z.B. P1, P14"
                  />
                </div>
                {selectedProperty === "TRI" && (
                  <div>
                    <label className="block mb-1">Hausnummer</label>
                    <input
                      value={currentState.formHouseNumber}
                      onChange={e => handleChange("formHouseNumber", e.target.value)}
                      className="p-2 border rounded w-full"
                      placeholder="z.B. P oder 131"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="block mb-1">Stellplatz 1</label>
                  <input
                    value={currentState.formStellplatz1}
                    onChange={e => handleChange("formStellplatz1", e.target.value)}
                    className="p-2 border rounded w-full"
                    placeholder="z.B. 14"
                  />
                </div>
                <div>
                  <label className="block mb-1">Stellplatz 2</label>
                  <input
                    value={currentState.formStellplatz2}
                    onChange={e => handleChange("formStellplatz2", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Stellplatz 3</label>
                  <input
                    value={currentState.formStellplatz3}
                    onChange={e => handleChange("formStellplatz3", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Stellplatz 4</label>
                  <input
                    value={currentState.formStellplatz4}
                    onChange={e => handleChange("formStellplatz4", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
              </div>            </fieldset><fieldset className="p-5 border rounded-lg">
              <legend className="text-xl font-semibold px-2 mb-2">Stellplatzmiete</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block mb-1">Stellplatzmiete (€)</label>
                  <input
                    type="text"
                    value={currentState.formRentParking}
                    onChange={e => {
                      const value = e.target.value;
                      if (/^[\d.,]*$/.test(value) || value === "") {
                        handleChange("formRentParking", value);
                      }
                    }}
                    onBlur={e => {
                      const parsed = parseGermanNumber(e.target.value);
                      if (parsed > 0) {
                        handleChange("formRentParking", formatGermanNumber(parsed));
                      }
                    }}
                    className="p-2 border rounded w-full"
                    placeholder="0,00"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="p-5 border rounded-lg">
              <legend className="text-xl font-semibold px-2 mb-2">Vertragsdaten</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div>
                  <label className="block mb-1">Vertragsdatum</label>
                  <input
                    type="date"
                    value={currentState.formContractDate}
                    onChange={e => handleChange("formContractDate", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Einzugsdatum</label>
                  <input
                    type="date"
                    value={currentState.formMoveInDate}
                    onChange={e => handleChange("formMoveInDate", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Vertragsende</label>
                  <input
                    type="date"
                    value={currentState.formContractEndDate}
                    onChange={e => handleChange("formContractEndDate", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">IBAN</label>
                  <input
                    value={currentState.formIban}
                    onChange={e => handleChange("formIban", e.target.value)}
                    className="p-2 border rounded w-full"
                    placeholder="DE..."
                  />
                </div>
                <div>
                  <label className="block mb-1">Mandatsreferenz</label>
                  <input
                    value={currentState.formMandateReference}
                    onChange={e => handleChange("formMandateReference", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
              </div>
            </fieldset>
          </>
        )}

        {/* 1. Block Stammdaten & Details */}
        {!currentState.isParkingOnly && (
          <fieldset className="p-5 border rounded-lg">
            <legend className="text-xl font-semibold px-2 mb-2">Stammdaten & Details</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div>
                <label className="block mb-1">Datensatz-Datum</label>
                <input
                  type="date"
                  value={currentState.formEffectiveDate}
                  onChange={e => handleChange("formEffectiveDate", e.target.value)}
                  className="p-2 border rounded w-full"
                  required
                />
              </div>
              <div>
                <label className="block mb-1">Wohnungs-ID</label>
                <input
                  value={currentState.formApartmentId}
                  onChange={e => handleChange("formApartmentId", e.target.value)}
                  className="p-2 border rounded w-full"
                  required
                />
              </div>
              {selectedProperty === "TRI" && (
                <div>
                  <label className="block mb-1">Hausnummer</label>
                  <input
                    value={currentState.formHouseNumber}
                    onChange={e => handleChange("formHouseNumber", e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                </div>
              )}
              <div>
                <label className="block mb-1">Fläche in m²</label>
                <input
                  type="number"
                  value={currentState.formArea}
                  onChange={e => handleChange("formArea", e.target.value)}
                  className="p-2 border rounded w-full"
                />
              </div>
              <div>
                <label className="block mb-1">Lage</label>
                <input
                  value={currentState.formPosition}
                  onChange={e => handleChange("formPosition", e.target.value)}
                  className="p-2 border rounded w-full"
                />
              </div>
              {selectedProperty === "TRI" && (
                <>
                  <div>
                    <label className="block mb-1">Stellplatz 1</label>
                    <input
                      value={currentState.formStellplatz1}
                      onChange={e => handleChange("formStellplatz1", e.target.value)}
                      className="p-2 border rounded w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Stellplatz 2</label>
                    <input
                      value={currentState.formStellplatz2}
                      onChange={e => handleChange("formStellplatz2", e.target.value)}
                      className="p-2 border rounded w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Stellplatz 3</label>
                    <input
                      value={currentState.formStellplatz3}
                      onChange={e => handleChange("formStellplatz3", e.target.value)}
                      className="p-2 border rounded w-full"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Stellplatz 4</label>
                    <input
                      value={currentState.formStellplatz4}
                      onChange={e => handleChange("formStellplatz4", e.target.value)}
                      className="p-2 border rounded w-full"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block mb-1">Personen</label>
                <input
                  type="number"
                  value={currentState.formPersons}
                  onChange={e => handleChange("formPersons", e.target.value)}
                  className="p-2 border rounded w-full"
                />
              </div>
            </div>
          </fieldset>
        )}

        {/* 2. Block Mieter 1 */}
        <fieldset className="p-5 border rounded-lg">
          <legend className="text-xl font-semibold px-2 mb-2">Mieter 1</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div>
              <label className="block mb-1">Anrede</label>
              <select
                value={currentState.tenant1Salutation}
                onChange={e => handleChange("tenant1Salutation", e.target.value)}
                className="p-2 border rounded w-full"
              >
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
              </select>
            </div>
            <div>
              <label className="block mb-1">Vorname</label>
              <input
                value={currentState.tenant1FirstName}
                onChange={e => handleChange("tenant1FirstName", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Nachname</label>
              <input
                value={currentState.tenant1LastName}
                onChange={e => handleChange("tenant1LastName", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Geburtsdatum</label>
              <input
                type="date"
                value={currentState.tenant1BirthDate}
                onChange={e => handleChange("tenant1BirthDate", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">E-Mail</label>
              <input
                type="email"
                value={currentState.tenant1Email}
                onChange={e => handleChange("tenant1Email", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Telefon</label>
              <input
                value={currentState.tenant1Phone}
                onChange={e => handleChange("tenant1Phone", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>            <div className="md:col-span-3">
              <label className="block mb-1">Adresse</label>
              <input
                value={currentState.tenant1Address}
                onChange={e => handleChange("tenant1Address", e.target.value)}
                className={`p-2 border rounded w-full ${
                  !currentState.tenant1Address && currentState.formContractEndDate && new Date(currentState.formContractEndDate) <= new Date()
                    ? 'border-red-500 border-2' 
                    : ''
                }`}
                placeholder="Adresse (wird automatisch befüllt bei aktivem Vertrag)"
              />
            </div>
          </div>
        </fieldset>

        {/* 3. Block Mieter 2 */}
        <fieldset className="p-5 border rounded-lg">
          <legend className="text-xl font-semibold px-2 mb-2">Mieter 2</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div>
              <label className="block mb-1">Anrede</label>
              <select
                value={currentState.tenant2Salutation}
                onChange={e => handleChange("tenant2Salutation", e.target.value)}
                className="p-2 border rounded w-full"
              >
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
              </select>
            </div>
            <div>
              <label className="block mb-1">Vorname</label>
              <input
                value={currentState.tenant2FirstName}
                onChange={e => handleChange("tenant2FirstName", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Nachname</label>
              <input
                value={currentState.tenant2LastName}
                onChange={e => handleChange("tenant2LastName", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Geburtsdatum</label>
              <input
                type="date"
                value={currentState.tenant2BirthDate}
                onChange={e => handleChange("tenant2BirthDate", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">E-Mail</label>
              <input
                type="email"
                value={currentState.tenant2Email}
                onChange={e => handleChange("tenant2Email", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Telefon</label>
              <input
                value={currentState.tenant2Phone}
                onChange={e => handleChange("tenant2Phone", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>            <div className="md:col-span-3">
              <label className="block mb-1">Adresse</label>
              <input
                value={currentState.tenant2Address}
                onChange={e => handleChange("tenant2Address", e.target.value)}
                className={`p-2 border rounded w-full ${!currentState.tenant2Address && currentState.formContractEndDate && new Date(currentState.formContractEndDate) <= new Date() ? 'border-red-500' : ''}`}
                placeholder="Adresse"
              />
            </div>
          </div>
        </fieldset>

        {/* 4. Block Miete */}
        {!currentState.isParkingOnly && (
          <fieldset className="p-5 border rounded-lg">
            <legend className="text-xl font-semibold px-2 mb-2">Miete</legend>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">              <div>
                <label className="block mb-1">Kaltmiete (€)</label>
                <input
                  type="text"
                  value={currentState.formRentBase}
                  onChange={e => {
                    const value = e.target.value;
                    // Erlaube nur Zahlen, Komma und Punkt während der Eingabe
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleChange("formRentBase", value);
                    }
                  }}
                  onBlur={e => {
                    // Formatiere beim Verlassen des Feldes
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleChange("formRentBase", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded w-full"
                  placeholder="0,00"
                />
              </div>              <div>
                <label className="block mb-1">Kaltmiete/m² (€)</label>
                <input
                  type="text"
                  value={currentState.customRentPerSqm || rentPerSqm}
                  onChange={e => {
                    const value = e.target.value;
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleChange("customRentPerSqm", value);
                    }
                  }}
                  onBlur={e => {
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleChange("customRentPerSqm", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded w-full"
                  placeholder="0,00"
                />
              </div><div>
                <label className="block mb-1">Nebenkosten (€)</label>
                <input
                  type="text"
                  value={currentState.formRentUtilities}
                  onChange={e => {
                    const value = e.target.value;
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleChange("formRentUtilities", value);
                    }
                  }}
                  onBlur={e => {
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleChange("formRentUtilities", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded w-full"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="block mb-1">Heizkosten (€)</label>
                <input
                  type="text"
                  value={currentState.formRentHeating}
                  onChange={e => {
                    const value = e.target.value;
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleChange("formRentHeating", value);
                    }
                  }}
                  onBlur={e => {
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleChange("formRentHeating", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded w-full"
                  placeholder="0,00"
                />
              </div>              <div>
                <label className="block mb-1">Stellplatzmiete (€)</label>
                <input
                  type="text"
                  value={currentState.formRentParking || formatGermanNumber(parkingRent)}
                  onChange={e => {
                    const value = e.target.value;
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleChange("formRentParking", value);
                    }
                  }}
                  onBlur={e => {
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleChange("formRentParking", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded w-full"
                  placeholder="0,00"
                />
              </div>              <div>
                <label className="block mb-1">Gesamtmiete (€)</label>
                <input
                  type="text"
                  value={formatGermanNumber(totalRent)}
                  readOnly
                  className="p-2 border rounded w-full bg-gray-700"
                />
              </div>
            </div>
          </fieldset>
        )}        {/* 5. Block Vertragsdaten */}
        {!currentState.isParkingOnly && (
          <fieldset className="p-5 border rounded-lg">
            <legend className="text-xl font-semibold px-2 mb-2">Vertragsdaten</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div>
              <label className="block mb-1">Mietvertrag vom</label>
              <input
                type="date"
                value={currentState.formContractDate}
                onChange={e => handleChange("formContractDate", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Einzug am</label>
              <input
                type="date"
                value={currentState.formMoveInDate}
                onChange={e => handleChange("formMoveInDate", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Gekündigt zum</label>
              <input
                type="date"
                value={currentState.formTerminationDate}
                onChange={e => handleChange("formTerminationDate", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Vertragsende</label>
              <input
                type="date"
                value={currentState.formContractEndDate}
                onChange={e => handleChange("formContractEndDate", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">IBAN</label>
              <input
                value={currentState.formIban}
                onChange={e => handleChange("formIban", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>
            <div>
              <label className="block mb-1">Mandatsreferenz</label>
              <input
                value={currentState.formMandateReference}
                onChange={e => handleChange("formMandateReference", e.target.value)}
                className="p-2 border rounded w-full"
              />
            </div>            <div>
              <label className="block mb-1">Kaution (€)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentState.formKautionHoehe}
                  onChange={e => {
                    const value = e.target.value;
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleChange("formKautionHoehe", value);
                    }
                  }}
                  onBlur={e => {
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleChange("formKautionHoehe", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded w-full"
                  placeholder="0,00"
                />
                <button
                  type="button"
                  onClick={setTripleRentAsDeposit}
                  disabled={!currentState.formRentBase}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap"
                  title="Setze Kaution auf 3x Kaltmiete"
                >                  3xKaltmiete
                </button>
              </div>
                {/* Bürgschaft Checkbox */}
              <div className="flex items-center space-x-4 mt-4">                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentState.formBuergschaftLiegtVor}
                    onChange={(e) => {
                      console.log('Direct onChange handler called:', e.target.checked);
                      const checked = e.target.checked;
                      if (!checked && currentState.formBuergschaftLiegtVor) {
                        setShowBuergschaftModal(true);
                      } else {
                        setHistory([...history, currentState]);
                        setCurrentState(prev => ({
                          ...prev,
                          formBuergschaftLiegtVor: checked,
                          formBuergschaftZurueckGesendetAm: checked ? "" : prev.formBuergschaftZurueckGesendetAm
                        }));
                        setFuture([]);
                      }
                    }}
                    className="w-5 h-5 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-gray-200 font-medium">Bürgschaft liegt vor</span>
                </label>
              </div>
              
              {currentState.formBuergschaftZurueckGesendetAm && (
                <div className="mt-2 p-3 bg-green-100 border border-green-300 rounded-lg">
                  <p className="text-green-700 text-sm">
                    Bürgschaft zurück gesandt am: {new Date(currentState.formBuergschaftZurueckGesendetAm).toLocaleDateString('de-DE')}
                  </p>
                </div>
              )}
            </div>
          </div>
          {/* Kautionszahlungen */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Kautionszahlungen:</label>
            {currentState.formKautionszahlungen.map((zahlung, idx) => (
              <div key={idx} className="flex gap-2 mb-2">                <input
                  type="text"
                  placeholder="0,00"
                  value={zahlung.betrag}
                  onChange={e => {
                    const value = e.target.value;
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleKautionszahlungChange(idx, "betrag", value);
                    }
                  }}
                  onBlur={e => {
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleKautionszahlungChange(idx, "betrag", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded"
                />
                <input
                  type="date"
                  placeholder="Datum"
                  value={zahlung.datum}
                  onChange={e => handleKautionszahlungChange(idx, "datum", e.target.value)}
                  className="p-2 border rounded"
                />
                <button
                  type="button"
                  onClick={() => {
                    const updated = currentState.formKautionszahlungen.filter((_, i) => i !== idx);
                    handleChange("formKautionszahlungen", updated);
                  }}
                >
                  Entfernen
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                handleChange("formKautionszahlungen", [
                  ...currentState.formKautionszahlungen,
                  { betrag: "", datum: "" },
                ])
              }
            >
              Zahlung hinzufügen
            </button>
          </div>
          {/* Kautionsauszahlungen */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Kautionsauszahlungen:</label>
            {currentState.formKautionsauszahlungen.map((zahlung, idx) => (
              <div key={idx} className="flex gap-2 mb-2">                <input
                  type="text"
                  placeholder="0,00"
                  value={zahlung.betrag}
                  onChange={e => {
                    const value = e.target.value;
                    if (/^[\d.,]*$/.test(value) || value === "") {
                      handleKautionsauszahlungChange(idx, "betrag", value);
                    }
                  }}
                  onBlur={e => {
                    const parsed = parseGermanNumber(e.target.value);
                    if (parsed > 0) {
                      handleKautionsauszahlungChange(idx, "betrag", formatGermanNumber(parsed));
                    }
                  }}
                  className="p-2 border rounded"
                />
                <input
                  type="date"
                  placeholder="Datum"
                  value={zahlung.datum}
                  onChange={e => handleKautionsauszahlungChange(idx, "datum", e.target.value)}
                  className="p-2 border rounded"
                />
                <button
                  type="button"
                  onClick={() => {
                    const updated = currentState.formKautionsauszahlungen.filter((_, i) => i !== idx);
                    handleChange("formKautionsauszahlungen", updated);
                  }}
                >
                  Entfernen
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                handleChange("formKautionsauszahlungen", [
                  ...currentState.formKautionsauszahlungen,
                  { betrag: "", datum: "" },
                ])
              }
            >
              Auszahlung hinzufügen
            </button>
          </div>
          {/* Kautionsanzeige */}          {kautionHoehe > 0 && (
            <div className="mt-2">
              <span className={offeneKaution > 0 ? "text-red-600 font-bold" : ""}>
                Offene Kaution: {formatGermanNumber(offeneKaution)} €
              </span>
              {currentState.formContractEndDate && (
                <span className={nochNichtAusgezahlt > 0 ? "text-red-600 font-bold ml-4" : "ml-4"}>
                  Noch nicht ausgezahlt: {formatGermanNumber(nochNichtAusgezahlt)} €
                </span>
              )}
            </div>          )}
        </fieldset>
        )}

        {/* 6. Block Abrechnungsdaten (Zähler) */}
        {!currentState.isParkingOnly && (
          <fieldset className="p-5 border rounded-lg">
            <legend className="text-xl font-semibold px-2 mb-2">Abrechnungsdaten (Zählerstände)</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block mb-1">Wasserzähler digital Nr.</label>
                <input
                  value={currentState.formWasserzaehlerNrDigital}
                  onChange={e => handleChange("formWasserzaehlerNrDigital", e.target.value)}
                  className="p-2 border rounded w-full"
                />
                <label className="block mb-1 mt-2">Wasserzähler digital Stand</label>
                <input
                  type="number"
                  value={currentState.formWasserzaehlerStandDigital}
                  onChange={e => handleChange("formWasserzaehlerStandDigital", e.target.value)}
                  className="p-2 border rounded w-full"
                />
              </div>
              <div>
                <label className="block mb-1">Wasserzähler analog Nr.</label>
                <input
                  value={currentState.formWasserzaehlerNrAnalog}
                  onChange={e => handleChange("formWasserzaehlerNrAnalog", e.target.value)}
                  className="p-2 border rounded w-full"
                />
                <label className="block mb-1 mt-2">Wasserzähler analog Stand</label>
                <input
                  type="number"
                  value={currentState.formWasserzaehlerStandAnalog}
                  onChange={e => handleChange("formWasserzaehlerStandAnalog", e.target.value)}
                  className="p-2 border rounded w-full"
                />
              </div>
              <div>
                <label className="block mb-1">Heizung Nr.</label>
                <input
                  value={currentState.formHeizungNr}
                  onChange={e => handleChange("formHeizungNr", e.target.value)}
                  className="p-2 border rounded w-full"
                />
                <label className="block mb-1 mt-2">Heizung Stand</label>
                <input
                  type="number"
                  value={currentState.formHeizungStand}
                  onChange={e => handleChange("formHeizungStand", e.target.value)}
                  className="p-2 border rounded w-full"
                />
              </div>
              <div>
                <label className="block mb-1">Strom Nr.</label>
                <input
                  value={currentState.formStromNr}
                  onChange={e => handleChange("formStromNr", e.target.value)}
                  className="p-2 border rounded w-full"
                />
                <label className="block mb-1 mt-2">Strom Stand</label>
                <input
                  type="number"
                  value={currentState.formStromStand}
                  onChange={e => handleChange("formStromStand", e.target.value)}
                  className="p-2 border rounded w-full"
                />
              </div>
            </div>
          </fieldset>
        )}

        {/* 7. Block Notizen */}
        {!currentState.isParkingOnly && (
          <fieldset className="p-5 border rounded-lg">
            <legend className="text-xl font-semibold px-2 mb-2">Notizen / Zusätzliche Informationen</legend>
            <textarea
              value={currentState.formNotes}
              onChange={e => handleChange("formNotes", e.target.value)}
              rows={4}
              className="mt-1 block w-full p-2 border rounded-md"
              placeholder="Besondere Vereinbarungen..."
            />
          </fieldset>
        )}        {/* Buttons am Formularende */}
        <div className="flex gap-4 justify-between mt-8">
          <div>
            {recordToUpdate && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(recordToUpdate)}
                className="btn btn-danger"
              >
                Löschen
              </button>
            )}
          </div>
          <div className="flex gap-4">            <button
              type="submit"
              disabled={currentState.isLoading}
              className="btn btn-success"
            >
              {currentState.isLoading ? "Speichern..." : "Speichern"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-edit"
            >
              Abbrechen
            </button>
          </div>        </div>
      </form>      {/* Bürgschaft Modal */}
      {showBuergschaftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-600">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Bürgschaft entfernen</h3>
            <p className="text-gray-300 mb-4">
              Möchten Sie ein Rückgabedatum für die Bürgschaft angeben?
            </p>
            
            <div className="mb-4">
              <label className="block text-gray-300 font-medium mb-2">
                Rückgabedatum (optional)
              </label>
              <input
                type="date"
                value={tempBuergschaftReturnDate}
                onChange={(e) => setTempBuergschaftReturnDate(e.target.value)}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-200 placeholder-gray-400"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleBuergschaftModalCancel}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-500"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleBuergschaftModalConfirm}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};