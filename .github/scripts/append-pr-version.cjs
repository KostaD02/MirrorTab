const fs = require('fs');
const path = require('path');

const prNumber = process.env.PR_NUMBER;

if (!prNumber) {
  console.error('No PR_NUMBER provided.');
  process.exit(1);
}

const packageJsonPath = path.resolve(__dirname, '../../package.json');
const pkg = require(packageJsonPath);

pkg.version = `${pkg.version}.${prNumber}`;

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated package version to ${pkg.version}`);
