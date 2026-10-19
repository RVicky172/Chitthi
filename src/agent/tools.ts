import { AI_TOOLS } from './aiTools';
import { CARD_PHOTO_TOOLS } from './cardPhotoTools';
import { CATALOG_TOOLS } from './catalogTools';
import { ToolError, type AgentTool } from './common';
import { DESIGN_TOOLS } from './designTools';
import { GALLERY_TOOLS } from './galleryTools';
import { OUTPUT_TOOLS } from './outputTools';
import { PHOTO_TOOLS } from './photoTools';
import { PROJECT_TOOLS } from './projectTools';

/*
 * Agent tools (Command pattern): every studio capability an AI agent may use, as {name, description, JSON Schema,
 * handler}. One registry serves the MCP server (electron/mcp.cjs, headless or live) and can serve an in-app
 * assistant. Handlers only call existing store actions and engine functions, so tools behave exactly like the studio,
 * and Undo reverts what an agent did in the live app. Files a tool makes are written by the desktop app into the
 * agent output folder and returned as paths; images for the agent to look at come back small (≤ 1024 px).
 */

/** Every tool, in the order agents see them: catalogue, design, photos, AI, checks and output, gallery, photo studio, saved projects. */
export const TOOLS: AgentTool[] = [
  ...CATALOG_TOOLS,
  ...DESIGN_TOOLS,
  ...CARD_PHOTO_TOOLS,
  ...AI_TOOLS,
  ...OUTPUT_TOOLS,
  ...GALLERY_TOOLS,
  ...PHOTO_TOOLS,
  ...PROJECT_TOOLS,
];

/** The tools by name. */
export const TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool]));

/**
 * The tool an agent names.
 * @param name the tool's name
 * @returns the tool, or undefined for a name no tool has
 */
export const toolNamed = (name: string): AgentTool | undefined => TOOLS.find((tool) => tool.name === name);

export { ToolError };
export type { AgentEnv, AgentTool, ToolFile, ToolResult } from './common';
