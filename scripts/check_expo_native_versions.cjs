// Expo's direct-dependency check can miss incompatible transitive native peers.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

function checkNativeModules(resolved, searched, bundled, satisfies) {
  if (
    !Array.isArray(resolved?.modules) ||
    !resolved.modules.length ||
    !searched ||
    typeof searched !== "object" ||
    Array.isArray(searched)
  ) {
    throw new Error("Autolinking did not return native module results.");
  }
  const failures = [];
  const names = new Set();
  for (const module of resolved.modules) {
    const { packageName: name, packageVersion: version } = module;
    if (!name || !version || names.has(name)) {
      failures.push(
        "Malformed or repeated resolved native module: " + (name || "unknown"),
      );
      continue;
    }
    names.add(name);
    if (!searched[name]) failures.push("Missing native search result: " + name);
    const range = bundled[name];
    if (range && !satisfies(version, range)) {
      failures.push(
        `${name}@${version} does not satisfy installed Expo SDK range ${range}`,
      );
    }
  }
  for (const [name, module] of Object.entries(searched)) {
    if (module.duplicates?.length) {
      failures.push(
        `Duplicate native installations: ${name} (${[module.version, ...module.duplicates.map((item) => item.version)].join(", ")})`,
      );
    }
  }
  return failures;
}

function main() {
  const mobile = path.resolve(__dirname, "../mobile");
  const expo = require.resolve("expo/package.json", { paths: [mobile] });
  const expoRequire = createRequire(expo);
  const semver = expoRequire("semver");
  const bundled = JSON.parse(
    readFileSync(
      path.join(path.dirname(expo), "bundledNativeModules.json"),
      "utf8",
    ),
  );
  const autolinking = require.resolve("expo-modules-autolinking/package.json", {
    paths: [mobile],
  });
  const bin = JSON.parse(readFileSync(autolinking, "utf8")).bin[
    "expo-modules-autolinking"
  ];
  const cli = path.resolve(path.dirname(autolinking), bin);
  const run = (command) => {
    try {
      return JSON.parse(
        execFileSync(
          process.execPath,
          [cli, command, "--platform", "android", "--json"],
          {
            cwd: mobile,
            encoding: "utf8",
            timeout: 60000,
            maxBuffer: 8 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      );
    } catch {
      throw new Error(
        `Native autolinking ${command} failed; run the corresponding Expo autolinking command for details.`,
      );
    }
  };
  const failures = checkNativeModules(
    run("resolve"),
    run("search"),
    bundled,
    semver.satisfies,
  );
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(
    "Android autolinking: Expo native versions match the installed SDK; no duplicate installations.",
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("Native compatibility check failed: " + error.message);
    process.exitCode = 1;
  }
}
module.exports = { checkNativeModules };
