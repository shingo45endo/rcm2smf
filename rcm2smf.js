import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import util from 'node:util';
import assert from 'node:assert';

import {rcm2smf, defaultSettings} from './rcm_converter.js';
import {decodeNec932} from './nec932_decoder.js';

// Options. Only "type" and "short" are passed to util.parseArgs, and the others are for checking values and the help.
const options = {
	// About SMF generation
	'meta-text-memo': {
		group: 'SMF Generation',
		describe: 'Generate SMF Text events for RCM memo area',
	},
	'meta-text-comment': {
		group: 'SMF Generation',
		describe: 'Generate SMF Text events for RCM Comment events',
	},
	'meta-text-usr-exc': {
		group: 'SMF Generation',
		describe: 'Generate SMF Text events for each RCM UsrExc events',
	},
	'meta-cue': {
		group: 'SMF Generation',
		describe: 'Generate SMF Cue Point events for RCM KeyScan and External Command event',
	},
	'meta-time-signature': {
		group: 'SMF Generation',
		describe: 'Generate SMF Time Signature events from each measure\'s step time',
	},
	'trim-track-name': {
		group: 'SMF Generation',
		describe: 'Remove whitespace from SMF Sequence/Track Name events',
		choices: ['none', 'left', 'right', 'both'],
	},
	'trim-text-memo': {
		group: 'SMF Generation',
		describe: 'Remove whitespace from SMF Text events for RCM memo area',
		choices: ['none', 'left', 'right', 'both'],
	},
	'trim-text-comment': {
		group: 'SMF Generation',
		describe: 'Remove whitespace from SMF Text events for RCM Comment events',
		choices: ['none', 'left', 'right', 'both'],
	},
	'trim-text-usr-exc': {
		group: 'SMF Generation',
		describe: 'Remove whitespace from SMF Text events for RCM UsrExc events',
		choices: ['none', 'left', 'right', 'both'],
	},
	'note-off': {
		group: 'SMF Generation',
		describe: 'Use note-off ("8nH kk uu") events instead of "9nH kk 00H"',
	},
	'note-off-vel': {
		group: 'SMF Generation',
		describe: 'Velocity of note-off ("8nH kk uu") events',
		range: [0, 127],
	},

	// About RCM parsing
	'st-plus': {
		group: 'RCM Parsing',
		describe: 'Assume ST+ as signed (>= RCM 2.5) or unsigned (<= RCM 2.3a)',
		choices: ['auto', 'signed', 'unsigned'],
	},
	'reset-before-ctrl': {
		group: 'RCM Parsing',
		describe: 'Send reset SysEx before sending control files',
	},
	'optimize-ctrl': {
		group: 'RCM Parsing',
		describe: 'Optimize redundant SysEx generated from control files',
	},
	'extra-sysex-wait': {
		group: 'RCM Parsing',
		describe: 'Wait for extra time after each SysEx in control files (for MT-32 Ver.1.xx)',
	},
	'ignore-ctrl-file': {
		group: 'RCM Parsing',
		describe: 'Ignore control files',
	},
	'ignore-out-of-range': {
		group: 'RCM Parsing',
		describe: 'Ignore out-of-range values in events',
	},
	'ignore-wrong-event': {
		group: 'RCM Parsing',
		describe: 'Ignore unexpected events',
	},
	'max-loop-nest': {
		group: 'RCM Parsing',
		describe: 'Maximum loop nest level',
		range: [0, 100],
	},
	'infinity-loop-count': {
		group: 'RCM Parsing',
		describe: 'Loop count to revise to avoid loop-bomb',
		range: [1, 255],
	},
	'loop-bomb-threshold': {
		group: 'RCM Parsing',
		describe: 'Number of extracted beats considered as loop-bomb',
		range: [100, Infinity],
	},
	'roland-dev-id': {
		group: 'RCM Parsing',
		describe: 'Initial value of device ID for RolDev#',
		range: [0, 127],
	},
	'roland-model-id': {
		group: 'RCM Parsing',
		describe: 'Initial value of model ID for RolDev#',
		range: [0, 127],
	},
	'roland-base-addr-h': {
		group: 'RCM Parsing',
		describe: 'Initial value of the base address (H) for RolBase',
		range: [0, 127],
	},
	'roland-base-addr-m': {
		group: 'RCM Parsing',
		describe: 'Initial value of the base address (M) for RolBase',
		range: [0, 127],
	},
	'yamaha-dev-id': {
		group: 'RCM Parsing',
		describe: 'Initial value of device ID for YamDev#',
		range: [0, 127],
	},
	'yamaha-model-id': {
		group: 'RCM Parsing',
		describe: 'Initial value of model ID for YamDev#',
		range: [0, 127],
	},
	'yamaha-base-addr-h': {
		group: 'RCM Parsing',
		describe: 'Initial value of the base address (H) for YamBase',
		range: [0, 127],
	},
	'yamaha-base-addr-m': {
		group: 'RCM Parsing',
		describe: 'Initial value of the base address (M) for YamBase',
		range: [0, 127],
	},

	// Common
	'debug': {
		group: 'Options',
		type: 'boolean',
		default: false,
		describe: 'Debug mode (Enable assertion)',
	},
	'help': {
		group: 'Options',
		type: 'boolean',
		short: 'h',
		describe: 'Show help',
	},
	'version': {
		group: 'Options',
		type: 'boolean',
		short: 'v',
		describe: 'Show version number',
	},
};

