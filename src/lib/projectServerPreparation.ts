import {
  checkDependenciesInstalled,
  getForceStaticServe,
  getGenericDevCommand,
  getWorkspaceSubpath,
  resolveWorkspacePath,
} from './project';
import { detectPackageManager } from './github';
import { detectProjectType, type ProjectType } from './static-server';
import { logger } from './logger';

/** Reads preview metadata only. Never reserves ports, installs, or starts a process. */
export async function prepareProjectServer(projectPath: string) {
  const subpath = await getWorkspaceSubpath(projectPath).catch((error: unknown) => {
    logger.warn('[DevServer] Failed to read workspace selection; using repo root', {
      projectPath,
      error,
    });
    return null;
  });
  const cwd = resolveWorkspacePath(projectPath, subpath);
  let type: ProjectType = 'unknown';
  try {
    type = await detectProjectType(projectPath);
  } catch {
    logger.warn('[DevServer] Failed to detect project type', { projectPath });
  }
  const forceStatic = await getForceStaticServe(projectPath).catch(() => false);
  if (forceStatic && (type === 'generic' || type === 'unknown')) type = 'statichtml';
  let hasPackageJson: boolean | null = null;
  let cwdHasPackageJson: boolean | null = null;
  let needsInstall: { packageManager: string } | null = null;
  let dependenciesMissing = false;
  try {
    if (type !== 'shopifytheme' && !forceStatic) {
      const deps = await checkDependenciesInstalled(projectPath);
      hasPackageJson = deps.hasPackageJson;
      cwdHasPackageJson = deps.workspaceHasPackageJson ?? null;
      if (!deps.installed && deps.hasPackageJson) {
        dependenciesMissing = true;
        needsInstall = { packageManager: await detectPackageManager(projectPath) };
      }
    }
  } catch (error) {
    logger.warn('[DevServer] Failed to read dependency status', { projectPath, error });
    if (dependenciesMissing) throw error;
  }
  const commands =
    type === 'generic'
      ? await getGenericDevCommand(projectPath, cwd)
      : { custom: null, packageScript: null };
  return { cwd, type, hasPackageJson, cwdHasPackageJson, needsInstall, ...commands };
}
