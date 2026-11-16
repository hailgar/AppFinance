const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createRequire } = require("node:module");
const path = require("node:path");
const { checkNativeModules } = require("../check_expo_native_versions.cjs");
const mobile = path.resolve(__dirname, "../../mobile");
const expoRequire = createRequire(
  require.resolve("expo/package.json", { paths: [mobile] }),
);
const { satisfies } = expoRequire("semver");
const bundled = { "expo-font": "~55.0.8" };
const resolved = (version) => ({
  modules: [{ packageName: "expo-font", packageVersion: version }],
});
const searched = (version, duplicates = []) => ({
  "expo-font": { version, duplicates },
});

test("accepts the compatible native resolution", () => {
  assert.deepEqual(
    checkNativeModules(
      resolved("55.0.8"),
      searched("55.0.8"),
      bundled,
      satisfies,
    ),
    [],
  );
});

test("rejects the incompatible transitive peer missed by the direct-dependency check", () => {
  const failures = checkNativeModules(
    resolved("58.0.12"),
    searched("58.0.12"),
    bundled,
    satisfies,
  );
  assert.match(failures.join("\n"), /expo-font@58\.0\.12.*~55\.0\.8/);
});

test("rejects duplicate native installations even when both satisfy the SDK range", () => {
  const failures = checkNativeModules(
    resolved("55.0.8"),
    searched("55.0.8", [{ version: "55.0.8" }]),
    bundled,
    satisfies,
  );
  assert.match(
    failures.join("\n"),
    /Duplicate native installations: expo-font/,
  );
});

test("cannot pass on malformed or empty autolinking output", () => {
  for (const result of [{}, { modules: [] }]) {
    assert.throws(
      () => checkNativeModules(result, {}, bundled, satisfies),
      /did not return/,
    );
  }
  assert.match(
    checkNativeModules(resolved("55.0.8"), {}, bundled, satisfies).join("\n"),
    /Missing native search/,
  );
});