// Adds type and default value from the default settings defined in rcm_converter.
for (const key of Object.keys(defaultSettings)) {
	const optName = key.replace(/([A-Z])/ug, (s) => `-${s.charAt(0).toLowerCase()}`);
	console.assert(optName in options);
	Object.assign(options[optName], {
		type: typeof defaultSettings[key],
		default: defaultSettings[key],
	});
}

// Parses argv.
let settings;
let positionals;
try {
	// util.parseArgs knows only boolean and string, so numbers are given as strings.
	const parseOptions = Object.fromEntries(Object.entries(options).map(([name, option]) => {
		const type = (option.type === 'boolean') ? 'boolean' : 'string';
		return [name, (option.short) ? {type, short: option.short} : {type}];
	}));
	let values;
	({values, positionals} = util.parseArgs({options: parseOptions, allowPositionals: true, allowNegative: true}));

	if (values.help) {
		console.log(makeHelpText());
		process.exit(0);
	}
	if (values.version) {
		const packagePath = path.join(path.dirname(process.argv[1]), 'package.json');
		console.log(JSON.parse(fs.readFileSync(packagePath, 'utf8')).version);
		process.exit(0);
	}

	// Makes the settings from the specified values and the default ones, and checks them. The names are converted to camel case.
	settings = {};
	for (const [name, option] of Object.entries(options).filter(([name]) => name !== 'help' && name !== 'version')) {
		const key = name.replace(/-([a-z])/ug, (_, letter) => letter.toUpperCase());
		let value = (name in values) ? values[name] : option.default;
		if (option.type === 'number') {
			value = (String(value).trim() === '') ? NaN : Number(value);
			if (!Number.isInteger(value)) {
				throw new Error(`${key} must be an integer.`);
			}
			const [min, max] = option.range;
			if (value < min || max < value) {
				throw new Error(`${key} must be in a range of (${min} - ${max}).`);
			}
		}
		if (option.choices && !option.choices.includes(value)) {
			throw new Error(`${key} must be one of ${option.choices.map((e) => JSON.stringify(e)).join(', ')}.`);
		}
		settings[key] = value;
	}

	// Initial reset SysEx cannot be omitted when optimizing SysEx generated from control files.
	if (settings.optimizeCtrl && !settings.resetBeforeCtrl) {
		throw new Error('In case of optimizing SysEx for control files, adding an initial reset SysEx is needed.\n(Use "--reset-before-ctrl" or "--no-optimize-ctrl")');
	}

	if (positionals.length < 1) {
		throw new Error("Argument 'rcm-file' is not specified.");
	}
} catch (e) {
	console.error(`${e.message}\nRun with "--help" to see the options.`);
	process.exit(1);
}

// Makes the help from the options. The groups are in the order of their first options.
function makeHelpText() {
	const getLabel = (name) => ((options[name].short) ? `-${options[name].short}, --${name}` : `--${name}`);
	const labelWidth = Math.max(...Object.keys(options).map((e) => getLabel(e).length));
	const lines = [`${path.basename(process.argv[1])} [options] rcm-file [smf-file]`];
	for (const groupName of new Set(Object.values(options).map((e) => e.group))) {
		lines.push('', `${groupName}:`);
		for (const [name, option] of Object.entries(options).filter(([_, e]) => e.group === groupName)) {
			const notes = [`[${option.type}]`];
			if (option.choices) {
				notes.push(`[choices: ${option.choices.map((e) => JSON.stringify(e)).join(', ')}]`);
			}
			if ('default' in option) {
				notes.push(`[default: ${JSON.stringify(option.default)}]`);
			}
			lines.push(`  ${getLabel(name).padEnd(labelWidth)}  ${option.describe}  ${notes.join(' ')}`);
		}
	}
	return lines.join('\n');
}

// Gets the file names from argv.
const rcmFile = positionals[0];
let   smfFile = positionals[1];
if (!smfFile) {
	// If the destination file name is not specify, makes it from the source file name.
	const p = path.parse(rcmFile);
	p.name = p.base;
	p.base = '';
	p.ext = '.mid';
	smfFile = path.format(p);
}

console.assert = (settings.debug) ? assert : () => {/* EMPTY */};

const readFileAsync  = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

// Converts an RCM file to a Standard MIDI File.
(async () => {
	try {
		const rcmData = await readFileAsync(rcmFile);
		const smfData = await rcm2smf(new Uint8Array(rcmData), fileReader, settings);
		await writeFileAsync(smfFile, smfData);
	} catch (e) {
		console.error((settings.debug) ? e : `${e}`);
	}

	function fileReader(fileName, fileNameRaw) {
		console.assert(fileName, 'Invalid argument');

		const baseDir = path.parse(rcmFile).dir;
		if (/^[\x20-\x7E]*$/u.test(fileName)) {
			return readFileAsync(path.join(baseDir, fileName));

		} else if (fileNameRaw) {
			const fileNameCP932 = decodeNec932(fileNameRaw);
			return readFileAsync(path.join(baseDir, fileNameCP932));

		} else {
			return Promise.reject(new Error('File not found'));
		}
	}
})();
