import fs from "node:fs";
import path from "node:path";

const PRETTIER_RC = {
  semi: true,
  singleQuote: false,
  jsxSingleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",
  quoteProps: "as-needed",
  proseWrap: "preserve",
  htmlWhitespaceSensitivity: "css",
  embeddedLanguageFormatting: "auto",
  insertPragma: false,
  requirePragma: false,
};

const PRETTIER_IGNORE = `# dependencies
node_modules
.pnp
.pnp.js

# build output
dist
build
.next
out
coverage

# logs
*.log

# env files
.env
.env.*
!.env.example

# lock files
package-lock.json
yarn.lock
pnpm-lock.yaml

# misc
.DS_Store
.idea
.vscode
`;

function writeFileIfNeeded(filePath, content, force) {
  if (!fs.existsSync(filePath) || force) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

export default function prettier({
  rc = true,
  ignore = true,
  force = false,
  dir = process.cwd(),
} = {}) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const results = {
    rc: false,
    ignore: false,
  };

  if (rc) {
    const rcPath = path.join(dir, ".prettierrc");
    results.rc = writeFileIfNeeded(
      rcPath,
      JSON.stringify(PRETTIER_RC, null, 2),
      force,
    );
  }

  if (ignore) {
    const ignorePath = path.join(dir, ".prettierignore");
    results.ignore = writeFileIfNeeded(
      ignorePath,
      PRETTIER_IGNORE,
      force,
    );
  }

  return results;
}