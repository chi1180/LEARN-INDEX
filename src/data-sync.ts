import { Client } from "@notionhq/client";
import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints";
import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";

// Types based on schema.json
interface LearningResource {
  name: string;
  url: string;
  type: "learning" | "reference" | "tutorial" | "course" | "documentation";
  description: string;
  topics: string[];
  style: "interactive" | "video" | "reading" | "project-based" | "mixed";
  pricing: "free" | "freemium" | "paid" | "subscription";
  links?: {
    article?: string;
    github?: string;
    documentation?: string;
    [key: string]: string | undefined;
  };
  introducer?: {
    github?: string;
    x?: string;
  };
}

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const DATABASE_ID_ENV = process.env.NOTION_DATABASE_ID;

if (!DATABASE_ID_ENV) {
  console.error("❌ NOTION_DATABASE_ID environment variable is required");
  process.exit(1);
}

const DATABASE_ID: string = DATABASE_ID_ENV;

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

async function loadResource(filePath: string): Promise<LearningResource> {
  const file = Bun.file(filePath);
  return await file.json();
}

async function getExistingPages(): Promise<Map<string, string>> {
  const existingPages = new Map<string, string>();

  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    const response = await notion.dataSources.query({
      data_source_id: DATABASE_ID,
      start_cursor: startCursor,
    });

    for (const page of response.results) {
      if ("properties" in page) {
        const nameProperty = page.properties["Name"];
        if (
          nameProperty?.type === "title" &&
          Array.isArray(nameProperty.title) &&
          nameProperty.title.length > 0
        ) {
          const firstTitle = nameProperty.title[0];
          if (!firstTitle) continue;
          const name = firstTitle.plain_text;
          existingPages.set(name, page.id);
        }
      }
    }

    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  return existingPages;
}

type PageProperties = CreatePageParameters["properties"];

function buildNotionProperties(resource: LearningResource): PageProperties {
  const properties: PageProperties = {
    Name: {
      title: [{ text: { content: resource.name } }],
    },
    URL: {
      url: resource.url,
    },
    Type: {
      select: { name: resource.type },
    },
    Description: {
      rich_text: [{ text: { content: resource.description } }],
    },
    Topics: {
      multi_select: resource.topics.map((topic) => ({ name: topic })),
    },
    Style: {
      select: { name: resource.style },
    },
    Pricing: {
      select: { name: resource.pricing },
    },
  };

  // Add optional links
  if (resource.links?.github) {
    properties["GitHub"] = { url: resource.links.github };
  }

  if (resource.links?.documentation) {
    properties["Documentation"] = { url: resource.links.documentation };
  }

  if (resource.links?.article) {
    properties["Article"] = { url: resource.links.article };
  }

  // Add introducer info
  if (resource.introducer?.github) {
    properties["Introducer GitHub"] = {
      rich_text: [{ text: { content: resource.introducer.github } }],
    };
  }

  if (resource.introducer?.x) {
    properties["Introducer X"] = {
      rich_text: [{ text: { content: resource.introducer.x } }],
    };
  }

  return properties;
}

async function createPage(resource: LearningResource): Promise<void> {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: buildNotionProperties(resource),
  });
}

async function updatePage(
  pageId: string,
  resource: LearningResource,
): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: buildNotionProperties(resource),
  });
}

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
  let errors = 0;

  for (const filePath of jsonFiles) {
    const fileName = basename(filePath);

    try {
      const resource = await loadResource(filePath);
      const existingPageId = existingPages.get(resource.name);

      if (existingPageId) {
        await updatePage(existingPageId, resource);
        console.log(`🔄 Updated: ${resource.name}`);
        updated++;
      } else {
        await createPage(resource);
        console.log(`✨ Created: ${resource.name}`);
        created++;
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
  console.log(`   ❌ Errors: ${errors}`);
}

syncToNotion().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
