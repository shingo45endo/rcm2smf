import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import util from 'node:util';
import assert from 'node:assert';

import {convertMtdToSysEx, convertCm6ToSysEx, convertGsdToSysEx, isSysExRedundant} from './rcm_ctrl_converter.js';

// Parses argv.
const {values, positionals} = util.parseArgs({
	options: {
		'optimize-ctrl': {type: 'boolean', default: false},
		'debug':         {type: 'boolean', default: false},
	},
	allowPositionals: true,
	allowNegative: true,
});
if (positionals.length < 1) {
	console.error(`Usage: ${path.basename(process.argv[1])} [--optimize-ctrl] [--debug] ctrl-file [syx-file]`);
	process.exit(1);
}

// Gets the file names from argv.
const ctrlFile = positionals[0];
let   syxFile  = positionals[1];
if (!syxFile) {
	// If the destination file name is not specify, makes it from the source file name.
	const p = path.parse(ctrlFile);
	p.name = p.base;
	p.base = '';
	p.ext = '.syx';
	syxFile = path.format(p);
}

console.assert = (values.debug) ? assert : () => {/* EMPTY */};

const readFileAsync  = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

// Converts a control file to a syx File.
(async () => {
	try {
		const bytes = new Uint8Array(await readFileAsync(ctrlFile));
		const allSysExs = convertCm6ToSysEx(bytes) || convertMtdToSysEx(bytes) || convertGsdToSysEx(bytes);
		const sysExs = (values['optimize-ctrl']) ? allSysExs.filter((e) => !isSysExRedundant(e)) : allSysExs;

		await writeFileAsync(syxFile, new Uint8Array([].concat(...sysExs)));
	} catch (e) {
		console.error((values.debug) ? e : `${e}`);
	}
})();
