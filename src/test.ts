import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import schema from "./schema.json";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

// Configuration
const CONFIG = {
  urlTimeout: 10000, // 10 seconds
  skipUrlCheck: process.env.SKIP_URL_CHECK === "true",
};

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
  warnings?: string[];
}

interface ResourceContent {
  name: string;
  url: string;
  type: string;
  description: string;
  topics: string[];
  style: string;
  pricing: string;
  links?: Record<string, string>;
  introducer?: {
    github?: string;
    x?: string;
  };
}

// ============================================
// Schema Validation
// ============================================
function validateSchema(content: unknown): string[] {
  const valid = validate(content);
  if (!valid && validate.errors) {
    return validate.errors.map((err) => {
      const path = err.instancePath || "(root)";
      return `Schema: ${path} ${err.message}`;
    });
  }
  return [];
}

// ============================================
// File Naming Validation
// ============================================
function validateFileName(filePath: string): string[] {
  const errors: string[] = [];
  const fileName = basename(filePath);

  // Check for .json extension
  if (!fileName.endsWith(".json")) {
    errors.push(`FileName: File must have .json extension`);
  }

  // Check for kebab-case (lowercase letters, numbers, hyphens only)
  const nameWithoutExtension = fileName.replace(".json", "");
  const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  if (!kebabCaseRegex.test(nameWithoutExtension)) {
    errors.push(
      `FileName: "${fileName}" must be kebab-case (e.g., "my-resource.json")`,
    );
  }

  return errors;
}

