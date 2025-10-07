import { task } from 'hardhat/config';
import getSuperInterface from './getSuperInterface';
import fs from 'fs';
import path from 'path';
import { FunctionFragment, EventFragment } from '@ethersproject/abi';

task('generate-selector-docs', 'Generates markdown documentation for all selectors').setAction(async _ => {
  // Get all interfaces
  const superInterface = getSuperInterface();
  const fragments = superInterface.fragments;

  // Organize fragments by type
  const functions = fragments.filter(f => f.type === 'function') as FunctionFragment[];
  const events = fragments.filter(f => f.type === 'event') as EventFragment[];

  // Generate markdown content
  let markdown = '# Contract Interface Reference\n\n';

  // Functions section
  markdown += '## Functions\n\n';
  markdown += '| Selector | Function | Inputs | Outputs |\n';
  markdown += '|----------|----------|---------|----------|\n';

  functions.forEach(func => {
    const selector = superInterface.getSighash(func);
    const name = func.name;
    const inputs = func.inputs.map(input => `${input.type} ${input.name}`).join(', ');
    const outputs = func.outputs?.map(output => output.type).join(', ') || 'void';

    markdown += `| \`${selector}\` | ${name} | (${inputs}) | ${outputs} |\n`;
  });

  // Events section
  markdown += '\n## Events\n\n';
  markdown += '| Topic | Event | Parameters |\n';
  markdown += '|-------|-------|------------|\n';

  events.forEach(event => {
    const topic = superInterface.getEventTopic(event);
    const name = event.name;
    const params = event.inputs
      .map(input => `${input.type} ${input.indexed ? '(indexed) ' : ''}${input.name}`)
      .join(', ');

    markdown += `| \`${topic}\` | ${name} | (${params}) |\n`;
  });

  // Save to docs directory
  const docsPath = path.join(__dirname, '../docs/selectors.md');
  fs.writeFileSync(docsPath, markdown);

  console.log(`✅ Selector documentation generated at ${docsPath}`);
});
