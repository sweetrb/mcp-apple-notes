/**
 * AppleScript Execution Utilities
 *
 * This module provides a safe interface for executing AppleScript commands
 * on macOS. It handles script execution, error capture, and result parsing.
 *
 * @module utils/applescript
 */

import { execSync } from "child_process";
import type { AppleScriptResult } from "@/types.js";

/**
 * Maximum execution time for AppleScript commands in milliseconds.
 * Apple Notes operations are typically fast, but complex searches
 * or operations on large note collections may take longer.
 */
const EXECUTION_TIMEOUT_MS = 10000;

/**
 * Escapes a string for safe inclusion in a shell command.
 *
 * When passing AppleScript to osascript via shell, we need to handle
 * the interaction between shell quoting and AppleScript string literals.
 * This function escapes single quotes since we wrap the script in single quotes.
 *
 * @param script - The raw AppleScript code
 * @returns Shell-safe version of the script
 *
 * @example
 * // Input: tell app "Notes" to get note "Rob's Note"
 * // Output: tell app "Notes" to get note "Rob'\''s Note"
 */
function escapeForShell(script: string): string {
  // Replace single quotes with: end quote, escaped quote, start quote
  // This is the standard shell escaping pattern for single-quoted strings
  return script.replace(/'/g, "'\\''");
}

/**
 * Parses error output from osascript to extract meaningful error messages.
 *
 * osascript errors typically include execution error numbers and descriptions.
 * This function attempts to extract the human-readable portion.
 *
 * @param errorOutput - Raw error string from execSync
 * @returns Cleaned error message
 */
function parseErrorMessage(errorOutput: string): string {
  // Check for common AppleScript error patterns
  const executionError = errorOutput.match(/execution error: (.+?)(?:\s*\(-?\d+\))?$/m);
  if (executionError) {
    return executionError[1].trim();
  }

  // Check for "not found" type errors
  const notFoundError = errorOutput.match(/Can't get (.+?)\./);
  if (notFoundError) {
    return `Not found: ${notFoundError[1]}`;
  }

  // Return cleaned version of original error
  return errorOutput.trim() || "Unknown AppleScript error";
}

/**
 * Executes an AppleScript command and returns a structured result.
 *
 * This function serves as the bridge between TypeScript and macOS AppleScript.
 * It handles the complexity of shell escaping, execution, and error handling
 * so that calling code can work with clean TypeScript interfaces.
 *
 * The script is executed synchronously via the `osascript` command-line tool.
 * Multi-line scripts are supported and preserved (important for AppleScript
 * tell blocks and repeat loops).
 *
 * @param script - The AppleScript code to execute
 * @returns A result object with success status and output or error message
 *
 * @example
 * ```typescript
 * const result = executeAppleScript(`
 *   tell application "Notes"
 *     get name of every note
 *   end tell
 * `);
 *
 * if (result.success) {
 *   console.log("Notes:", result.output);
 * } else {
 *   console.error("Failed:", result.error);
 * }
 * ```
 */
export function executeAppleScript(script: string): AppleScriptResult {
  // Validate input - empty scripts are likely programmer errors
  if (!script || !script.trim()) {
    return {
      success: false,
      output: "",
      error: "Cannot execute empty AppleScript",
    };
  }

  // Prepare the script:
  // 1. Trim leading/trailing whitespace (cosmetic)
  // 2. Preserve internal newlines (required for AppleScript syntax)
  // 3. Escape for shell execution
  const preparedScript = escapeForShell(script.trim());

  // Build the osascript command
  // We use single quotes to wrap the script, which is why we escape
  // single quotes within the script itself
  const command = `osascript -e '${preparedScript}'`;

  try {
    // Execute synchronously - MCP tools are inherently synchronous
    // and Apple Notes operations are fast enough that async isn't needed
    const output = execSync(command, {
      encoding: "utf8",
      timeout: EXECUTION_TIMEOUT_MS,
      // Capture stderr separately to get error details
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      success: true,
      output: output.trim(),
    };
  } catch (error: unknown) {
    // execSync throws on non-zero exit codes
    // The error object contains stderr output with AppleScript error details

    let errorMessage: string;

    if (error instanceof Error) {
      // Node's ExecException includes stderr in the message
      errorMessage = parseErrorMessage(error.message);
    } else if (typeof error === "string") {
      errorMessage = parseErrorMessage(error);
    } else {
      errorMessage = "AppleScript execution failed with unknown error";
    }

    // Log for debugging (MCP servers typically run in terminal)
    console.error(`AppleScript error: ${errorMessage}`);

    return {
      success: false,
      output: "",
      error: errorMessage,
    };
  }
}
