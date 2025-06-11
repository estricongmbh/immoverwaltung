
**__Für Speicherpunkt setzen_**

Schritt 1: Alle Änderungen vormerken (in die Tüte packen)
Bash

**git add** .
Schritt 2: Den Zustand überprüfen (optional, aber gut zur Kontrolle)
Bash

**git status_**
Jetzt sollten alle deine geänderten und gelöschten Dateien grün sein. Sie sind jetzt bereit für den Speicherpunkt.

Schritt 3: Den Speicherpunkt erstellen (jetzt bezahlen)
Bash

**git commit -m "Name Backup"**

## Startseite Triftstraße ✅ ERLEDIGT

## **NEUE TRI-SPEZIFISCHE TABELLENSTRUKTUR IMPLEMENTIERT:**

## Die Triftstraße hat jetzt eine komplett angepasste Startseitenansicht mit folgenden Feldern in genau der gewünschten Reihenfolge:

## 1. **Hausnummer** - Zeigt die Hausnummer aus den Details an
## 2. **Wohnungs-ID** - Formatiert als WE01, WE02, WE03 usw. für numerische IDs
## 3. **Lage** - Zeigt die Lage der Wohnung (Etage, Position)
## 4. **Mieter 1** - Vorname und Nachname des ersten Mieters
5. **Mieter 2** - Vorname und Nachname des zweiten Mieters (falls vorhanden)
6. **Fläche** - Wohnfläche in m²
7. **Nebenkosten** - Nebenkosten in €
8. **Heizkosten** - Heizkosten in €
9. **Gesamtmiete** - Kaltmiete + Nebenkosten + Heizkosten (OHNE Stellplatzmiete)
10. **Stellplätze** - Alle Stellplätze kommagetrennt angezeigt
11. **Kaution** - Nur angezeigt wenn noch etwas offen ist ## 

**SPEZIELLE SORTIERUNG UND ANZEIGE:**
- Datensätze mit offener Kaution werden nach unten sortiert
- Ausgezogene Mieter mit nicht ausgezahlter Kaution werden ganz unten angezeigt
- Offene Kautionen von beendeten Verträgen werden in **roter Fettschrift** hervorgehoben
- Andere Objekte (PAS, RITA) behalten ihre ursprüngliche Struktur

**FUNKTIONALITÄTEN:**
- Automatische WE-Formatierung für TRI-Wohnungs-IDs
- Intelligente Namens-Extraktion (Vor- und Nachname getrennt)
- Berechnung der Gesamtmiete ohne Stellplatzmiete
- Kautionstatus-Erkennung und Farbkodierung
- Sortierung nach Hausnummer mit Kautions-Priorität

## Startseite Pasewalker ✅ ERLEDIGT

## **NEUE PAS-SPEZIFISCHE TABELLENSTRUKTUR IMPLEMENTIERT:**

Die Pasewalker Str. hat jetzt ebenfalls eine angepasste Startseitenansicht mit folgenden Feldern:

1. **Wohnungs-ID** - Formatiert als WE01, WE02, etc. für numerische IDs (OHNE Hausnummer-Spalte)
2. **Lage** - Zeigt die Lage der Wohnung (Etage, Position)
3. **Mieter 1** - Vorname und Nachname des ersten Mieters
4. **Mieter 2** - Vorname und Nachname des zweiten Mieters (falls vorhanden)
5. **Fläche** - Wohnfläche in m²
6. **Nebenkosten** - Nebenkosten in €
7. **Heizkosten** - Heizkosten in €
8. **Gesamtmiete** - Kaltmiete + Nebenkosten + Heizkosten (OHNE Stellplatzmiete)
9. **Kaution** - Nur angezeigt wenn noch etwas offen ist (OHNE Stellplatz-Spalte)

**PAS-SPEZIELLE FUNKTIONALITÄTEN:**
- Gleiche Sortierlogik wie TRI: Offene Kautionen nach unten
- WE-Formatierung auch für PAS-Wohnungs-IDs
- Rote Fettschrift für beendete Verträge mit offener Kaution
- Keine Hausnummer- und Stellplatz-Spalten (da nicht benötigt)
- Sortierung nach Wohnungs-ID statt Hausnummer

