import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import util from 'node:util';
import assert from 'node:assert';

import {ctrl2smf} from './rcm_converter.js';

// Parses argv.
const {values, positionals} = util.parseArgs({
	options: {
		'reset-before-ctrl': {type: 'boolean', default: true},
		'optimize-ctrl':     {type: 'boolean', default: true},
		'debug':             {type: 'boolean', default: false},
	},
	allowPositionals: true,
	allowNegative: true,
});
if (positionals.length < 1) {
	console.error(`Usage: ${path.basename(process.argv[1])} [--no-reset-before-ctrl] [--no-optimize-ctrl] [--debug] ctrl-file [smf-file]`);
	process.exit(1);
}
// ctrl2smf() takes the settings in camel case.
const settings = {resetBeforeCtrl: values['reset-before-ctrl'], optimizeCtrl: values['optimize-ctrl'], debug: values.debug};

// Gets the file names from argv.
const ctrlFile = positionals[0];
let   smfFile  = positionals[1];
if (!smfFile) {
	// If the destination file name is not specify, makes it from the source file name.
	const p = path.parse(ctrlFile);
	p.name = p.base;
	p.base = '';
	p.ext = '.mid';
	smfFile = path.format(p);
}

console.assert = (settings.debug) ? assert : () => {/* EMPTY */};

const readFileAsync  = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

// Converts an control file to a syx File.
(async () => {
	try {
		const ctrlData = await readFileAsync(ctrlFile);
		const smfData  = await ctrl2smf(new Uint8Array(ctrlData), path.basename(ctrlFile), settings);
		await writeFileAsync(smfFile, smfData);
	} catch (e) {
		console.error((settings.debug) ? e : `${e}`);
	}
})();
