const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

esbuild.build({
  entryPoints: [path.resolve(__dirname, "src", "entry", "index.js")],
  outfile: "dist/logstyx-js-node.js",
  platform: "node",
  format: "cjs",
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ["es2015"]
}).then(() => {
  // Copy register.js to dist (unbundled)
  const registerSrc = path.resolve(__dirname, "src", "register.js");
  const registerDest = path.resolve(__dirname, "dist", "register.js");
  
  fs.copyFileSync(registerSrc, registerDest);
  console.log("✓ Built logstyx-js-node.js");
  console.log("✓ Copied register.js");
}).catch(() => process.exit(1));