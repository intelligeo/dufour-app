/**
 * Basic test for milsymbol-server
 * Run: node test.js
 */
const http = require("http");

const BASE = `http://localhost:${process.env.MILSYMBOL_PORT || 2525}`;

const tests = [
  // Health check
  { name: "Health check", path: "/health", expect: 200, type: "application/json" },

  // APP-6D SVG (20-char SIDC: friendly ground infantry company)
  { name: "APP-6D SVG", path: "/10031000001101001500.svg", expect: 200, type: "image/svg+xml" },

  // 2525C SVG (15-char legacy)
  { name: "2525C SVG", path: "/SFG-UCI---.svg", expect: 200, type: "image/svg+xml" },

  // 2525C PNG with modifiers
  { name: "2525C PNG + modifiers", path: "/SFG-UCI---.png?uniqueDesignation=BA01&size=80", expect: 200, type: "image/png" },

  // APP-6D PNG (hostile air fighter)
  { name: "APP-6D Air PNG", path: "/10061000001101000000.png", expect: 200, type: "image/png" },

  // Invalid SIDC
  { name: "Invalid SIDC", path: "/INVALID.svg", expect: 400, type: "application/json" },

  // No format extension
  { name: "No format", path: "/SFG-UCI---", expect: 400, type: "application/json" },

  // Unsupported format
  { name: "Bad format", path: "/SFG-UCI---.gif", expect: 400, type: "application/json" },
];

let passed = 0;
let failed = 0;

async function runTest(test) {
  return new Promise((resolve) => {
    http.get(`${BASE}${test.path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const statusOk = res.statusCode === test.expect;
        const typeOk = res.headers["content-type"]?.includes(test.type);
        const ok = statusOk && typeOk;
        
        if (ok) {
          passed++;
          console.log(`  ✅ ${test.name} (${res.statusCode}, ${res.headers["content-type"]})`);
        } else {
          failed++;
          console.log(`  ❌ ${test.name}: expected ${test.expect}/${test.type}, got ${res.statusCode}/${res.headers["content-type"]}`);
        }
        resolve();
      });
    }).on("error", (err) => {
      failed++;
      console.log(`  ❌ ${test.name}: ${err.message}`);
      resolve();
    });
  });
}

async function main() {
  console.log(`\n🧪 Milsymbol Server Tests (${BASE})\n`);
  
  for (const test of tests) {
    await runTest(test);
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
