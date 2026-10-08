const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dependency = 'brace-expansion';
const sourceDir = path.join(root, 'node_modules', dependency);
const targetDir = path.join(
  root,
  'node_modules',
  'aws-cdk-lib',
  'node_modules',
  dependency,
);
const lockPath = path.join(root, 'package-lock.json');
const lockKey = `node_modules/aws-cdk-lib/node_modules/${dependency}`;

function readVersion(directory) {
  return JSON.parse(
    fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
  ).version;
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

if (!fs.existsSync(targetDir)) {
  process.exit(0);
}

const sourceVersion = readVersion(sourceDir);
const targetVersion = readVersion(targetDir);
const effectiveVersion =
  compareVersions(targetVersion, sourceVersion) >= 0
    ? targetVersion
    : sourceVersion;

if (effectiveVersion !== targetVersion) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  console.log(
    `Patched aws-cdk-lib bundled ${dependency} to ${effectiveVersion}.`,
  );
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const lockEntry = lock.packages && lock.packages[lockKey];

if (lockEntry && compareVersions(lockEntry.version, effectiveVersion) < 0) {
  lockEntry.version = effectiveVersion;
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
