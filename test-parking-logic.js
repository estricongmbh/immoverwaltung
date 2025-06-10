// Test für die Parkplatz-ID-Extraktion
console.log("=== TEST: Parkplatz-ID-Extraktion ===");

function extractParkingIds(input) {
    if (!input) return [];
    
    return input
        .split(/[+,;\s]+/)
        .map(id => id.trim())
        .filter(id => id !== '' && /^\d+$/.test(id));
}

// Test-Cases
const testCases = [
    "14+15",
    "2+9", 
    "13",
    "6",
    "4",
    "",
    "P14+P15",
    "14 + 15",
    "14,15",
    "14;15"
];

testCases.forEach(testCase => {
    const result = extractParkingIds(testCase);
    console.log(`Input: "${testCase}" -> Output:`, result);
});

console.log("=== TEST ENDE ===");
