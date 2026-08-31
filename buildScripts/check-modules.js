// Warns about integration modules whose folder is present but empty - the state a clone left
// in by `git clone` without `--recursive`, since each src/integration/* module is its own
// repo brought in as a submodule.
//
// This warns rather than fails on purpose. Core compiles and runs without any given module
// (ModuleService discovers whatever is on disk at startup), so an uninitialized submodule is
// a Spooder missing a feature, not a broken build - and CI deliberately builds this way to
// prove core stays independent of the modules. The cost of staying quiet would be someone
// wondering where their Twitch tab went, so say it plainly and print the fix.
const fs = require('fs');
const path = require('path');

const integrationDir = path.join(__dirname, '../src/integration');

if (!fs.existsSync(integrationDir)) {
  process.exit(0);
}

const uninitialized = fs
  .readdirSync(integrationDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => !fs.existsSync(path.join(integrationDir, entry.name, 'package.json')))
  .map((entry) => entry.name);

if (uninitialized.length > 0) {
  console.warn('');
  console.warn(`Integration modules not checked out: ${uninitialized.join(', ')}`);
  console.warn('Spooder will build and run without them, just without those features.');
  console.warn('To fetch them:  git submodule update --init --recursive');
  console.warn('');
}
