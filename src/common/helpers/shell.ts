/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-argument */
const shell = require('shelljs');

export const cliGetText = (str: Record<string, unknown>): string => str.toString().replaceAll('/n', '');

export const asyncShellExec = (command: string, onOutput?: (output: string) => void): Promise<string> =>
  new Promise((resolve, reject) => {
    let output = '';
    const child = shell.exec(command, { silent: true, async: true });

    // Listen to the 'data' event on stdout to get the output of each command
    child.stdout.on('data', (data) => {
      output += data.toString();

      if (onOutput) {
        onOutput(data.toString());
      }
    });

    // eslint-disable-next-line sonarjs/no-identical-functions
    child.stderr.on('data', (data) => {
      output += data.toString();

      if (onOutput) {
        onOutput(data.toString());
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Command exited with code ${code}`));
      }

      resolve(output);
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
