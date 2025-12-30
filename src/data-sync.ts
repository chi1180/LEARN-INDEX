import { join, basename } from "node:path";
import { getGitDiff } from "./detect-diff";
import {
  getAllJsonFiles,
  getExistingPages,
  loadResource,
  updatePage,
  deletePage,
  createPage,
} from "./notion";

async function syncToNotion(): Promise<void> {
  console.log("🔄 Starting Notion sync...\n");

  const sitesDir = join(import.meta.dir, "../sites");
  const jsonFiles = await getAllJsonFiles(sitesDir);

  if (jsonFiles.length === 0) {
    console.log("⚠️  No JSON files found in sites directory");
    return;
  }

  console.log(`📁 Found ${jsonFiles.length} resource file(s)`);
  console.log("📡 Fetching existing pages from Notion...\n");

  const existingPages = await getExistingPages();
  console.log(`📄 Found ${existingPages.size} existing page(s) in Notion\n`);

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let errors = 0;

  const DIFFS = await getGitDiff();

  for (const filePath of jsonFiles) {
    const fileName = basename(filePath);

    try {
      const resource = await loadResource(filePath);
      const existingPageId = existingPages.get(resource.name);

      if (existingPageId) {
        // Check if the resource was modified
        if (DIFFS.modified.includes(resource.name)) {
          await updatePage(existingPageId, resource);
          console.log(`🔄 Updated: ${resource.name}`);
          updated++;
        } else if (DIFFS.deleted.includes(resource.name)) {
          await deletePage(existingPageId);
          console.log(`🗑️ Deleted: ${resource.name}`);
          deleted++;
        }
      } else if (DIFFS.added.includes(resource.name)) {
        await createPage(resource);
        console.log(`✨ Created: ${resource.name}`);
        created++;
      } else {
        console.log("Unexpected state found !");
        console.dir(
          {
            resource: resource,
            existingPageId: existingPageId,
            diffs: DIFFS,
          },
          { dipth: null },
        );
      }
    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Sync complete:`);
  console.log(`   ✨ Created: ${created}`);
  console.log(`   🔄 Updated: ${updated}`);
  console.log(`   🗑️ Deleted: ${deleted}`);
  console.log(`   ❌ Errors: ${errors}`);
}

syncToNotion().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
