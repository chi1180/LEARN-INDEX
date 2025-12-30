// Types based on schema.json
export interface LearningResource {
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

export interface DatabaseQueryResponse {
  object: "list";
  results: Array<{
    object: string;
    id: string;
    properties: Record<string, unknown>;
  }>;
  next_cursor: string | null;
  has_more: boolean;
}
