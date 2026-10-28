import { readFile, writeFile } from "node:fs/promises";

const packagePath = new URL("../package.json", import.meta.url);
const lockPath = new URL("../package-lock.json", import.meta.url);
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const packageLock = JSON.parse(await readFile(lockPath, "utf8"));
const current = packageJson.version.split(".").map(Number);
const requested = process.argv[2] ?? "patch";

if (current.length !== 3 || current.some((part) => !Number.isInteger(part) || part < 0)) {
  throw new Error(`Invalid current package version: ${packageJson.version}`);
}
if (current[1] > 999 || current[2] > 999) {
  throw new Error("Android versionCode requires minor and patch components below 1000.");
}

if (["major", "minor", "patch"].includes(requested)) {
  const [major, minor, patch] = current;
  const next =
    requested === "major"
      ? [major + 1, 0, 0]
      : requested === "minor"
        ? [major, minor + 1, 0]
        : [major, minor, patch + 1];
  packageJson.version = next.join(".");
} else if (/^\d+\.\d+\.\d+$/.test(requested)) {
  packageJson.version = requested;
} else {
  throw new Error("Usage: npm run version:bump -- [major|minor|patch|x.y.z]");
}
const [major, minor, patch] = packageJson.version.split(".").map(Number);
if (minor > 999 || patch > 999 || major * 1_000_000 + minor * 1000 + patch > 2_147_483_647) {
  throw new Error("The requested version cannot be represented as an Android versionCode.");
}

await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
packageLock.version = packageJson.version;
if (packageLock.packages?.[""]) packageLock.packages[""].version = packageJson.version;
await writeFile(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
console.log(
  `Version set to ${packageJson.version}; Android versionCode/versionName derive from this value.`,
);
