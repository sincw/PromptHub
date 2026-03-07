import fs from "fs";
import type { SkillDB } from "../../database/skill";
import { SkillInstaller } from "../../services/skill-installer";
import type {
  SkillFileSnapshot,
  SkillLocalFileEntry,
} from "../../../shared/types";

export interface SkillIPCContext {
  db: SkillDB;
}

export async function ensureLocalRepoPath(
  db: SkillDB,
  skillId: string,
): Promise<string | null> {
  const skill = db.getById(skillId);
  if (!skill) return null;

  const managedRepoPath = SkillInstaller.getLocalRepoPath(skill.name);
  const candidateRepoPath =
    skill.local_repo_path && SkillInstaller.isManagedRepoPath(skill.local_repo_path)
      ? skill.local_repo_path
      : managedRepoPath;

  try {
    const stat = fs.statSync(candidateRepoPath);
    if (stat.isDirectory()) {
      if (skill.local_repo_path !== candidateRepoPath) {
        db.update(skillId, { local_repo_path: candidateRepoPath });
      }
      return candidateRepoPath;
    }
  } catch {
    // fall through to bootstrap from DB content
  }

  if (
    skill.local_repo_path &&
    !SkillInstaller.isManagedRepoPath(skill.local_repo_path)
  ) {
    try {
      const externalRepoStat = fs.statSync(skill.local_repo_path);
      if (externalRepoStat.isDirectory()) {
        const savedRepoPath = await SkillInstaller.saveToLocalRepo(
          skill.name,
          skill.local_repo_path,
        );
        if (skill.local_repo_path !== savedRepoPath) {
          db.update(skillId, { local_repo_path: savedRepoPath });
        }
        return savedRepoPath;
      }
    } catch {
      // fall through to bootstrap from DB content
    }
  }

  const repoContent = skill.instructions || skill.content || "";
  if (!repoContent.trim()) {
    return null;
  }

  const savedRepoPath = await SkillInstaller.saveContentToLocalRepo(
    skill.name,
    repoContent,
  );
  if (skill.local_repo_path !== savedRepoPath) {
    db.update(skillId, { local_repo_path: savedRepoPath });
  }
  return savedRepoPath;
}

export async function readCurrentFilesSnapshot(
  db: SkillDB,
  skillId: string,
): Promise<SkillFileSnapshot[]> {
  const ensuredRepoPath = await ensureLocalRepoPath(db, skillId);
  const skill = db.getById(skillId);
  if (!skill) return [];

  const files: SkillLocalFileEntry[] = ensuredRepoPath
    ? await SkillInstaller.readLocalRepoFilesByPath(ensuredRepoPath)
    : await SkillInstaller.readLocalRepoFiles(skill.name);

  return files
    .filter((file) => !file.isDirectory)
    .map((file) => ({
      relativePath: file.path,
      content: file.content,
    }));
}

export async function replaceRepoFiles(
  db: SkillDB,
  skillId: string,
  filesSnapshot?: SkillFileSnapshot[],
): Promise<void> {
  if (!filesSnapshot) return;

  const skill = db.getById(skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  const repoPath = await ensureLocalRepoPath(db, skillId);
  if (!repoPath) {
    throw new Error(`Unable to resolve local repo for skill: ${skillId}`);
  }
  await SkillInstaller.replaceLocalRepoFilesByPath(repoPath, filesSnapshot);
}

export function resolveRepoPath(db: SkillDB, skillId: string): string | null {
  if (typeof skillId !== "string" || skillId.trim() === "") {
    return null;
  }

  const skill = db.getById(skillId);
  if (!skill) return null;

  const repoPath =
    skill.local_repo_path && SkillInstaller.isManagedRepoPath(skill.local_repo_path)
      ? skill.local_repo_path
      : SkillInstaller.getLocalRepoPath(skill.name);
  try {
    const stat = fs.statSync(repoPath);
    if (stat.isDirectory()) {
      return repoPath;
    }
  } catch {
    return null;
  }

  return null;
}
