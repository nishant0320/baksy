import fs from "node:fs";
import path from "node:path";

const TEMPLATES = {
  node: `# Node
node_modules/
dist/
build/
.env
.env.*
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.DS_Store
coverage/
`,
  nextjs: `# Next.js
node_modules/
.next/
out/
build/
.env
.env.*
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.DS_Store
coverage/
.vercel
`,
};

export default function gitignore({
  force = false,
  targetDir = process.cwd(),
  template = "node",
} = {}) {
  const gitignorePath = path.join(targetDir, ".gitignore");

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }

  if (fs.existsSync(gitignorePath) && !force) {
    console.log(".gitignore already exists.");
    return false;
  }

  if (!TEMPLATES[template]) {
    throw new Error(`Unsupported gitignore template: ${template}`);
  }

  fs.writeFileSync(gitignorePath, TEMPLATES[template], "utf8");

  console.log(`.gitignore generated (${template})`);
  return true;
}
