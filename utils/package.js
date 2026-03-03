import path from "node:path";
import fs from "node:fs";

export default function generatePackageJson(
  targetDir=process.cwd(),
  { isTS = true, force = false } = {},
) {
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }

  const pkgPath = path.join(targetDir, "package.json");

  if (fs.existsSync(pkgPath) && !force) {
    throw new Error("package.json already exists.");
  }

  const name = path.basename(path.resolve(targetDir));

  const pkg = {
    name,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts:
      isTS ?
        {
          dev: "ts-node-dev --respawn src/index.ts",
          build: "tsc",
          start: "node dist/index.js",
        }
      : {
          dev: "nodemon src/index.js",
          start: "node src/index.js",
        },
    dependencies: {},
    devDependencies: {},
  };

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  return pkg;
}

