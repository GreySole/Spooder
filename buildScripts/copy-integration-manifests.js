// Copies package.json from each src/integration/* subdirectory into the
// compiled dist/integration/* output after `tsc` runs.
const fs = require('fs');
const path = require('path');

const srcIntegrationDir = path.join(__dirname, '../src/integration');
const distIntegrationDir = path.join(__dirname, '../dist/integration');

const entries = fs.readdirSync(srcIntegrationDir);
for (const entry of entries) {
  const srcPkg = path.join(srcIntegrationDir, entry, 'package.json');
  if (!fs.existsSync(srcPkg)) continue;

  const destDir = path.join(distIntegrationDir, entry);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcPkg, path.join(destDir, 'package.json'));
  console.log(`Copied integration/${entry}/package.json`);
}
