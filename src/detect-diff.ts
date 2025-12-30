import { exec } from "child_process";
import { promisify } from "util";
import type { DiffResult } from "./types";

const execAsync = promisify(exec);

export async function getGitDiff(): Promise<DiffResult> {
  const diffCommand = "git diff --name-status HEAD^ HEAD";
  const { stdout } = await execAsync(diffCommand);

  const added: string[] = [];
  const deleted: string[] = [];
  const modified: string[] = [];

  const lines = stdout.split("\n").filter((line) => line.trim() !== "");

  for (const line of lines) {
    const [status, filePath] = line.split(/\s+/);

    if (
      filePath &&
      filePath.startsWith("sites/") &&
      filePath.endsWith(".json")
    ) {
      try {
        let content: string;

        if (status === "A") {
          // Get added file content from HEAD
          content = await getFileContentFromHead(filePath);
          const parsedContent = JSON.parse(content);
          added.push(parsedContent.name);
        } else if (status === "D") {
          // Deleted file content from previous HEAD
          content = await getFileContentFromPreviousHead(filePath);
          const parsedContent = JSON.parse(content);
          deleted.push(parsedContent.name);
        } else if (status === "M") {
          // Modified file content from HEAD
          content = await getFileContentFromHead(filePath);
          const parsedContent = JSON.parse(content);
          modified.push(parsedContent.name);
        }
      } catch (error) {
        console.error(`Error processing file: ${filePath}`, error);
      }
    }
  }

  return { added, deleted, modified };
}

async function getFileContentFromHead(filePath: string): Promise<string> {
  const showCommand = `git show HEAD:${filePath}`;
  const { stdout } = await execAsync(showCommand);
  return stdout;
}

async function getFileContentFromPreviousHead(
  filePath: string,
): Promise<string> {
  const showCommand = `git show HEAD^:${filePath}`;
  const { stdout } = await execAsync(showCommand);
  return stdout;
}