## Startseite Rosenthaler ✅ ERLEDIGT

## **NEUE RITA-SPEZIFISCHE TABELLENSTRUKTUR IMPLEMENTIERT:**

Die Rosenthaler Str. hat jetzt eine angepasste Startseitenansicht mit folgenden Feldern (8 Spalten):

1. **Wohnungs-ID** - Formatiert als WE01, WE02, etc. für numerische IDs (OHNE Hausnummer-Spalte)
2. **Lage** - Zeigt die Lage der Wohnung (Etage, Position)
3. **Mieter 1** - Vorname und Nachname des ersten Mieters (OHNE Mieter 2-Spalte)
4. **Fläche** - Wohnfläche in m²
5. **Nebenkosten** - Nebenkosten in €
6. **Heizkosten** - Heizkosten in €
7. **Gesamtmiete** - Kaltmiete + Nebenkosten + Heizkosten (OHNE Stellplatzmiete)
8. **Kaution** - Nur angezeigt wenn noch etwas offen ist

**RITA-SPEZIELLE FUNKTIONALITÄTEN:**
- Gleiche Sortierlogik wie TRI und PAS: Offene Kautionen nach unten
- WE-Formatierung auch für RITA-Wohnungs-IDs
- Rote Fettschrift für beendete Verträge mit offener Kaution
- Keine Hausnummer-, Stellplatz- und Mieter 2-Spalten
- Sortierung nach Wohnungs-ID statt Hausnummer
- Kompakteste Ansicht mit nur 8 Spalten

## Datenimport Automapping ✅ ERLEDIGT

## **ALLE OBJEKTE HABEN JETZT AUTOMATISCHES MAPPING:**

### **TRI (Triftstraße) - Zeitabhängiges Mapping:**
- **Ab 2024-11-01**: Mit Stellplatz 3 (neue Struktur)
- **Vor 2024-11-01**: Ohne Stellplatz 3 (alte Struktur)
- Automatische Erkennung basierend auf Stichtag

### **PAS (Pasewalker Str.) - Festes Mapping:**
- Wohnungs-ID, Lage, Mieter 1+2, Fläche, Mieten, Kontaktdaten
- Vollständige Zählerstände und Vertragsdaten

### **RITA (Rosenthaler Str.) - Korrigiertes Mapping:**
**Spalten-Zuordnung:**
- Spalte 1: Wohnungs-ID
- Spalte 2: **Nicht importiert**
- Spalte 3: Lage
- Spalte 4: Mieter 1 Name
- Spalte 5: Mieter 2 Name
- Spalte 6: Fläche (m²)
- Spalte 7: Kaltmiete
- Spalte 8: **Nicht importiert**
- Spalte 9: Nebenkosten
- Spalten 10-11: **Nicht importiert**
- Spalte 12: Heizkosten
- Spalten 13-17: **Nicht importiert**
- Spalte 18: Mieter 1 E-Mail
- Spalte 19: Mieter 1 Telefon
- Spalte 20: Mieter 2 E-Mail
- Spalte 21: Mieter 2 Telefon
- Spalte 22: Vertrag Datum
- Spalte 23: Vertrag Einzug
- Spalte 24: Kaution Höhe
- Spalten 25-34: **Nicht importiert**

**RITA-BESONDERHEITEN:**
- Kompaktes Mapping ohne Zählerstände
- Fokus auf Grunddaten und Kontaktinformationen
- Keine Stellplatz-Informationen
- Vereinfachte Struktur für Einfamilienhäuser

