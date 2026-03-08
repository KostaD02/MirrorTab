const fs = require('fs');
const path = require('path');

const prNumber = process.env.PR_NUMBER;
const prCommitCount = process.env.PR_COMMIT_COUNT;

if (!prNumber || !prCommitCount) {
  console.error('Missing PR_NUMBER or PR_COMMIT_COUNT.');
  process.exit(1);
}

const packageJsonPath = path.resolve(__dirname, '../../package.json');
const pkg = require(packageJsonPath);

pkg.version = `${pkg.version}.${prNumber}.${prCommitCount}`;

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated package version to ${pkg.version}`);
