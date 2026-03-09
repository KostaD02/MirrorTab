const fs = require('fs');
const path = require('path');

const prNumber = process.env.PR_NUMBER;

if (!prNumber) {
  console.error('Missing PR_NUMBER');
  process.exit(1);
}

const packageJsonPath = path.resolve(__dirname, '../../package.json');
const pkg = require(packageJsonPath);

const prNumSafe = parseInt(prNumber, 10) || 0;
const modifier = Math.min(65535, prNumSafe);

pkg.version = `${pkg.version}.${modifier}`;

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated package version to ${pkg.version}`);
