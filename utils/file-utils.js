import fs from "node:fs";

export function validateDir(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }
}

export function writeFileIfNeeded(filePath, content, force, encoding = "utf8") {
  if (!fs.existsSync(filePath) || force) {
    fs.writeFileSync(filePath, content, encoding);
    return true;
  }
  return false;
}

export function prettyJson(obj) {
  return JSON.stringify(obj, null, 2);
}
