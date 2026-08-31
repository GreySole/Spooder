// Warns about integration modules whose folder is present but empty - the state a clone left
// in by `git clone` without `--recursive`, since each src/integration/* module is its own
// repo brought in as a submodule.
//
// This warns rather than fails on purpose. Core compiles and runs without any given module
// (ModuleService discovers whatever is on disk at startup), so an uninitialized submodule is
// a Spooder missing a feature, not a broken build - and CI deliberately builds this way to
// prove core stays independent of the modules. The cost of staying quiet would be someone
// wondering where their Twitch tab went, so say it plainly and print the fix.
//
// Stale build output is the other half of the same problem. tsc only ever adds to dist, and
// ModuleService scans dist/integration at runtime, so a module that is no longer checked out
// would go on loading from a previous build's leftovers - a feature that will not die, and a
// confusing thing to debug. Clearing those folders here, before tsc runs, keeps dist matching
// src instead of accumulating whatever used to be there.
const fs = require('fs');
const path = require('path');

const integrationDir = path.join(__dirname, '../src/integration');
const distIntegrationDir = path.join(__dirname, '../dist/integration');

if (!fs.existsSync(integrationDir)) {
  process.exit(0);
}

// A module counts as checked out once its manifest is there - the same file ModuleService
// looks for, and the one thing every module has regardless of what it is called inside.
function isCheckedOut(name) {
  return fs.existsSync(path.join(integrationDir, name, 'package.json'));
}

function subdirectoriesOf(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

const uninitialized = subdirectoriesOf(integrationDir).filter((name) => !isCheckedOut(name));

if (uninitialized.length > 0) {
  console.warn('');
  console.warn(`Integration modules not checked out: ${uninitialized.join(', ')}`);
  console.warn('Spooder will build and run without them, just without those features.');
  console.warn('To fetch them:  git submodule update --init --recursive');
  console.warn('');
}

if (fs.existsSync(distIntegrationDir)) {
  const stale = subdirectoriesOf(distIntegrationDir).filter((name) => !isCheckedOut(name));
  for (const name of stale) {
    fs.rmSync(path.join(distIntegrationDir, name), { recursive: true, force: true });
    console.warn(`Removed stale build output for '${name}' from dist/integration`);
  }
}