Startseite Pasewalker
In der Pasewalker Str. müssten wir die vorhandenen Daten etwas umformen. Aus dem Datenimport kommt dort für die ersten 10 Einheiten (Wohnungen im Mehrfamilienhaus) eine Wohnungs-ID 1 - 10 und eine Lage mit Etage und Lage heraus. Also Beispielsweise Wohnung 1 EG rechts. Ab der 11. Einheit wird bei der Lage jeweils eine Adresse ausgegeben Rosenthaler Str. 1 a - 1 f. Hier würde ich gerne die letzten 3 Zeichen der Zelle jeweils zur Wohnungs-ID machen. Also 1 a, 1 b, 1 c usw, Daten für die "Lage" werden für die Einfamilienhäuser 1 a - 1 f nicht benötigt, dieses Feld kann dort leer bleiben. Die erste Spalte soll also in diesem Objekt die Wohnungs-ID bzw. die Hausnummer (1 a - 1-f) sein. 
In der 2. Spalte die Lage (bzw. für die 1 a - 1 f ein freies Feld). danach siehe unten.
Startseite Rosentahler
1.	Spalte Wohnungs-ID 2. Spalte die Lage.


## Anweisung Doppelparkplätze ✅ ERLEDIGT

**PROBLEM GELÖST:** Datensätze mit einem "P" in der Hausnummer werden jetzt korrekt als Parkplatzmieter identifiziert und mit gekürzten Datensätzen übernommen (Hausnummer, Wohnungs-ID, Mieter 1 Name, Mail + Telefon, Kaltmiete, Gesamtmiete, Stellplatz 1 - 4, Vertrag Datum, Vertragsende, IBAN, Mandatsreferenz). 

**NEUE FUNKTIONALITÄT:** Wenn in der Wohnungs-ID 2 Zahlen stehen (z.B. "9+2" oder "14+15"), werden diese Daten automatisch in 2 separate Parkplatzmieter-Datensätze aufgeteilt. Beim Beispiel "P14+15" erstellt der Importer nun korrekt 2 Datensätze: P14 und P15, jeweils mit allen genannten Feldern.

**Verbesserungen:**
- Robuste Erkennung von zusammengesetzten Parkplatz-IDs (Format: "14+15", "2+9", "P14+P15", etc.)
- Fallback-Suche in Stellplatz-Spalten wenn apartmentId leer ist
- Automatische Entfernung von "P"-Präfixen aus IDs
- Überspringen von leeren Parkplatz-Zeilen ohne Fehlerbehandlung (Platzhalter-Zeilen)
- Vollständige Übernahme aller relevanten Felder für Parkplätze
- Bessere Fehlerbehandlung und Debug-Ausgaben
- Korrekte Berechnung der Gesamtmiete aus allen Mietkomponenten
- Unterstützung verschiedener Trennzeichen: +, Komma, Semikolon, Leerzeichen









4. Block Miete


5. Block Vertragsdaten

## - Mandatsreferenz (automatisch erstellt aus Objekt-Kürzel + WE-ID + Lage + Nachname + Vorname, Ohne Sonderzeichen oder Leerzeichen hintereinander geschrieben z. B. TRIFTWE061OGBialowonsMichelle) mit der Möglichkeit das manuell zu ändern bei Bedarf. ✅ ERLEDIGT
## - Kaution (beim neuen Anlegen sollte hier automatisch die Kaltmiete * 3 eingetragen werden mit der Möglichkeit das zu ändern) ✅ ERLEDIGT

## - Wenn der Vertrag bereits beendet ist (siehe Vertragsende) sollte der noch nicht ausgezahlt Kautionsbetrag ebenfalls in roter Fettschrift angezeigt werden.✅ ERLEDIGT

Block 6 Abrechnungsdaten






 ## Es gibt insgesamt 19 Parkplätz. In der Startseitenübersicht sollte oben ein Feld bei der Triftstraße eingefügt werden das die freien Parkplätze anzeigt. Also ein Feld das berechnet wird aus 19 – Anzahl vermieteter Parkplätze.✅ ERLEDIGT



DATENimport

angepasstes automapping für pase und RITA zeitlich abgegrenzt erstellen

Fehlerüberprüfung

was passiert bei doppelten Datensätzen?


Startseite anpassen



