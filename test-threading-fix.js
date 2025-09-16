// Test manual della nuova threading logic per verificare il fix
// Simula i dati reali dal database per testare il new ordering logic

// Simulated data from database (rappresentativo dei dati reali)
const testCases = [
  {
    name: "Outlook newest-first (File Swagger)",
    messageId: "VI0P190MB241858856EA95A15A893C68DC83BA@VI0P190MB2418.EURP190.PROD.OUTLOOK.COM",
    inReplyTo: "AM9P190MB1603711EAD214FF3042FD9708C42A@AM9P190MB1603.EURP190.PROD.OUTLOOK.COM", 
    references: [
      "AM8P190MB0993BE7A83511143D7A87393AC77A@AM8P190MB0993.EURP190.PROD.OUTLOOK.COM",
      "AM8P190MB0881C837EE42FCED3B65148BBD77A@AM8P190MB0881.EURP190.PROD.OUTLOOK.COM",
      "VI1P190MB06077ECC6BEAAC371FED42D4C877A@VI1P190MB0607.EURP190.PROD.OUTLOOK.COM",
      "AM9P190MB1603711EAD214FF3042FD9708C42A@AM9P190MB1603.EURP190.PROD.OUTLOOK.COM"  // inReplyTo is LAST (newest-first)
    ]
  },
  {
    name: "Virgilio oldest-first (QM task)",
    messageId: "VI0P190MB2418714B04CBEE3EEA450B1CC83BA@VI0P190MB2418.EURP190.PROD.OUTLOOK.COM",
    inReplyTo: "2020867823.2590349.1756308222004@mail1.virgilio.it",
    references: [
      "1591097746.2407869.1756116920757@mail1.virgilio.it",  // ROOT (oldest)
      "PAXPR04MB87013BEFD44CD72530ABFC15833EA@PAXPR04MB8701.eurprd04.prod.outlook.com",
      "909500376.2541283.1756286525921@mail1.virgilio.it",
      "2020867823.2590349.1756308222004@mail1.virgilio.it"   // inReplyTo is LAST (oldest-first)
    ]
  }
];

// Implementazione nuova logica (copy from ThreadingService fix)
function generateThreadIdNew(messageId, inReplyTo, references, subject) {
  // Detect References ordering using inReplyTo as anchor and pick correct root
  let baseId = null;
  
  if (references.length > 0) {
    if (inReplyTo && references.includes(inReplyTo)) {
      // Use inReplyTo as anchor to detect ordering
      if (references[0] === inReplyTo) {
        // Newest-first ordering (Outlook style) → root is last
        baseId = references[references.length - 1];
        console.log(`  → Detected newest-first (inReplyTo at start), root: ${baseId}`);
      } else if (references[references.length - 1] === inReplyTo) {
        // Oldest-first ordering (traditional) → root is first
        baseId = references[0];
        console.log(`  → Detected oldest-first (inReplyTo at end), root: ${baseId}`);
      } else {
        // inReplyTo is somewhere in middle → use last reference as root (newest-first fallback)
        baseId = references[references.length - 1];
        console.log(`  → inReplyTo in middle, fallback to last: ${baseId}`);
      }
    } else {
      // No reliable anchor → assume newest-first (covers common Outlook clients)
      baseId = references[references.length - 1];
      console.log(`  → No anchor, assume newest-first: ${baseId}`);
    }
  }
  
  // Fallback chain: references → inReplyTo → messageId
  if (!baseId) {
    baseId = inReplyTo || messageId;
    console.log(`  → Fallback to: ${baseId}`);
  }
  
  // Create stable thread ID (simplified - just use first 16 chars for test)
  return baseId.substring(0, 16);
}

// Test old logic (buggy)
function generateThreadIdOld(messageId, inReplyTo, references) {
  let baseId = references.length > 0 ? references[0] : (inReplyTo || messageId);
  return baseId.substring(0, 16);
}

console.log("🧪 TESTING THREADING FIX\n");

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`  messageId: ${testCase.messageId.substring(0, 40)}...`);
  console.log(`  inReplyTo: ${testCase.inReplyTo.substring(0, 40)}...`);
  console.log(`  references count: ${testCase.references.length}`);
  
  const oldThreadId = generateThreadIdOld(testCase.messageId, testCase.inReplyTo, testCase.references);
  const newThreadId = generateThreadIdNew(testCase.messageId, testCase.inReplyTo, testCase.references);
  
  console.log(`  OLD (buggy): ${oldThreadId}`);
  console.log(`  NEW (fixed): ${newThreadId}`);
  console.log(`  DIFFERENT: ${oldThreadId !== newThreadId ? '✅ YES' : '❌ NO'}\n`);
});

console.log("🎯 Expected: Both test cases should show DIFFERENT=YES for the fix to work");