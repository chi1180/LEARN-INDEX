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

  console.log(`📁 Found ${jsonFiles.length} resource file(s)`);
  console.log("📡 Fetching existing pages from Notion...\n");

  const existingPages = await getExistingPages();
  console.log(`📄 Found ${existingPages.size} existing page(s) in Notion\n`);

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let errors = 0;

  const DIFFS = await getGitDiff();
  console.log("📝 Git diff result:", DIFFS);

  // 1. 削除されたファイルを先に処理（jsonFilesには含まれないため）
  for (const deletedName of DIFFS.deleted) {
    try {
      const existingPageId = existingPages.get(deletedName);
      if (existingPageId) {
        await deletePage(existingPageId);
        console.log(`🗑️ Deleted: ${deletedName}`);
        deleted++;
      } else {
        console.log(`⚠️ Page not found for deletion: ${deletedName}`);
      }
    } catch (error) {
      console.error(`❌ Error deleting ${deletedName}:`, error);
      errors++;
    }
  }

  // 2. 追加・更新されたファイルを処理
  for (const filePath of jsonFiles) {
    const fileName = basename(filePath);

    try {
      const resource = await loadResource(filePath);
      const existingPageId = existingPages.get(resource.name);

      if (DIFFS.added.includes(resource.name)) {
        // 新規追加
        await createPage(resource);
        console.log(`✨ Created: ${resource.name}`);
        created++;
      } else if (DIFFS.modified.includes(resource.name) && existingPageId) {
        // 更新
        await updatePage(existingPageId, resource);
        console.log(`🔄 Updated: ${resource.name}`);
        updated++;
      }
      // DIFFSに含まれないファイルは変更なしなのでスキップ
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