// ============================================
// URL Validation
// ============================================
async function validateUrl(url: string): Promise<{
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for HTTPS
  if (url.startsWith("http://")) {
    warnings.push(`URL: "${url}" uses HTTP instead of HTTPS`);
  }

  // Check URL format
  try {
    new URL(url);
  } catch {
    errors.push(`URL: "${url}" is not a valid URL format`);
    return { errors, warnings };
  }

  // Skip actual URL check if disabled
  if (CONFIG.skipUrlCheck) {
    return { errors, warnings };
  }

  // Check if URL is accessible
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.urlTimeout);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // Try GET request if HEAD fails (some servers don't support HEAD)
      const getResponse = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(CONFIG.urlTimeout),
        redirect: "follow",
      });

      if (!getResponse.ok) {
        errors.push(`URL: "${url}" returned status ${getResponse.status}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errors.push(`URL: "${url}" request timed out`);
      } else {
        errors.push(`URL: "${url}" is not accessible (${error.message})`);
      }
    } else {
      errors.push(`URL: "${url}" is not accessible`);
    }
  }

  return { errors, warnings };
}

// ============================================
// Validate All URLs in Resource
// ============================================
async function validateAllUrls(content: ResourceContent): Promise<{
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate main URL
  const mainUrlResult = await validateUrl(content.url);
  errors.push(...mainUrlResult.errors);
  warnings.push(...mainUrlResult.warnings);

  // Validate optional links
  if (content.links) {
    for (const [key, url] of Object.entries(content.links)) {
      if (url) {
        const linkResult = await validateUrl(url);
        for (const error of linkResult.errors) {
          errors.push(error.replace("URL:", `URL (links.${key}):`));
        }
        for (const warning of linkResult.warnings) {
          warnings.push(warning.replace("URL:", `URL (links.${key}):`));
        }
      }
    }
  }

  return { errors, warnings };
}

// ============================================
// Duplicate Check
// ============================================
function checkDuplicates(
  resources: Map<string, ResourceContent>,
): Map<string, string[]> {
  const duplicateErrors = new Map<string, string[]>();
  const nameMap = new Map<string, string[]>();
  const urlMap = new Map<string, string[]>();

  for (const [filePath, content] of resources) {
    // Check name duplicates
    const nameLower = content.name.toLowerCase();
    if (nameMap.has(nameLower)) {
      nameMap.get(nameLower)!.push(filePath);
    } else {
      nameMap.set(nameLower, [filePath]);
    }

    // Check URL duplicates (normalize URL)
    const normalizedUrl = content.url.toLowerCase().replace(/\/$/, "");
    if (urlMap.has(normalizedUrl)) {
      urlMap.get(normalizedUrl)!.push(filePath);
    } else {
      urlMap.set(normalizedUrl, [filePath]);
    }
  }

  // Report name duplicates
  for (const [name, files] of nameMap) {
    if (files.length > 1) {
      for (const file of files) {
        const existing = duplicateErrors.get(file) || [];
        existing.push(
          `Duplicate: Resource name "${name}" also exists in: ${files.filter((f) => f !== file).join(", ")}`,
        );
        duplicateErrors.set(file, existing);
      }
    }
  }

  // Report URL duplicates
  for (const [url, files] of urlMap) {
    if (files.length > 1) {
      for (const file of files) {
        const existing = duplicateErrors.get(file) || [];
        existing.push(
          `Duplicate: URL "${url}" also exists in: ${files.filter((f) => f !== file).join(", ")}`,
        );
        duplicateErrors.set(file, existing);
      }
    }
  }

  return duplicateErrors;
}

// ============================================
// Validate Single JSON File
// ============================================
async function validateJsonFile(
  filePath: string,
  checkUrls: boolean = true,
): Promise<{ result: ValidationResult; content?: ResourceContent }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate file naming
  const fileNameErrors = validateFileName(filePath);
  errors.push(...fileNameErrors);

  // Load and parse JSON
  let content: ResourceContent;
  try {
    const file = Bun.file(filePath);
    content = await file.json();
  } catch (error) {
    return {
      result: {
        file: filePath,
        valid: false,
        errors: [
          `JSON Parse Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      },
    };
  }

  // Schema validation
  const schemaErrors = validateSchema(content);
  errors.push(...schemaErrors);

  // If schema is invalid, skip other validations
  if (schemaErrors.length > 0) {
    return {
      result: {
        file: filePath,
        valid: false,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      content,
    };
  }

  // URL validation (optional, can be slow)
  if (checkUrls) {
    const urlResult = await validateAllUrls(content);
    errors.push(...urlResult.errors);
    warnings.push(...urlResult.warnings);
  }

  return {
    result: {
      file: filePath,
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    content,
  };
}

// ============================================
// Main Test Runner
// ============================================
async function runTests(): Promise<void> {
  const sitesDir = join(import.meta.dir, "../sites");
  const jsonFiles = await getAllJsonFiles(sitesDir);

  if (jsonFiles.length === 0) {
    console.log("⚠️  No JSON files found in sites directory");
    process.exit(0);
  }

  console.log(`🔍 Validating ${jsonFiles.length} JSON file(s)...\n`);

  if (CONFIG.skipUrlCheck) {
    console.log(
      "⏭️  URL accessibility check is SKIPPED (SKIP_URL_CHECK=true)\n",
    );
  }

  const results: ValidationResult[] = [];
  const resources = new Map<string, ResourceContent>();
  let passCount = 0;
  let failCount = 0;
  let warningCount = 0;

  // First pass: validate each file individually
  for (const filePath of jsonFiles) {
    const { result, content } = await validateJsonFile(
      filePath,
      !CONFIG.skipUrlCheck,
    );
    results.push(result);

    if (content) {
      resources.set(filePath, content);
    }

    const relativePath = filePath.replace(sitesDir + "/", "");

    if (result.valid) {
      if (result.warnings && result.warnings.length > 0) {
        console.log(`⚠️  ${relativePath}`);
        for (const warn of result.warnings) {
          console.log(`   ${warn}`);
        }
        warningCount++;
      } else {
        console.log(`✅ ${relativePath}`);
      }
      passCount++;
    } else {
      console.log(`❌ ${relativePath}`);
      for (const err of result.errors ?? []) {
        console.log(`   ${err}`);
      }
      if (result.warnings) {
        for (const warn of result.warnings) {
          console.log(`   ⚠️  ${warn}`);
        }
      }
      failCount++;
    }
  }

  // Second pass: check for duplicates across all files
  console.log("\n🔎 Checking for duplicates...");
  const duplicateErrors = checkDuplicates(resources);

  if (duplicateErrors.size > 0) {
    console.log("\n❌ Duplicate entries found:\n");
    for (const [filePath, errors] of duplicateErrors) {
      const relativePath = filePath.replace(sitesDir + "/", "");
      console.log(`   ${relativePath}:`);
      for (const err of errors) {
        console.log(`      ${err}`);
      }
      // Mark as failed if not already
      const existingResult = results.find((r) => r.file === filePath);
      if (existingResult && existingResult.valid) {
        existingResult.valid = false;
        existingResult.errors = errors;
        passCount--;
        failCount++;
      }
    }
  } else {
    console.log("   ✅ No duplicates found");
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Results:`);
  console.log(`   ✅ Passed: ${passCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⚠️  Warnings: ${warningCount}`);
  console.log("=".repeat(50));

  if (failCount > 0) {
    console.log("\n💡 Tips:");
    console.log(
      "   - Ensure file names are kebab-case (e.g., my-resource.json)",
    );
    console.log("   - Check that all URLs are accessible and use HTTPS");
    console.log("   - Verify your JSON matches the schema requirements");
    process.exit(1);
  }

  console.log("\n🎉 All files are valid!");
}

runTests().catch((error) => {
  console.error("❌ Test runner error:", error);
  process.exit(1);
});
