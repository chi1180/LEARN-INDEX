import { existsSync } from "node:fs";
import { join } from "node:path";

const SITES_DIR = join(import.meta.dir, "../sites");
const STARTER_TEMPLATE_PATH = join(import.meta.dir, "starter-site.json");

function toKebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validateFileName(name: string): { valid: boolean; message?: string } {
  const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  if (!kebabCaseRegex.test(name)) {
    return {
      valid: false,
      message: `Invalid file name "${name}". Must be kebab-case (e.g., "my-resource")`,
    };
  }

  return { valid: true };
}

async function loadStarterTemplate(): Promise<string> {
  const file = Bun.file(STARTER_TEMPLATE_PATH);

  if (!(await file.exists())) {
    console.error(`❌ Starter template not found at: ${STARTER_TEMPLATE_PATH}`);
    process.exit(1);
  }

  return await file.text();
}

async function createNewSite(fileName: string): Promise<void> {
  // Normalize file name
  let normalizedName = fileName;

  // Remove .json extension if provided
  if (normalizedName.endsWith(".json")) {
    normalizedName = normalizedName.slice(0, -5);
  }

  // Convert to kebab-case
  normalizedName = toKebabCase(normalizedName);

  // Validate file name
  const validation = validateFileName(normalizedName);
  if (!validation.valid) {
    console.error(`❌ ${validation.message}`);
    process.exit(1);
  }

  const filePath = join(SITES_DIR, `${normalizedName}.json`);

  // Check if file already exists
  if (existsSync(filePath)) {
    console.error(`❌ File already exists: ${filePath}`);
    process.exit(1);
  }

  // Load and write starter template
  const template = await loadStarterTemplate();
  await Bun.write(filePath, template);

  console.log(`✨ Created new site file: sites/${normalizedName}.json`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Edit the file to add your resource details`);
  console.log(`   2. Run "bun run test" to validate your changes`);
  console.log(`   3. Create a Pull Request`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: bun run new-site <name-of-jsonfile>");
    console.log("");
    console.log("Examples:");
    console.log("  bun run new-site my-awesome-resource");
    console.log("  bun run new-site my-awesome-resource.json");
    console.log("  bun run new-site 'My Awesome Resource'");
    process.exit(1);
  }

  const fileName = args[0];
  if (fileName) {
    await createNewSite(fileName);
  } else {
    console.error("❌ Please provide a valid file name");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
