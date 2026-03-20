import path from "node:path";
import fs from "node:fs";
import { validateDir, prettyJson } from "./file-utils.js";

export default function generatePackageJson(
  targetDir = process.cwd(),
  {
    isTS = true,
    force = false,
    dependencies = {},
    devDependencies = {},
  } = {},
) {
  validateDir(targetDir);

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
    dependencies: { ...dependencies },
    devDependencies: { ...devDependencies },
  };

  fs.writeFileSync(pkgPath, prettyJson(pkg));

  return pkg;
}

