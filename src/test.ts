import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import schema from "./schema.json";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

async function getAllJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const jsonFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".json")) {
      jsonFiles.push(fullPath);
    } else if (entry.isDirectory()) {
      const nestedFiles = await getAllJsonFiles(fullPath);
      jsonFiles.push(...nestedFiles);
    }
  }

  return jsonFiles;
}

interface ValidationResult {
  file: string;
  valid: boolean;
  errors?: string[];
}

async function validateJsonFile(filePath: string): Promise<ValidationResult> {
  const file = Bun.file(filePath);
  const content = await file.json();

  const valid = validate(content);

  if (!valid && validate.errors) {
    return {
      file: filePath,
      valid: false,
      errors: validate.errors.map((err) => {
        const path = err.instancePath || "(root)";
        return `  ${path}: ${err.message}`;
      }),
    };
  }

  return { file: filePath, valid: true };
}

async function runTests(): Promise<void> {
  const sitesDir = join(import.meta.dir, "../sites");
  const jsonFiles = await getAllJsonFiles(sitesDir);

  if (jsonFiles.length === 0) {
    console.log("⚠️  No JSON files found in sites directory");
    process.exit(0);
  }

  console.log(
    `🔍 Validating ${jsonFiles.length} JSON file(s) against schema...\n`,
  );

  const results: ValidationResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const filePath of jsonFiles) {
    const result = await validateJsonFile(filePath);
    results.push(result);

    const relativePath = filePath.replace(sitesDir + "/", "");

    if (result.valid) {
      console.log(`✅ ${relativePath}`);
      passCount++;
    } else {
      console.log(`❌ ${relativePath}`);
      result.errors?.forEach((err) => console.log(err));
      failCount++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Results: ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }

  console.log("\n🎉 All files are valid!");
}

runTests().catch((error) => {
  console.error("❌ Test runner error:", error);
  process.exit(1);
});
