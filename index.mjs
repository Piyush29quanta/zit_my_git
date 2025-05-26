#!/usr/bin/env node

import { Command } from 'commander';
import Zit from './Zit.mjs';

const program = new Command();
const zit = new Zit();

program
  .name('zit')
  .description('Mini Git clone')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize repository')
  .action(async () => {
    await zit.init();
  });

program
  .command('add <file>')
  .description('Add file to staging')
  .action(async (file) => {
    await zit.add(file);
  });

program
  .command('commit')
  .option('-m, --message <msg>', 'Commit message')
  .description('Commit staged files')
  .action(async (options) => {
    await zit.commit(options.message);
  });

program
  .command('log')
  .description('Show commit history')
  .action(async () => {
    await zit.log();
  });

program
  .command('diff <commitHash>')
  .description('Show diff for a commit')
  .action(async (commitHash) => {
    await zit.showCommitDiff(commitHash);
  });

program.parse(process.argv);
