import { Client } from "@notionhq/client";
import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { LearningResource, DatabaseQueryResponse } from "./types";

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

export async function getAllJsonFiles(dir: string): Promise<string[]> {
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

export async function loadResource(
  filePath: string,
): Promise<LearningResource> {
  const file = Bun.file(filePath);
  return await file.json();
}

export async function getExistingPages(): Promise<Map<string, string>> {
  const existingPages = new Map<string, string>();

  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    // Use direct fetch to /databases/{id}/query endpoint
    // because SDK v5.6.0's dataSources.query uses a different endpoint
    const fetchResponse = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(startCursor ? { start_cursor: startCursor } : {}),
      },
    );

    if (!fetchResponse.ok) {
      const errorBody = await fetchResponse.text();
      throw new Error(`Notion API error: ${fetchResponse.status} ${errorBody}`);
    }

    const response = (await fetchResponse.json()) as DatabaseQueryResponse;

    for (const page of response.results) {
      const properties = page.properties as Record<string, unknown>;
      const nameProperty = properties["Name"] as
        | {
            type?: string;
            title?: Array<{ plain_text?: string }>;
          }
        | undefined;

      if (
        nameProperty?.type === "title" &&
        Array.isArray(nameProperty.title) &&
        nameProperty.title.length > 0
      ) {
        const firstTitle = nameProperty.title[0];
        if (!firstTitle?.plain_text) continue;
        const name = firstTitle.plain_text;
        existingPages.set(name, page.id);
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
    properties["GitHub"] = {
      url: resource.links.github,
    };
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
      url: resource.introducer.github.replace("@", "https://github.com/"),
    };
  }

  if (resource.introducer?.x) {
    properties["Introducer X"] = {
      url: resource.introducer.x.replace("@", "https://x.com/"),
    };
  }

  return properties;
}

export async function createPage(resource: LearningResource): Promise<void> {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: buildNotionProperties(resource),
  });
}

export async function updatePage(
  pageId: string,
  resource: LearningResource,
): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: buildNotionProperties(resource),
  });
}

export async function deletePage(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    archived: true,
  });
}
