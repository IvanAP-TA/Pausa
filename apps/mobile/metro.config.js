// Metro for a project whose shared code lives next to it: packages/messages (JSON) and packages/api-types (types only).
// The repo root only holds wrangler (tooling), so nothing is resolved from there.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const packages = path.resolve(__dirname, "../../packages");

config.watchFolders = [...(config.watchFolders ?? []), packages];
// Only this app's node_modules: a package under ../../packages must not pull react from the root tree.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
