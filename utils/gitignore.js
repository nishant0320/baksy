import path from "node:path";
import { validateDir, writeFileIfNeeded } from "./file-utils.js";

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

  validateDir(targetDir);

  if (!TEMPLATES[template]) {
    throw new Error(`Unsupported gitignore template: ${template}`);
  }

  if (!writeFileIfNeeded(gitignorePath, TEMPLATES[template], force)) {
    console.log(".gitignore already exists.");
    return false;
  }

  console.log(`.gitignore generated (${template})`);
  return true;
}
