import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureStorage(projectRoot) {
  await Promise.all([
    mkdir(path.join(projectRoot, "data", "drafts"), { recursive: true }),
    mkdir(path.join(projectRoot, "data", "scripts"), { recursive: true }),
    mkdir(path.join(projectRoot, "data", "jobs"), { recursive: true }),
    mkdir(path.join(projectRoot, "media", "uploads"), { recursive: true }),
    mkdir(path.join(projectRoot, "exports"), { recursive: true })
  ]);
}

export async function deleteJson(filePath) {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function saveJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return value;
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function listJson(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  const values = await Promise.all(files.map((entry) => readJson(path.join(directory, entry.name))));
  return values.filter(Boolean);
}
