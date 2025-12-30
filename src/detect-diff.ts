import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * List of site name
 */
interface DiffResult {
  added: string[];
  deleted: string[];
  modified: string[];
}

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
      const content = await getFileContent(filePath);
      const parsedContent = JSON.parse(content);
      const name = parsedContent.name;

      if (status === "A") {
        added.push(name);
      } else if (status === "D") {
        deleted.push(name);
      } else if (status === "M") {
        modified.push(name);
      }
    }
  }

  return { added, deleted, modified };
}

async function getFileContent(filePath: string): Promise<string> {
  try {
    const showCommand = `git show HEAD^:${filePath}`;
    const { stdout } = await execAsync(showCommand);
    return stdout;
  } catch (error) {
    console.error(
      `Error retrieving content for deleted file: ${filePath}`,
      error,
    );
    return "";
  }
}
