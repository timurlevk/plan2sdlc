/**
 * Schema version utilities for migration support.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Validate that a loaded state file's schema version is supported.
 * Throws if the file was written by a newer plugin version.
 */
export function validateSchemaVersion(data: unknown, fileName: string): void {
  if (typeof data === 'object' && data !== null && 'schemaVersion' in data) {
    const version = (data as { schemaVersion: number }).schemaVersion;
    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `${fileName} has schema version ${version}, but this plugin supports up to version ${CURRENT_SCHEMA_VERSION}. Please update the plugin.`,
      );
    }
  }
}
