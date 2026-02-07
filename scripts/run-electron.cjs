const { spawn } = require("node:child_process");

// The npm "electron" package exports the path to the Electron executable.
const electronPath = require("electron");

const appPath = process.argv[2] || ".";
const extraArgs = process.argv.slice(3);

const env = { ...process.env };
// This repo's environment has ELECTRON_RUN_AS_NODE=1, which breaks running a GUI app.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appPath, ...extraArgs], {
  stdio: "inherit",
  env,
  windowsHide: false
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

