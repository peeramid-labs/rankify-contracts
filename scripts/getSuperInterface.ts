import { FormatTypes, JsonFragment } from '@ethersproject/abi';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const getSuperInterface = (outputPath?: string) => {
  let mergedArray: JsonFragment[] = [];
  function readDirectory(directory: string) {
    const files = fs.readdirSync(directory);

    files.forEach(file => {
      const fullPath = path.join(directory, file);
      if (fs.statSync(fullPath).isDirectory()) {
        readDirectory(fullPath); // Recurse into subdirectories
      } else if (path.extname(file) === '.json') {
        const fileContents = require('../' + fullPath); // Load the JSON file
        if (Array.isArray(fileContents)) {
          mergedArray = mergedArray.concat(fileContents); // Merge the array from the JSON file
        }
      }
    });
  }
  const originalConsoleLog = console.log;
  readDirectory('./abi');
  readDirectory('./node_modules/@peeramid-labs/eds/abi');
  console.log = () => {}; // avoid noisy output
  const result = new ethers.utils.Interface(mergedArray);
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result.format(FormatTypes.full), null, 2));
  }
  console.log = originalConsoleLog;
  return result;
};

export default getSuperInterface;
