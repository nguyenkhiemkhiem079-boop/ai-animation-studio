#!/usr/bin/env node

/**
 * AI Animation Studio CLI
 */

import * as process from 'node:process';
import {
  FileSystemStorage,
  CheckpointManager,
  STANDARD_CINEMATIC_SKILLS,
  ProjectSchema,
  CharacterDNASchema,
  ShotContractSchema,
} from '@ai-studio/core';

export interface CliContext {
  cwd: string;
  storage: FileSystemStorage;
}

export async function runCli(args: string[], context?: CliContext): Promise<number> {
  const cwd = context?.cwd ?? process.cwd();
  const storage = context?.storage ?? new FileSystemStorage(cwd);

  const command = args[0] || 'help';

  switch (command) {
    case 'doctor': {
      console.log('🩺 Running AI Animation Studio Doctor...');
      console.log(`- Node.js Version: ${process.version}`);
      console.log(`- Working Directory: ${cwd}`);
      console.log(`- Registered Semantic Skills: ${STANDARD_CINEMATIC_SKILLS.length} skills loaded`);
      const hasGit = await storage.exists('.git');
      console.log(`- Git Repository: ${hasGit ? 'Detected ✅' : 'Missing ⚠️'}`);
      console.log('System is healthy and ready for animation pipelines! 🚀');
      return 0;
    }

    case 'checkpoint': {
      const subCommand = args[1];
      const projectId = args[2];
      const checkpointId = args[3];
      const checkpoints = new CheckpointManager(storage);

      if (!projectId) {
        console.error('Error: Project ID is required. Usage: studio checkpoint <list|create|restore> <projectId> [checkpointId]');
        return 1;
      }

      if (subCommand === 'list') {
        const list = await checkpoints.listCheckpoints(projectId);
        console.log(`Checkpoints for Project "${projectId}": (${list.length} found)`);
        for (const cp of list) {
          console.log(` - [${cp.id}] ${cp.name} (stage: ${cp.stage}, created: ${cp.createdAt})`);
        }
        return 0;
      }

      if (subCommand === 'create') {
        if (!checkpointId) {
          console.error('Error: Checkpoint ID is required for creation');
          return 1;
        }
        await checkpoints.createCheckpoint(projectId, checkpointId, { manualSavedAt: new Date().toISOString() });
        console.log(`✅ Checkpoint "${checkpointId}" created successfully for project "${projectId}".`);
        return 0;
      }

      if (subCommand === 'restore') {
        if (!checkpointId) {
          console.error('Error: Checkpoint ID is required for restore');
          return 1;
        }
        const state = await checkpoints.restoreCheckpoint(projectId, checkpointId);
        console.log(`✅ Checkpoint "${checkpointId}" verified and restored! State keys:`, Object.keys(state));
        return 0;
      }

      console.error(`Unknown checkpoint subcommand: "${subCommand}". Supported: list, create, restore`);
      return 1;
    }

    case 'inspect': {
      const filePath = args[1];
      const schemaType = args[2] || 'project';
      if (!filePath) {
        console.error('Usage: studio inspect <json-file-path> [project|character|shot]');
        return 1;
      }
      try {
        const data = await storage.readJson(filePath);
        if (schemaType === 'project') {
          ProjectSchema.parse(data);
        } else if (schemaType === 'character') {
          CharacterDNASchema.parse(data);
        } else if (schemaType === 'shot') {
          ShotContractSchema.parse(data);
        }
        console.log(`✅ Validated ${filePath} successfully against schema "${schemaType}"!`);
        return 0;
      } catch (err: any) {
        console.error(`❌ Validation failed for ${filePath}: ${err.message}`);
        return 1;
      }
    }

    case '--help':
    case '-h':
    case 'help':
    default: {
      console.log(`
🎬 AI Animation Studio CLI (v0.1.0)

Usage:
  studio <command> [options]

Commands:
  doctor                                 Check environment, node version, and system health
  checkpoint list <projectId>            List all checkpoints for a project
  checkpoint create <projectId> <ckptId> Create a checkpoint snapshot
  checkpoint restore <projectId> <ckptId>Restore and verify a checkpoint
  inspect <json-file> [schema]           Validate a JSON file against domain schemas
  help                                   Show this message
`);
      return 0;
    }
  }
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  runCli(process.argv.slice(2)).then((code) => {
    if (code !== 0) process.exit(code);
  });
}
