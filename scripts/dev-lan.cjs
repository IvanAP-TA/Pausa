/* `npm run dev:lan`: the dev server reachable from a phone on the same Wi-Fi.
 * It finds this computer's LAN address, tells Better Auth and Next to accept it, and prints the URL to open on the phone. */
const os = require("os");
const { spawn } = require("child_process");

const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal);
// Prefer private home/office ranges over virtual adapters (WSL, Docker, VPN).
const rank = (a) => (a.startsWith("192.168.") ? 0 : a.startsWith("10.") ? 1 : a.startsWith("172.") ? 3 : 2);
const ip = nets.map((n) => n.address).sort((a, b) => rank(a) - rank(b))[0];
if (!ip) { console.error("No LAN address found. Are you connected to Wi-Fi?"); process.exit(1); }

const port = process.env.PORT || "3000";
console.log(`\n  Open on the phone (same Wi-Fi):  http://${ip}:${port}/it/sign-in\n`);
console.log("  If it does not load: allow Node.js through the Windows firewall for private networks.");
console.log("  Note: Web Push and 'Add to Home Screen' need HTTPS, so test those on the deployed site.\n");

const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BETTER_AUTH_URL: `http://${ip}:${port}`, DEV_ORIGINS: ip },
});
child.on("exit", (code) => process.exit(code ?? 0));
