import path from 'path';
import fs from 'fs';

const artifactPath = path.resolve(
  __dirname,
  '../artifacts/contracts/Voting.sol/Voting.json'
);
const destPath = path.resolve(__dirname, '../../frontend/src/contracts/Voting.json');

if (!fs.existsSync(artifactPath)) {
  console.error('Artifact not found. Run "npm run compile" first.');
  process.exit(1);
}

const destDir = path.dirname(destPath);
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(artifactPath, destPath);
console.log(`ABI+bytecode exported to ${destPath}`);
