import {convertMtdToSysEx, convertCm6ToSysEx, convertGsdToSysEx, isSysExRedundant} from './rcm_ctrl_converter.js';

// Default settings of this converter.
export const defaultSettings = {
	metaTextMemo:    true,
	metaTextComment: true,
	metaTextUsrExc:  true,
	metaCue:         true,
	trimTrackName:   'both',
	trimTextMemo:    'none',
	trimTextComment: 'both',
	trimTextUsrExc:  'both',
	noteOff:    false,
	noteOffVel: 64,

	stPlus: 'auto',
	resetBeforeCtrl:  true,
	optimizeCtrl:     true,
	ignoreCtrlFile:   false,
	ignoreOutOfRange: true,
	ignoreWrongEvent: true,
	maxLoopNest:          5,
	infinityLoopCount:    2,
	loopBombThreshold: 4000,
	rolandDevId:    0x10,
	rolandModelId:  0x16,
	yamahaDevId:    0x10,
	yamahaModelId:  0x16,
};
Object.freeze(defaultSettings);

const EVENT_MCP = {
	UsrExc0:     -1,
	UsrExc1:     -1,
	UsrExc2:     -1,
	UsrExc3:     -1,
	UsrExc4:     -1,
	UsrExc5:     -1,
	UsrExc6:     -1,
	UsrExc7:     -1,
	TrExcl:      -1,
	ExtCmd:      -1,
	DX7FUNC:   0xc0,	// DX7 Function
	DX_PARA:   0xc1,	// DX Voice Parameter
	DX_PERF:   0xc2,	// DX Performance
	TX_FUNC:   0xc3,	// TX Function
	FB_01_P:   0xc5,	// FB-01 Parameter
	FB_01_S:   0xc6,	// FB-01 System Parameter
	TX81Z_V:   0xc7,	// TX81Z VCED
	TX81Z_A:   0xc8,	// TX81Z ACED
	TX81Z_P:   0xc9,	// TX81Z PCED
	TX81Z_S:   0xca,	// TX81Z System
	TX81Z_E:   0xcb,	// TX81Z Effect
	DX7_2_R:   0xcc,	// DX7-2 Remote SW
	DX7_2_A:   0xcd,	// DX7-2 ACED
	DX7_2_P:   0xce,	// DX7-2 PCED
	TX802_P:   0xcf,	// TX802 PCED
	YamBase:     -1,
	YamDev:      -1,
	YamPara:     -1,
	XGPara:      -1,
	MKS_7:       -1,
	RolBase:   0xe7,	// MT32BASE
	RolPara:   0xe8,	// MT32PARA
	RolDev:    0xe6,	// R.EXCLU
	BankPrgL:    -1,
	BankPrg:     -1,
	KeyScan:     -1,
	MIDI_CH:   0xd0,	// MIDI Channel Change
	TEMPO:     0xfa,	// Relative Tempo Change
	AFTER_C:   0xe3,	// After Touch (Ch.)
	CONTROL:   0xe2,	// Control Change
	PROGRAM:     -1,
	AFTER_K:   0xe1,	// After Touch (Poly)
	PITCH:     0xe4,	// Pitch Bend Change
	MusicKey:    -1,	// TODO: Investigate whether F2 event is for MusicKey or not.
	Comment:     -1,
	SecondEvt:   -1,
	LoopEnd:   0xfb,	// Loop End
	LoopStart: 0xfc,	// Loop Start
	SameMeas:    -1,
	MeasEnd:   0xfd,	// Measure End
	TrackEnd:  0xfe,	// End of Track
	CMU_800:   0xf9,	// CMU-800
	UserPrg:   0xe0,	// Program Change (User Program)
};
Object.freeze(EVENT_MCP);

const EVENT_RCP = {
	UsrExc0:   0x90,	// User Exclusive 0
	UsrExc1:   0x91,	// User Exclusive 1
	UsrExc2:   0x92,	// User Exclusive 2
	UsrExc3:   0x93,	// User Exclusive 3
	UsrExc4:   0x94,	// User Exclusive 4
	UsrExc5:   0x95,	// User Exclusive 5
	UsrExc6:   0x96,	// User Exclusive 6
	UsrExc7:   0x97,	// User Exclusive 7
	TrExcl:    0x98,	// Track Exclusive
	ExtCmd:    0x99,	// External Command
	DX7FUNC:   0xc0,	// DX7 Function
	DX_PARA:   0xc1,	// DX Voice Parameter
	DX_PERF:   0xc2,	// DX Performance
	TX_FUNC:   0xc3,	// TX Function
	FB_01_P:   0xc5,	// FB-01 Parameter
	FB_01_S:   0xc6,	// FB-01 System Parameter
	TX81Z_V:   0xc7,	// TX81Z VCED
	TX81Z_A:   0xc8,	// TX81Z ACED
	TX81Z_P:   0xc9,	// TX81Z PCED
	TX81Z_S:   0xca,	// TX81Z System
	TX81Z_E:   0xcb,	// TX81Z Effect
	DX7_2_R:   0xcc,	// DX7-2 Remote SW
	DX7_2_A:   0xcd,	// DX7-2 ACED
	DX7_2_P:   0xce,	// DX7-2 PCED
	TX802_P:   0xcf,	// TX802 PCED
	YamBase:   0xd0,	// YAMAHA Base Address
	YamDev:    0xd1,	// YAMAHA Dev# & Model ID
	YamPara:   0xd2,	// YAMAHA Address & Parameter
	XGPara:    0xd3,	// YAMAHA XG Address & Parameter
	MKS_7:     0xdc,	// Roland MKS-7
	RolBase:   0xdd,	// Roland Base Address
	RolPara:   0xde,	// Roland Address & Parameter
	RolDev:    0xdf,	// Roland Dev# & Model ID
	BankPrgL:  0xe1,	// Program Bank Change (LSB)
	BankPrg:   0xe2,	// Program Bank Change (MSB)
	KeyScan:   0xe5,	// Key Scan
	MIDI_CH:   0xe6,	// MIDI Channel Change
	TEMPO:     0xe7,	// Relative Tempo Change
	AFTER_C:   0xea,	// After Touch (Ch.)
	CONTROL:   0xeb,	// Control Change
	PROGRAM:   0xec,	// Program Change
	AFTER_K:   0xed,	// After Touch (Poly)
	PITCH:     0xee,	// Pitch Bend Change
	MusicKey:  0xf5,	// Music Key
	Comment:   0xf6,	// Comment
	SecondEvt: 0xf7,	// 2nd Event for Comment, TrExcl, and ExtCmd
	LoopEnd:   0xf8,	// Loop End
	LoopStart: 0xf9,	// Loop Start
	SameMeas:  0xfc,	// Same Measure
	MeasEnd:   0xfd,	// Measure End
	TrackEnd:  0xfe,	// End of Track
	CMU_800:     -1,
	UserPrg:     -1,
};
Object.freeze(EVENT_RCP);

export async function rcm2smf(buf, controlFileReader, options) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error(`Invalid argument: ${buf}`);
	}

	// Converts from RCP/G36 to SMF.
	const rcm = await parseRcm(buf, controlFileReader, options);
	const seq = convertRcmToSeq(rcm, options);
	const smf = convertSeqToSmf(seq, rcm.header.timeBase, options);

	return smf;
}

export async function parseRcm(buf, controlFileReader, options) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error(`Invalid argument: ${buf}`);
	}

	// Makes a settings object from the default settings and the specified ones.
	const settings = {...defaultSettings, ...options};

	// Parses the data as RCP format. If it failed, parses it again as G36 format. If it failed again, try MCP parser.
	const rcm = parseRcp(buf) || parseG36(buf) || parseMcp(buf);
	if (!rcm) {
		throw new Error('Not RECOMPOSER file');
	}

	// Reads and parses control files.
	for (const kind of ['MTD', 'CM6', 'GSD', 'GSD2']) {
		if (settings.ignoreCtrlFile) {
			break;
		}

		const keyName  = `fileName${kind}`;
		const keyData  = `fileData${kind}`;
		const keySysEx = `sysExs${kind}`;

		if (!rcm.header[keyName] || rcm.header[keyName].length === 0) {
			continue;
		}

		// Checks whether the control file reader is provided.
		if (!controlFileReader) {
			throw new Error('Control file reader is not specified');
		}

		// Reads the control file.
		const fileName = String.fromCharCode(...rcm.header[keyName]);
		const buf = await controlFileReader(fileName, (/^[\x20-\x7E]*$/u.test(fileName)) ? undefined : rcm.header[keyName]).catch((e) => {
			throw new Error(`Control file not found: ${fileName}${(settings.debug) ? `\n${e}` : ''}`);
		});

		// Parses the control file.
		console.assert(buf);
		const sysExs = {
			MTD:  convertMtdToSysEx,
			CM6:  convertCm6ToSysEx,
			GSD:  convertGsdToSysEx,
			GSD2: convertGsdToSysEx,
		}[kind](buf);
		if (!sysExs) {
			throw new Error(`Not ${kind.slice(0, 3)} file: ${fileName}`);
		}

		rcm.header[keyData]  = buf;
		rcm.header[keySysEx] = sysExs;

		// Gets Patch Memory information for user patches.
		if (kind === 'MTD') {
			const patches = sysExs.filter((e) => {
				// Extracts SysExs regarding Patch Memory. (#1-#128)
				console.assert(e[0] === 0xf0 && e[1] === 0x41 && e[2] === 0x10 && e[3] === 0x16 && e[4] === 0x12);
				return (e[5] === 0x05);	// Address '05 xx xx' is for Patch Memory
			}).reduce((p, c) => {
				// Splits payloads of SysExs by 8-byte.
				console.assert(c.length > 5 + 3 + 2);
				for (let i = 5 + 3; i < c.length; i += 8) {
					const e = c.slice(i, i + 8);
					if (e.length === 8) {
						p.push(e);
					}
				}
				return p;
			}, []);
			console.assert(patches.length === 192);
			rcm.header.patches = patches;
		}
	}

	// Executes post-processing for each track.
	if (!rcm.header.isMCP) {
		// For RCP/G36
		for (const track of rcm.tracks) {
			// Sets MIDI channel No. and port No.
			track.chNo   = (track.midiCh >= 0) ? track.midiCh % 16 : -1;
			track.portNo = (track.midiCh >= 0) ? Math.trunc(track.midiCh / 16) : 0;

			// Reinterprets ST+ if necessary.
			if (settings.stPlus !== 'auto') {
				const byte = new Uint8Array([(track.stShift + 0x100) & 0xff]);
				const view = new DataView(byte.buffer, byte.byteOffset);

				switch (settings.stPlus) {
				case 'signed':
					{
						const s = view.getInt8(0);
						if (s !== track.stShift && (s < -99 || 99 < s)) {
							console.warn(`ST+ has been converted to signed as specified. (${track.stShift} -> ${s}) But, it seems to be unsigned.`);
						}
						track.stShift = s;
					}
					break;
				case 'unsigned':
					{
						const u = view.getUint8(0);
						if (u !== track.stShift && (rcm.header.isF || rcm.header.isG)) {
							console.warn(`ST+ has been converted to unsigned as specified. (${track.stShift} -> ${u}) But, it seems to be signed.`);
						}
						track.stShift = u;
					}
					break;
				default:
					console.warn(`Unrecognized option: ${settings.stPlus} Ignored.`);
					break;
				}
			}

			// Extracts same measures and loops.
			track.extractedEvents = extractEvents(track.events, rcm.header.timeBase, false, settings);
		}
	} else {
		// For MCP
		for (const track of rcm.tracks.slice(1, -1)) {
			// Sets MIDI channel No.
			track.chNo = (track.midiCh >= 0) ? track.midiCh : -1;

			// Extracts loops.
			track.extractedEvents = extractEvents(track.events, rcm.header.timeBase, true, settings);
		}

		// Extracts rhythm track.
		console.assert(rcm.tracks.length >= 10);
		const seqTrack     = rcm.tracks[9];
		const patternTrack = rcm.tracks[0];

		seqTrack.chNo = seqTrack.midiCh;
		seqTrack.extractedEvents = extractRhythm(seqTrack.events, patternTrack.events, settings);
	}

	return rcm;
}

export function parseMcp(buf) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error(`Invalid argument: ${buf}`);
	}

	// Checks the file header.
	// Note: Confirmed 3 types of header: 'M1', 'MC', and [0x00, 0x00]
	if (buf.length < 256) {
		return null;
	}
	const id = buf.slice(0x00, 0x02);
	if (!/^(?:M1|MC)$/u.test(String.fromCharCode(...id)) && !(id[0] === 0x00 && id[1] === 0x00)) {
		return null;
	}

	const view = new DataView(buf.buffer, buf.byteOffset);
	const rcm = {header: {isMCP: true, maxTracks: 1 + 8 + 1}, tracks: []};

	// Header
	rcm.header.title = buf.slice(0x02, 0x20);

	rcm.header.timeBase = view.getUint8(0x20);
	rcm.header.tempo    = view.getUint8(0x21);
	rcm.header.beatN    = view.getUint8(0x22);
	rcm.header.beatD    = view.getUint8(0x23);
	rcm.header.key      = view.getUint8(0x24);

	if (buf[0x60] !== 0x00 && buf[0x60] !== 0x20) {
		rcm.header.fileNameMTD = new Uint8Array([...rawTrim(rawTrimNul(buf.slice(0x60, 0x66))), '.'.codePointAt(), ...rawTrim(rawTrimNul(buf.slice(0x66, 0x69)))]);
	}

	// Tracks
	rcm.tracks = [...new Array(rcm.header.maxTracks)].map((_, i) => {
		const track = {events: []};
		if (i > 0) {
			track.midiCh = view.getInt8(0x40 + i - 1);
			track.isCMU  = (buf[0x50 + i - 1] !== 0);
			track.memo   = buf.slice(0x70 + (i - 1) * 16, 0x70 + i * 16);
		}
		return track;
	});

	// All events
	const events = buf.slice(0x0100).reduce((p, _, i, a) => {
		if (i % 4 === 0) {
			p.push(a.slice(i, i + 4));
		}
		return p;
	}, []);
	if (events[events.length - 1].length !== 4) {
		events.pop();
	}

	// Separates all the events into each track.
	let trackNo = 0;
	for (const event of events) {
		console.assert(Array.isArray(rcm.tracks[trackNo].events));
		rcm.tracks[trackNo].events.push(event);

		if (event[0] === EVENT_MCP.TrackEnd) {
			trackNo++;
			if (trackNo >= rcm.header.maxTracks) {
				break;
			}
		}
	}

	return rcm;
}

export function parseRcp(buf) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error(`Invalid argument: ${buf}`);
	}

	// Checks the file header.
	if (buf.length < 518 || !String.fromCharCode(...buf.slice(0x0000, 0x0020)).startsWith('RCM-PC98V2.0(C)COME ON MUSIC')) {
		return null;
	}

	const view = new DataView(buf.buffer, buf.byteOffset);
	const rcm = {header: {}, tracks: []};

	// Header
	rcm.header.title = buf.slice(0x0020, 0x0060);
	rcm.header.memoLines = [...new Array(12)].map((_, i) => buf.slice(0x0060 + 28 * i, 0x0060 + 28 * (i + 1)));

	rcm.header.timeBase = (view.getUint8(0x01e7) << 8) | view.getUint8(0x01c0);
	rcm.header.tempo    = view.getUint8(0x01c1);
	rcm.header.beatN    = view.getUint8(0x01c2);
	rcm.header.beatD    = view.getUint8(0x01c3);
	rcm.header.key      = view.getUint8(0x01c4);
	rcm.header.playBias = view.getInt8(0x01c5);

	rcm.header.fileNameCM6 = rawTrim(rawTrimNul(buf.slice(0x01c6, 0x01d2)));
	rcm.header.fileNameGSD = rawTrim(rawTrimNul(buf.slice(0x01d6, 0x01e2)));

	const trackNum = view.getUint8(0x01e6);
	rcm.header.maxTracks = (trackNum === 0) ? 18 : trackNum;
	rcm.header.isF = (trackNum !== 0);

	rcm.header.userSysExs = [...new Array(8)].map((_, i) => {
		const index = 0x0406 + 48 * i;
		return {
			memo:  buf.slice(index, index + 24),
			bytes: buf.slice(index + 24, index + 48),
		};
	});

	// Tracks
	const HEADER_LENGTH = 44;
	const EVENT_LENGTH  = 4;
	let index = 0x0586;
	for (let i = 0; i < rcm.header.maxTracks && index + HEADER_LENGTH < buf.length; i++) {
		// If the footer data found, terminates the loop.
		if (String.fromCharCode(...buf.slice(index, index + 4)).startsWith('RCFW')) {
			break;
		}

		const track = {};

		// Track Header
		const size = view.getUint16(index, true);
		if (size < HEADER_LENGTH || index + size > buf.length) {
			console.warn(`Invalid track size: ${size}`);
			break;
		}

		track.trackNo  = view.getUint8(index + 2);
		track.midiCh   = view.getInt8(index + 4);
		track.keyShift = view.getUint8(index + 5);
		const stShift = (rcm.header.isF) ? view.getInt8(index + 6) : view.getUint8(index + 6);
		track.stShift = (stShift < 100) ? stShift : view.getInt8(index + 6);
		track.mode     = view.getUint8(index + 7);
		track.memo     = buf.slice(index + 8, index + 44);

		// Track Events
		track.events = buf.slice(index + HEADER_LENGTH, index + size).reduce((p, _, i, a) => {
			if (i % EVENT_LENGTH === 0) {
				p.push(a.slice(i, i + EVENT_LENGTH));
			}
			return p;
		}, []);

		rcm.tracks.push(track);

		index += size;
	}

	return rcm;
}

export function parseG36(buf) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error(`Invalid argument: ${buf}`);
	}

	// Checks the file header.
	if (buf.length < 518 || !String.fromCharCode(...buf.slice(0x0000, 0x0020)).startsWith('COME ON MUSIC RECOMPOSER RCP3.0')) {
		return null;
	}

	const view = new DataView(buf.buffer, buf.byteOffset);
	const rcm = {header: {isG: true}, tracks: []};

	// Header
	rcm.header.title = buf.slice(0x0020, 0x0060);
	rcm.header.memoLines = [...new Array(12)].map((_, i) => buf.slice(0x00a0 + 30 * i, 0x00a0 + 30 * (i + 1)));

	rcm.header.maxTracks = view.getUint16(0x0208, true);
	rcm.header.timeBase  = view.getUint16(0x020a, true);
	rcm.header.tempo     = view.getUint16(0x020c, true);
	rcm.header.beatN     = view.getUint8(0x020e);
	rcm.header.beatD     = view.getUint8(0x020f);
	rcm.header.key       = view.getUint8(0x0210);
	rcm.header.playBias  = view.getInt8(0x0211);

	rcm.header.fileNameGSD  = rawTrim(rawTrimNul(buf.slice(0x0298, 0x02a8)));
	rcm.header.fileNameGSD2 = rawTrim(rawTrimNul(buf.slice(0x02a8, 0x02b8)));
	rcm.header.fileNameCM6  = rawTrim(rawTrimNul(buf.slice(0x02b8, 0x02c8)));

	rcm.header.userSysExs = [...new Array(8)].map((_, i) => {
		const index = 0x0b18 + 48 * i;
		return {
			memo:  buf.slice(index, index + 23),
			bytes: buf.slice(index + 23, index + 48),
		};
	});

	// Tracks
	const HEADER_LENGTH = 46;
	const EVENT_LENGTH  = 6;
	let index = 0x0c98;
	for (let i = 0; i < rcm.header.maxTracks && index + HEADER_LENGTH < buf.length; i++) {
		// If the footer data found, terminates the loop.
		if (String.fromCharCode(...buf.slice(index, index + 4)).startsWith('RCFW')) {
			break;
		}

		const track = {};

		// Track Header
		const size = view.getUint32(index, true);
		if (size < HEADER_LENGTH || index + size > buf.length) {
			console.warn(`Invalid track size: ${size}`);
			break;
		}

		track.trackNo  = view.getUint8(index + 4);
		track.midiCh   = view.getInt8(index + 6);
		track.keyShift = view.getUint8(index + 7);
		track.stShift  = view.getInt8(index + 8);
		track.mode     = view.getUint8(index + 9);
		track.memo     = buf.slice(index + 10, index + 46);

		// Track Events
		track.events = buf.slice(index + HEADER_LENGTH, index + size).reduce((p, _, i, a) => {
			if (i % EVENT_LENGTH === 0) {
				p.push(a.slice(i, i + EVENT_LENGTH));
			}
			return p;
		}, []);

		rcm.tracks.push(track);

		index += size;
	}

	return rcm;
}

function extractEvents(events, timeBase, isMCP, settings) {
	console.assert(Array.isArray(events), 'Invalid argument', {events});
	console.assert(timeBase > 0, 'Invalid argument', {timeBase});
	console.assert(settings, 'Invalid argument', {settings});

	if (events.length === 0) {
		return [];
	}

	// Sets constants and chooses event parser.
	const EVENT = (isMCP) ? EVENT_MCP : EVENT_RCP;
	const EVENT_LENGTH = events[0].length;
	console.assert(EVENT_LENGTH === 4 || EVENT_LENGTH === 6, 'Event length must be 4 or 6', {EVENT_LENGTH});
	console.assert(events.every((e) => e.length === EVENT_LENGTH), 'All of events must be same length', {events});
	const HEADER_LENGTH = (isMCP) ? NaN      : (EVENT_LENGTH === 4) ? 44 : 46;
	const convertEvent  = (isMCP) ? (e) => e : (EVENT_LENGTH === 4) ? convertEvent4byte : convertEvent6byte;

	// Extracts same measures and loops.
	const extractedEvents = [];
	const stacks = [];
	let lastIndex = -1;
	for (let index = 0; index < events.length;) {
		const event = convertEvent(events[index]);

		// Resolves Same Measure event.
		if (event[0] === EVENT.SameMeas) {
			// If it is already in Same Measure mode, quits Same Measure.
			if (lastIndex >= 0) {
				// Leaves Same Measure mode and goes backs to the previous position.
				index = lastIndex + 1;
				lastIndex = -1;

				// Adds a dummy End Measure event.
				extractedEvents.push([EVENT.MeasEnd, 0x00, 0xfc, 0x01]);

			} else {
				// Enters Same Measure mode.
				lastIndex = index;

				// If the previous event isn't an End Measure event, adds a dummy End Measure event.
				if (index > 0 && events[index - 1][0] !== EVENT.MeasEnd && events[index - 1][0] !== EVENT.SameMeas) {
					extractedEvents.push([EVENT.MeasEnd, 0x00, 0xfc, 0x02]);
				}

				// Moves the current index to the measure.	// TODO: Avoid infinity loop
				let counter = 0;
				while (events[index][0] === EVENT.SameMeas) {
					const [cmd, measure, offset] = convertEvent(events[index]);
					console.assert(cmd === EVENT.SameMeas, {cmd, measure, offset});

					index = (offset - HEADER_LENGTH) / EVENT_LENGTH;
					validateAndThrow(Number.isInteger(index) && (0 <= index && index < events.length), `Invalid Same Measure event: ${{cmd, measure, offset}}`);

					counter++;
					validateAndThrow(counter < 100, `Detected infinity Same Measure reference.`);
				}
			}
			continue;
		}

		// Handles a special event or just adds a normal event to the event array.
		switch (event[0]) {
		case EVENT.SameMeas:
			console.assert(false, 'Same Measure event must be resolved', {event});
			break;

		case EVENT.LoopStart:
			if (stacks.length < settings.maxLoopNest) {
				stacks.push({index, lastIndex,
					count: -1,
					extractedIndex: (extractedEvents.length > 0) ? extractedEvents.length - 1 : 0,
				});
			} else {
				console.warn(`Detected more than ${settings.maxLoopNest}-level of nested loops. Skipped.`);
			}
			index++;
			break;

		case EVENT.LoopEnd:
			if (stacks.length > 0) {
				const lastStack = stacks[stacks.length - 1];

				// If it is a first Loop End event, sets a counter value to it.
				if (lastStack.count < 0) {
					// Checks whether the loop is infinite and revises the number of loops if necessary.
					if (event[1] > 0) {
						lastStack.count = event[1];
					} else {
						console.warn(`Detected an infinite loop. Set number of loops to ${settings.infinityLoopCount}.`);
						lastStack.count = settings.infinityLoopCount;
					}

					// Checks whether it would be a "loop bomb" and revises the number of loops if necessary.
					// Note: "0xf5" means Musickey of RCP. As for RCP, >=0xf5 events don't have ST. But, as for MCP, TEMPO event (0xfa) also has ST. Won't fix.
					const beatNum = extractedEvents.slice(lastStack.extractedIndex).reduce((p, c) => ((c[0] < 0xf5) ? p + c[1] : p), 0) / timeBase;
					if (beatNum * lastStack.count >= settings.loopBombThreshold && lastStack.count > settings.infinityLoopCount) {
						console.warn(`Detected a loop bomb. Set number of loops to ${settings.infinityLoopCount}.`);
						lastStack.count = settings.infinityLoopCount;
					}
				}

				// Decrements the loop counter and moves the index up to the counter.
				lastStack.count--;
				if (lastStack.count > 0) {
					index = lastStack.index + 1;
					lastIndex = lastStack.lastIndex;
				} else {
					const _ = stacks.pop();
					console.assert(_.count === 0, {stacks});
					console.assert(_.lastIndex === lastStack.lastIndex, {stacks});
					index++;
				}

			} else {
				console.warn(`Detected a dangling Loop End event. Skipped.`);
				index++;
			}
			break;

		case EVENT.TrackEnd:
			if (stacks.length > 0) {
				console.warn(`Detected ${stacks.length}-level of unclosed loop. Skipped.`);
			}
			/* FALLTHRU */
		case EVENT.MeasEnd:
			if (lastIndex >= 0) {
				index = lastIndex + 1;
				lastIndex = -1;
			} else {
				index++;
			}
			extractedEvents.push([...event]);
			break;

		case EVENT.TrExcl:
		case EVENT.ExtCmd:
		case EVENT.Comment:
			{
				// Concatenates trailing F7 events.
				const longEvent = [...event];
				index++;

				if (events[index][0] !== EVENT.SecondEvt && event[0] === EVENT.TrExcl) {
					console.warn(`Detected an empty Tr.Excl event: [${hexStr(events[index - 1])}], [${hexStr(events[index])}], ...`);
				}

				while (events[index][0] === EVENT.SecondEvt) {
					longEvent.push(...convertEvent(events[index]).slice(1));
					index++;
				}

				// Trims trailing 0xf7.
				const end = String.fromCharCode(...longEvent).replace(/\xf7+$/u, '').length;
				extractedEvents.push(longEvent.slice(0, end));
			}
			break;

		case EVENT.SecondEvt:
			((settings.ignoreWrongEvent) ? validateAndIgnore : validateAndThrow)(false, `Detected an unexpected F7 event: [${hexStr(events[index])}]`);
			index++;
			break;

		default:
			extractedEvents.push([...event]);
			index++;
			break;
		}
	}

	return extractedEvents;

	function convertEvent4byte(bytes) {
		console.assert(bytes && bytes.length && bytes.length === 4, 'Invalid argument', {bytes});

		if (bytes[0] === EVENT_RCP.Comment || bytes[0] === EVENT_RCP.SecondEvt) {
			return [bytes[0], bytes[2], bytes[3]];
		} else if (bytes[0] === EVENT_RCP.SameMeas) {
			const measure = bytes[1] | ((bytes[2] & 0x03) << 8);
			const offset = (bytes[2] & 0xfc) | (bytes[3] << 8);
			return [bytes[0], measure, offset];
		} else {
			return [...bytes];
		}
	}
	function convertEvent6byte(bytes) {
		console.assert(bytes && bytes.length && bytes.length === 6, 'Invalid argument', {bytes});

		if (bytes[0] === EVENT_RCP.Comment || bytes[0] === EVENT_RCP.SecondEvt) {
			return [...bytes];
		} else if (bytes[0] === EVENT_RCP.SameMeas) {
			const measure = bytes[2] | (bytes[3] << 8);
			const offset = (bytes[4] | (bytes[5] << 8)) * 6 - 0xf2;
			return [bytes[0], measure, offset];
		} else {
			return [bytes[0], bytes[2] | (bytes[3] << 8), bytes[4] | (bytes[5] << 8), bytes[1]];
		}
	}
}

function extractRhythm(seqEvents, patternEvents, settings) {
	console.assert(Array.isArray(seqEvents), 'Invalid argument', {seqEvents});
	console.assert(Array.isArray(patternEvents), 'Invalid argument', {patternEvents});
	console.assert(settings, 'Invalid argument', {settings});

	const validate = (settings.ignoreWrongEvent) ? (isValid, message) => validateAndIgnore(isValid, message) : (isValid, message) => validateAndThrow(isValid, message);

	// Rhythm pattern track
	const patterns = patternEvents.reduce((p, c, i, a) => {
		if (i % (16 + 1) === 0 && c[0] !== EVENT_MCP.TrackEnd) {
			const pattern = a.slice(i, i + 16);
			if (validate(pattern.length === 16 && a[i + 16][0] === EVENT_MCP.MeasEnd, `Invalid rhythm pattern.`)) {
				p.push(pattern);
			} else {
				// Adds a dummy data.
				p.push([...[...new Array(16)].map((_) => [0x00, 0x00, 0x00, 0x00])]);
			}
		}
		return p;
	}, []);

	// Sequence track
	const extractedEvents = [];
	for (const seq of seqEvents) {
		if (seq[0] === EVENT_MCP.TrackEnd) {
			break;
		}

		// Chooses a rhythm pattern.
		const [patternNo, ...velValues] = seq;
		const pattern = patterns[patternNo - 1];

		// Extracts the rhythm pattern with velocity data from sequence track.
		if (validate(pattern, `Invalid rhythm pattern No.${patternNo}: [${hexStr(seq)}]`)) {
			for (const shot of pattern) {
				const st = shot[3];
				const velBits = shot.slice(0, 3).reduce((p, c) => {
					p.push(...[(c >> 6) & 0x03, (c >> 4) & 0x03, (c >> 2) & 0x03, c & 0x03]);
					return p;
				}, []);

				const events = velBits.reduce((p, c, i) => {
					if (c > 0) {
						const event = [
							//  BD, SD, LT, MT, HT, RS, HC, CH, OH, CC, RC
							[0, 36, 38, 41, 45, 48, 37, 39, 42, 44, 49, 51][i],	// Note No.
							0,					// Step time
							1,					// Gate time
							velValues[c - 1],	// Velocity
						];
						p.push(event);
					}
					return p;
				}, []);
				events.push([0, st, 0, 0]);	// For step time

				extractedEvents.push(...events);
			}

			// Adds a dummy End Measure event.
			extractedEvents.push([EVENT_MCP.MeasEnd, 0x00, 0xfd, 0x01]);
		}
	}

	return extractedEvents;
}

function calcSetupMeasureTick(beatN, beatD, timeBase, minTick) {
	console.assert(Number.isInteger(Math.log2(beatD)), 'Invalid argument', {beatD});

	const requiredTick = ((beatN === 3 && beatD === 4) || (beatN === 6 && beatD === 8)) ? timeBase * 3 : timeBase * 4;
	const unit = beatN * timeBase * 4 / beatD;

	let setupTick = unit * Math.trunc(requiredTick / unit);
	while (setupTick < requiredTick || setupTick < minTick) {
		setupTick += unit;
	}

	console.assert(Number.isInteger(setupTick));
	return setupTick;
}

function spaceEachSysEx(sysExs, maxTick, timeBase) {
	console.assert(sysExs && sysExs.length, 'Invalid argument', {sysExs});
	console.assert(sysExs.length <= maxTick, 'Too many SysEx', {sysExs});
	console.assert(maxTick >= timeBase, 'Too small tick time', {maxTick, timeBase});

	// Calculates the time required for sending and executing each of SysEx.
	const timings = sysExs.map((sysEx) => {
		// Transmit time of SysEx
		let usec = sysEx.length * (8 + 1 + 1) * 1000 * 1000 / 31250.0;

		// Additional wait time
		const [tmpF0, mfrId, deviceId, modelId, command, addrH, addrM, addrL, ...rest] = sysEx;
		console.assert(tmpF0 === 0xf0);
		console.assert(rest[rest.length - 1] === 0xf7);
		let isReset = false;
		if (mfrId === 0x41 && deviceId === 0x10 && command === 0x12) {
			switch (modelId) {
			case 0x16:	// MT-32/CM-64
				if (addrH === 0x7f) {
					// Waits for reset.
					// Note: If the wait time is too short, "Exc. Buffer overflow" error occurs when receiving next SysEx. (confirmed on MT-32 Ver.1.07)
					usec += 420 * 1000;
					isReset = true;
				} else if (0x00 < addrH && addrH <= 0x20) {
					// It is said that MT-32 Ver.1.xx requires 40 msec of delay between SysExs.
					// Note: Is it really needed for the later version of MT-32 and its upper compatible LA modules like CM-32L and CM-64?
					usec += 40 * 1000;
				} else {
					// DT1 needs more than 20 msec time interval.
					usec += 20 * 1000;
				}
				break;
			case 0x42:	// GS
				if (addrH === 0x40 && addrM === 0x00 && addrL === 0x7f) {
					// Waits for GS reset.
					usec += 50 * 1000;
					isReset = true;
				} else {
					// DT1 needs more than 20 msec time interval.
					usec += 20 * 1000;
				}
				break;
			default:
				console.assert(false);
				break;
			}
		}

		return {sysEx, usec, isReset};
	});

	// Calculates each tick time from the ratio of the time of each SysEx to the total time of SysEx.
	const totalUsec = timings.reduce((p, c) => p + c.usec, 0);
	timings.forEach((e) => {
		e.tick = Math.max(Math.trunc(e.usec * maxTick / totalUsec), 1);
		e.usecPerBeat = e.usec * timeBase / e.tick;
	});

	// Decreases each tick time to set all SysEx with in given time frame.
	while (getTotalTick(timings) > maxTick) {
		const minUsecPerBeat = Math.min(...timings.filter((e) => e.tick > 1).map((e) => e.usecPerBeat));
		timings.filter((e) => e.usecPerBeat === minUsecPerBeat).forEach((e) => {
			e.tick--;
			console.assert(e.tick > 0);
			e.usecPerBeat = e.usec * timeBase / e.tick;
		});
	}

	// Increases each tick time to make tempo faster as much as possible.
	while (getTotalTick(timings) < maxTick) {
		const maxUsecPerBeat = Math.max(...timings.map((e) => e.usecPerBeat));
		const elems = timings.filter((e) => e.usecPerBeat === maxUsecPerBeat);
		if (getTotalTick(timings) + elems.length > maxTick) {
			break;
		}
		elems.forEach((e) => {
			e.tick++;
			e.usecPerBeat = e.usec * timeBase / e.tick;
		});
	}

	return timings;

	function getTotalTick(timings) {
		return timings.reduce((p, c) => p + c.tick, 0);
	}
}

export function convertRcmToSeq(rcm, options) {
	// Checks the arguments.
	if (!rcm) {
		throw new Error(`Invalid argument: ${rcm}`);
	}

	// Makes a settings object from the default settings and the specified ones.
	const settings = {...defaultSettings, ...options};
	const bitsTable = {none: 0b00, left: 0b01, right: 0b10, both: 0b11};

	// Checks the settings.
	if (Object.keys(settings).filter((e) => /^trim/u.test(e)).some((e) => !Object.keys(bitsTable).includes(settings[e])) ||
	    Object.keys(settings).filter((e) => e in defaultSettings).some((e) => typeof settings[e] !== typeof defaultSettings[e]) ||
	    !['auto', 'signed', 'unsigned'].includes(settings.stPlus)) {
		throw new Error(`Invalid settings: ${settings}`);
	}

	// Makes functions from the settings.
	const setMetaTrackName   =                                     (track, timestamp, bytes) => setEvent(track, timestamp, makeMetaText(0x03, rawTrim(bytes, bitsTable[settings.trimTrackName])));
	const setMetaTextMemo    = (!settings.metaTextMemo)    ? nop : (track, timestamp, bytes) => setEvent(track, timestamp, makeMetaText(0x01, rawTrim(bytes, bitsTable[settings.trimTextMemo])));
	const setMetaTextComment = (!settings.metaTextComment) ? nop : (track, timestamp, bytes) => setEvent(track, timestamp, makeMetaText(0x01, rawTrim(bytes, bitsTable[settings.trimTextComment])));
	const setMetaTextUsrExc  = (!settings.metaTextUsrExc)  ? nop : (track, timestamp, bytes) => setEvent(track, timestamp, makeMetaText(0x01, rawTrim(bytes, bitsTable[settings.trimTextUsrExc])));
	const setMetaCue         = (!settings.metaCue)         ? nop : (track, timestamp, bytes) => setEvent(track, timestamp, makeMetaText(0x07, bytes));

	const makeNoteOff = (settings.noteOff) ? (chNo, noteNo) => makeMidiEvent(0x8, chNo, noteNo, settings.noteOffVel) : (chNo, noteNo) => makeMidiEvent(0x9, chNo, noteNo, 0);

	const validateRange = (settings.ignoreOutOfRange) ? (isValid, message) => validateAndIgnore(isValid, message) : (isValid, message) => validateAndThrow(isValid, message);
	const throwOrIgnore = (settings.ignoreWrongEvent) ? (message) => validateAndIgnore(false, message) : (message) => validateAndThrow(false, message);

	// SMF-related variables
	let startTime = 0;
	const seq = {
		timeBase: rcm.header.timeBase,
		tracks: [],
	};
	const smfBeat = {n: 4, d: 4};
	if (rcm.header.beatD !== 0 && (rcm.header.beatD & (rcm.header.beatD - 1) === 0)) {
		smfBeat.d = rcm.header.beatD;
		smfBeat.n = rcm.header.beatN;
	}
	const usecPerBeat = 60 * 1000 * 1000 / rcm.header.tempo;

	// Adds meta events to the conductor track.
	const conductorTrack = new Map();
	seq.tracks.push(conductorTrack);

	// Sequence Name and Text Events
	setMetaTrackName(conductorTrack, 0, rcm.header.title);
	if (rcm.header.memoLines && rcm.header.memoLines.some((e) => rawTrim(e).length > 0)) {
		for (const memoLine of rcm.header.memoLines) {
			setMetaTextMemo(conductorTrack, 0, memoLine);
		}
	}

	// Time Signature
	setEvent(conductorTrack, 0, [0xff, 0x58, 0x04, smfBeat.n, Math.log2(smfBeat.d), 0x18, 0x08]);

	// Key Signature
	setEvent(conductorTrack, 0, convertKeySignature(rcm.header.key));

	// Adds a setup measure which consists of SysEx converted from control files.
	if (rcm.header.sysExsMTD || rcm.header.sysExsCM6 || rcm.header.sysExsGSD || rcm.header.sysExsGSD2) {
		console.assert(!settings.ignoreCtrlFile);
		const allSysExs = [];

		// Adds SysEx for GS.
		if (rcm.header.sysExsGSD || rcm.header.sysExsGSD2) {
			// Inserts GS reset SysEx.
			if (settings.resetBeforeCtrl) {
				allSysExs.push([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7]);
			}
		}
		if (rcm.header.sysExsGSD) {
			// Adds SysEx from GSD file.
			allSysExs.push(...rcm.header.sysExsGSD);
		}
		if (rcm.header.sysExsGSD2) {
			// Adds SysEx from GSD2 file.
			// TODO: Support >16ch
			allSysExs.push(...rcm.header.sysExsGSD2);
		}

		// Adds SysEx for MT-32/CM-64.
		if (rcm.header.sysExsMTD || rcm.header.sysExsCM6) {
			// Inserts a reset SysEx.
			if (settings.resetBeforeCtrl) {
				allSysExs.push([0xf0, 0x41, 0x10, 0x16, 0x12, 0x7f, 0x00, 0x00, 0x00, 0x01, 0xf7]);
			}
		}
		if (rcm.header.sysExsMTD) {
			// Removes redundant SysEx. (For User Patch)
			const keys = new Set();
			const newSysExs = rcm.header.sysExsMTD.reduce((p, c) => {
				const key = c.slice(5, 8).map((e) => `${e}`).join(',');
				if (!keys.has(key)) {
					p.push(c);
					keys.add(key);
				}
				return p;
			}, []);
			// Adds SysEx from MTD file.
			allSysExs.push(...newSysExs);
		} else if (rcm.header.sysExsCM6) {
			// Adds SysEx from CM6 file.
			allSysExs.push(...rcm.header.sysExsCM6);
		}

		// Removes unnecessary SysEx.
		const sysExs = (settings.optimizeCtrl) ? allSysExs.filter((e) => !isSysExRedundant(e)) : allSysExs;

		// Decides each interval between SysExs.
		const extraTick = calcSetupMeasureTick(smfBeat.n, smfBeat.d, seq.timeBase, sysExs.length);
		const timings = spaceEachSysEx(sysExs, extraTick, seq.timeBase);
		const maxUsecPerBeat = Math.max(...timings.map((e) => e.usecPerBeat));

		// Sets tempo slow during sending SysExs if necessary.
		if (maxUsecPerBeat > usecPerBeat) {
			setEvent(conductorTrack, 0, makeMetaTempo(maxUsecPerBeat));
		}

		// Inserts SysExs from control files
		let timestamp = startTime;
		for (const timing of timings) {
			setEvent(conductorTrack, timestamp, timing.sysEx);
			timestamp += timing.tick;
		}

		// Sets original tempo.
		if (maxUsecPerBeat > usecPerBeat) {
			setEvent(conductorTrack, timestamp, makeMetaTempo(usecPerBeat));
		}

		startTime += extraTick;

	} else {
		// Set Tempo
		setEvent(conductorTrack, 0, makeMetaTempo(usecPerBeat));
	}

	// Converts each track.
	const EVENT = (rcm.header.isMCP) ? EVENT_MCP : EVENT_RCP;
	const isAllPortSame = ((new Set(rcm.tracks.map((e) => e.portNo))).size === 1);
	const isNoteOff = (rcm.header.isMCP) ? ((gt, st) => (gt < st)) : ((gt, st) => (gt <= st));
	let maxDuration = 0;
	for (const rcmTrack of rcm.tracks) {
		// Skips the track if it is empty or muted.
		if (!rcmTrack.extractedEvents || rcmTrack.extractedEvents.length <= 1 || (rcmTrack.mode & 0x01) !== 0) {
			continue;
		}

		const smfTrack = new Map();
		const noteGts = new Array(128).fill(-1);
		const patchNos = [...Array(128).keys()];
		const keyShift = (rcm.header.isMCP || (rcmTrack.keyShift & 0x80) !== 0) ? 0 : rcm.header.playBias + rcmTrack.keyShift - ((rcmTrack.keyShift >= 0x40) ? 0x80 : 0);
		let timestamp = startTime + (rcmTrack.stShift || 0);
		let {chNo, portNo, midiCh} = rcmTrack;
		let rolDev, rolBase, yamDev, yamBase;	// TODO: Investigate whether they belong to track or global.

		// Track Name
		setMetaTrackName(smfTrack, 0, rcmTrack.memo);

		// If any port No. are not same among all the track, adds an unofficial MIDI Port meta event. (FF 21 01 pp)
		if (!isAllPortSame) {
			setEvent(smfTrack, 0, [0xff, 0x21, 0x01, portNo]);
		}

		// Converts each RCM event to MIDI/SysEx/meta event.
		for (const event of rcmTrack.extractedEvents) {
			const [cmd, stOrg, gt, vel] = event;
			let st = stOrg;

			if (cmd < 0x80) {
				// Note event
				if (chNo >= 0 && gt > 0 && vel > 0) {
					if (validateRange(isIn7bitRange(vel), `Invalid note-on event: [${hexStr(event)}]`)) {
						const noteNo = cmd + keyShift;
						if (0 <= noteNo && noteNo < 0x80) {
							// Note on or tie
							if (noteGts[noteNo] < 0) {
								setEvent(smfTrack, timestamp, makeMidiEvent(0x9, chNo, noteNo, vel));
							}
							noteGts[noteNo] = gt;
						} else {
							console.warn(`Note No. of note-on event is out of range due to KEY+ and/or PLAY BIAS: (${cmd} -> ${noteNo}) Ignored.`);
						}
					}
				}

			} else {
				// Command event
				switch (cmd) {
				// MIDI messages
				case EVENT.CONTROL:
					if (chNo >= 0) {
						if (validateRange(isIn7bitRange(gt, vel), `Invalid CONTROL event: [${hexStr(event)}]`)) {
							setEvent(smfTrack, timestamp, makeMidiEvent(0xb, chNo, gt, vel));
						}
					}
					break;
				case EVENT.PITCH:
					if (chNo >= 0) {
						if (validateRange(isIn7bitRange(gt, vel), `Invalid PITCH event: [${hexStr(event)}]`)) {
							setEvent(smfTrack, timestamp, makeMidiEvent(0xe, chNo, gt, vel));
						}
					}
					break;
				case EVENT.AFTER_C:
					if (chNo >= 0) {
						if (validateRange(isIn7bitRange(gt), `Invalid AFTER C. event: [${hexStr(event)}]`)) {
							setEvent(smfTrack, timestamp, makeMidiEvent(0xd, chNo, gt));
						}
					}
					break;
				case EVENT.AFTER_K:
					if (chNo >= 0) {
						if (validateRange(isIn7bitRange(gt, vel), `Invalid AFTER K. event: [${hexStr(event)}]`)) {
							setEvent(smfTrack, timestamp, makeMidiEvent(0xa, chNo, gt, vel));
						}
					}
					break;
				case EVENT.PROGRAM:
					if (chNo >= 0) {
						if (validateRange(isIn7bitRange(gt), `Invalid PROGRAM event: [${hexStr(event)}]`)) {
							setEvent(smfTrack, timestamp, makeMidiEvent(0xc, chNo, gt));
						}
					}
					break;
				case EVENT.BankPrgL:
				case EVENT.BankPrg:
					if (chNo >= 0) {
						if (validateRange(isIn7bitRange(gt, vel), `Invalid BankPrg event: [${hexStr(event)}]`)) {
							// Note: According to the MIDI spec, Bank Select must be transmitted as a pair of MSB and LSB.
							// But, a BankPrg event is converted to a single MSB or LSB at the current implementation.
							setEvent(smfTrack, timestamp, makeMidiEvent(0xb, chNo, (cmd === EVENT.BankPrg) ? 0 : 32, vel));
							setEvent(smfTrack, timestamp, makeMidiEvent(0xc, chNo, gt));
						}
					}
					break;
				case EVENT.UserPrg:
					if (chNo >= 0) {
						if (validateRange((0 <= gt && gt < 192), `Invalid PROGRAM (User Program) event: [${hexStr(event)}]`)) {
							// Inserts a SysEx to set Patch Memory if necessary.
							const progNo = gt & 0x7f;
							if (patchNos[progNo] !== gt && rcm.header.patches) {
								const addr = progNo * 8;
								const bytes = [0x41, 0x10, 0x16, 0x12, 0x83, 0x05, (addr >> 7) & 0x7f, addr & 0x7f, ...rcm.header.patches[gt], 0x84];
								console.assert(bytes.length === 17);
								setEvent(smfTrack, timestamp, convertSysEx(bytes, 0, 0, 0));
								patchNos[progNo] = gt;
							}

							setEvent(smfTrack, timestamp, [0xc0 | chNo, progNo]);
						}
					}
					break;

				// SysEx
				case EVENT.UsrExc0:
				case EVENT.UsrExc1:
				case EVENT.UsrExc2:
				case EVENT.UsrExc3:
				case EVENT.UsrExc4:
				case EVENT.UsrExc5:
				case EVENT.UsrExc6:
				case EVENT.UsrExc7:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid UsrExc event: [${hexStr(event)}]`)) {
						const index = cmd - EVENT.UsrExc0;
						const {bytes, memo} = rcm.header.userSysExs[index];
						const sysEx = convertSysEx(bytes, (isAllPortSame) ? chNo : midiCh, gt, vel);
						if (validateRange(sysEx && isIn7bitRange(sysEx.slice(1, -1)), `Invalid definition of UsrExc${index}: [${hexStr(bytes)}]`)) {
							setMetaTextUsrExc(smfTrack, timestamp, memo);
							setEvent(smfTrack, timestamp, sysEx);
						}
					}
					break;
				case EVENT.TrExcl:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid Tr.Excl event: [${hexStr(event)}]`)) {
						const bytes = event.slice(4);
						if (bytes.length > 0) {
							const sysEx = convertSysEx(bytes, (isAllPortSame) ? chNo : midiCh, gt, vel);
							if (validateRange(sysEx && isIn7bitRange(sysEx.slice(1, -1)), `Invalid definition of Tr.Excl: [${hexStr(bytes)}]`)) {
								setEvent(smfTrack, timestamp, sysEx);
							}
						}
					}
					break;

				// 1-byte DT1 SysEx for Roland devices
				case EVENT.RolBase:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid RolBase event: [${hexStr(event)}]`)) {
						rolBase = [gt, vel];
					}
					break;
				case EVENT.RolDev:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid RolDev# event: [${hexStr(event)}]`)) {
						rolDev = [gt, vel];
					}
					break;
				case EVENT.RolPara:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid RolPara event: [${hexStr(event)}]`)) {
						// Initializes RolDev# and RolBase if they have not been set yet.
						if (!rolDev) {
							rolDev = [settings.rolandDevId, settings.rolandModelId];
							console.warn(`RolDev# has not been set yet. Initialized to [${hexStr(rolDev)}].`);
						}
						// Makes a SysEx by UsrExcl/Tr.Excl parser.
						if (rolBase) {
							const bytes = [0x41, ...rolDev, 0x12, 0x83, ...rolBase, 0x80, 0x81, 0x84];
							console.assert(bytes.length === 10);
							setEvent(smfTrack, timestamp, convertSysEx(bytes, 0, gt, vel));
						} else {
							console.warn(`RolBase has not been set yet. Skipped RolPara: [${hexStr(event)}]`);
						}
					}
					break;

				// 1-byte parameter change SysEx for YAMAHA XG devices
				case EVENT.YamBase:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid YamBase event: [${hexStr(event)}]`)) {
						yamBase = [gt, vel];
					}
					break;
				case EVENT.YamDev:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid YamDev# event: [${hexStr(event)}]`)) {
						yamDev = [gt, vel];
					}
					break;
				case EVENT.XGPara:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid XGPara event: [${hexStr(event)}]`)) {
						yamDev = [0x10, 0x4c];	// Note: Is it really OK to overwrite YamDev#?
					}
					/* FALLTHRU */
				case EVENT.YamPara:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid YamPara event: [${hexStr(event)}]`)) {
						// Initializes YamDev# and YamBase if they have not been set yet.
						if (!yamDev) {
							yamDev = [settings.yamahaDevId, settings.yamahaModelId];
							console.warn(`YamDev# has not been set yet. Initialized to [${hexStr(yamDev)}].`);
						}
						// Makes a SysEx.
						if (yamBase) {
							const bytes = [0xf0, 0x43, ...yamDev, ...yamBase, gt, vel, 0xf7];
							console.assert(bytes.length === 9);
							setEvent(smfTrack, timestamp, bytes);
						} else {
							console.warn(`YamBase has not been set yet. Skipped YamPara: [${hexStr(event)}]`);
						}
					}
					break;

				// Meta events
				case EVENT.MIDI_CH:
					if (validateRange((0 <= gt && gt <= 32), `Invalid MIDI CH. event: [${hexStr(event)}]`)) {
						const oldPortNo = portNo;
						midiCh = gt - 1;	// The internal representations of MIDI CH. are different between track headers and event.
						chNo   = (midiCh >= 0) ? midiCh % 16 : -1;
						portNo = (midiCh >= 0) ? Math.trunc(midiCh / 16) : portNo;

						// Adds an unofficial MIDI Port meta event if necessary.
						if (portNo !== oldPortNo) {
							// TODO: Investigate whether this event can be appeared in the song body.
							setEvent(smfTrack, timestamp, [0xff, 0x21, 0x01, portNo]);
						}
					}
					break;

				case EVENT.TEMPO:
					if (validateRange((gt > 0), `Invalid tempo rate: ${gt}`)) {	// Note: It can be greater than 255 in G36.
						if (vel !== 0) {
							// TODO: Support tempo gradation.
							console.warn(`Tempo gradation is not supported yet: ${vel}`);
						}
						setEvent(conductorTrack, timestamp, makeMetaTempo(60 * 1000 * 1000 * 64.0 / (rcm.header.tempo * gt)));
					}
					break;

				case EVENT.MusicKey:
					setEvent(conductorTrack, timestamp, convertKeySignature(stOrg));
					st = 0;
					break;

				case EVENT.Comment:
					setMetaTextComment(smfTrack, timestamp, event.slice(1));
					st = 0;
					break;

				case EVENT.ExtCmd:
					{
						const kind = (gt === 0x00) ? 'MCI: ' : (gt === 0x01) ? 'RUN: ' : '???: ';
						setMetaCue(conductorTrack, timestamp, [...strToBytes(kind), ...event.slice(4)]);
					}
					break;

				case EVENT.KeyScan:
					{
						const cue = {
							12: 'Suspend playing',
							18: 'Increase play bias',
							23: 'Stop playing',
							32: 'Show main screen',
							33: 'Show 11th track',
							34: 'Show 12th track',
							35: 'Show 13th track',
							36: 'Show 14th track',
							37: 'Show 15th track',
							38: 'Show 16th track',
							39: 'Show 17th track',
							40: 'Show 18th track',
							48: 'Show 10th track',
							49: 'Show 1st track',
							50: 'Show 2nd track',
							51: 'Show 3rd track',
							52: 'Show 4th track',
							53: 'Show 5th track',
							54: 'Show 6th track',
							55: 'Show 7th track',
							56: 'Show 8th track',
							57: 'Show 9th track',
							61: 'Mute 1st track',
						}[gt] || 'Unknown';
						setMetaCue(conductorTrack, timestamp, [...strToBytes(`KeyScan: ${cue}`)]);
					}
					break;

				// RCM commands
				case EVENT.MeasEnd:
					st = 0;
					break;
				case EVENT.TrackEnd:
					// Expands the current step time to wait for all of note-off.
					st = Math.max(...noteGts, 0);
					break;

				case EVENT.SecondEvt:
				case EVENT.LoopEnd:
				case EVENT.LoopStart:
				case EVENT.SameMeas:
					console.assert(false, 'Such kind of events must be resolved in the previous phase', {event});
					throwOrIgnore(`Unexpected event: [${hexStr(event)}]`);
					break;

				// Special commands for particular devices
				case EVENT.DX7FUNC:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid DX7FUNC event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x08, gt, vel, 0xf7]);
					}
					break;
				case EVENT.DX_PARA:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid DX.PARA event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x00, gt, vel, 0xf7]);
					}
					break;
				case EVENT.DX_PERF:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid DX.PERF event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x04, gt, vel, 0xf7]);
					}
					break;
				case EVENT.TX_FUNC:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid TX.FUNC event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x11, gt, vel, 0xf7]);
					}
					break;
				case EVENT.FB_01_P:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid FB-01 P event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x15, gt, vel, 0xf7]);
					}
					break;
				case EVENT.FB_01_S:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid FB-01 S event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x75, 0x01, 0x10, gt, vel, 0xf7]);
					}
					break;
				case EVENT.TX81Z_V:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid TX81Z V event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x12, gt, vel, 0xf7]);
					}
					break;
				case EVENT.TX81Z_A:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid TX81Z A event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x13, gt, vel, 0xf7]);
					}
					break;
				case EVENT.TX81Z_P:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid TX81Z P event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x10, gt, vel, 0xf7]);
					}
					break;
				case EVENT.TX81Z_S:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid TX81Z S event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x10, 0x7b, gt, vel, 0xf7]);
					}
					break;
				case EVENT.TX81Z_E:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid TX81Z E event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x10, 0x7c, gt, vel, 0xf7]);
					}
					break;
				case EVENT.DX7_2_R:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid DX7-2 R event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x1b, gt, vel, 0xf7]);
					}
					break;
				case EVENT.DX7_2_A:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid DX7-2 A event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x18, gt, vel, 0xf7]);
					}
					break;
				case EVENT.DX7_2_P:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid DX7-2 P event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x19, gt, vel, 0xf7]);
					}
					break;
				case EVENT.TX802_P:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid TX802 P event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x1a, gt, vel, 0xf7]);
					}
					break;
				case EVENT.MKS_7:
					if (validateRange(isIn7bitRange(gt, vel), `Invalid MKS-7 event: [${hexStr(event)}]`)) {
						setEvent(smfTrack, timestamp, [0xf0, 0x41, 0x32, 0x01, gt, vel, 0xf7]);
					}
					break;
				case EVENT.CMU_800:
					console.warn(`CMU-800 is not supported: ${gt}`);
					break;

				default:
					throwOrIgnore(`Unknown event: [${hexStr(event)}]`);
					st = 0;
					break;
				}
			}

			// Note off
			if (chNo >= 0) {
				for (let noteNo = 0; noteNo < noteGts.length; noteNo++) {
					const noteGt = noteGts[noteNo];
					if (noteGt < 0) {
						continue;
					}

					if (isNoteOff(noteGt, st)) {
						setEvent(smfTrack, timestamp + noteGt, makeNoteOff(chNo, noteNo));
						noteGts[noteNo] = -1;
					} else {
						noteGts[noteNo] -= st;
					}
				}
			}

			timestamp += st;
		}

		// End of Track
		setEvent(smfTrack, timestamp, [0xff, 0x2f, 0x00]);
		if (timestamp > maxDuration) {
			maxDuration = timestamp;
		}

		seq.tracks.push(smfTrack);
	}

	// End of Track for the conductor track
	setEvent(conductorTrack, maxDuration, [0xff, 0x2f, 0x00]);

	return seq;

	function setEvent(map, timestamp, bytes) {
		console.assert(map instanceof Map, 'Invalid argument', {map});
		console.assert(Number.isInteger(timestamp), 'Invalid argument', {timestamp});
		console.assert(bytes && bytes.length, 'Invalid argument', {bytes});

		if (timestamp < 0) {
			console.warn(`An event appeared previous to the zero point due to ST+. Adjusted it to zero: (${timestamp} -> 0)`);
			timestamp = 0;
		}
		if (!map.has(timestamp)) {
			map.set(timestamp, []);
		}
		map.get(timestamp).push(bytes);
	}

	function convertSysEx(bytes, ch, gt, vel) {
		console.assert(bytes && bytes.length, 'Invalid argument', {bytes});

		const sysEx = [0xf0];
		let checkSum = 0;
		loop: for (const byte of bytes) {
			let value = byte;
			switch (byte) {
			case 0x80:	// [gt]
				value = gt;
				break;
			case 0x81:	// [ve]
				value = vel;
				break;
			case 0x82:	// [ch]
				if (ch < 0) {
					return null;
				}
				value = ch;
				break;
			case 0x83:	// [cs]
				checkSum = 0;
				continue;
			case 0x84:	// [ss]
				value = (0x80 - checkSum) & 0x7f;
				break;
			case 0xf7:
				break loop;
			default:
				break;
			}

			if (!isIn7bitRange(value)) {
				return null;
			}

			// Adds a value and updates the checksum.
			sysEx.push(value);
			checkSum = (checkSum + value) & 0x7f;
		}

		// Adds trailing 0xf7.
		console.assert(sysEx[sysEx.length - 1] !== 0xf7);
		sysEx.push(0xf7);

		return sysEx;
	}

	function convertKeySignature(value) {
		console.assert(Number.isInteger(value), 'Invalid argument', {value});
		const tmp = value & 0x0f;
		const sf = (tmp < 8) ? tmp : 8 - tmp;
		console.assert(-7 <= sf && sf <= 7);
		const mi = ((value & 0x10) === 0) ? 0x00 : 0x01;
		return [0xff, 0x59, 0x02, (sf + 0x100) & 0xff, mi];
	}

	function makeMidiEvent(kind, ch, ...values) {
		console.assert((0x8 <= kind && kind <= 0xe), 'Invalid argument', {kind});
		console.assert((0 <= ch && ch < 16), 'Invalid argument', {ch});
		console.assert(values && values.length === [2, 2, 2, 2, 1, 1, 2][kind - 0x8], 'Invalid argument', {values});
		console.assert(values.some((e) => Number.isInteger(e) && (e & ~0x7f) === 0), 'Invalid argument', {values});
		return [(kind << 4) | ch, ...values];
	}

	function makeMetaText(kind, bytes) {
		console.assert((0x01 <= kind && kind <= 0x0f), 'Invalid argument', {kind});
		console.assert(bytes && 'length' in bytes, 'Invalid argument', {bytes});
		return [0xff, kind, ...varNum(bytes.length), ...bytes];
	}

	function makeMetaTempo(usecPerBeat) {
		console.assert(Number.isFinite(usecPerBeat), 'Invalid argument', {usecPerBeat});
		const bytes = new Uint8Array(4);
		(new DataView(bytes.buffer)).setUint32(0, Math.trunc(usecPerBeat));
		return [0xff, 0x51, 0x03, ...bytes.slice(1)];
	}
}

export function convertSeqToSmf(seq) {
	console.assert(seq, 'Invalid argument', {seq});

	// Makes a header chunk.
	const mthd = [
		...strToBytes('MThd'),
		...uintBE(2 + 2 + 2, 4),
		...uintBE(1, 2),
		...uintBE(seq.tracks.length, 2),
		...uintBE(seq.timeBase, 2),
	];

	// Makes track chunks.
	const mtrks = seq.tracks.map((smfTrack) => {
		let prevTime = 0;
		let lastStatus = 0;
		const mtrk = [...smfTrack.entries()].sort((a, b) => a[0] - b[0]).reduce((p, c) => {
			const [timestamp, events] = c;

			// Makes MTrk events.
			const bytes = [];
			for (const event of events) {
				// Delta time
				const deltaTime = timestamp - prevTime;
				bytes.push(...varNum(deltaTime));
				prevTime = timestamp;

				// Event
				const status = event[0];
				if (status < 0xf0) {
					// Channel messages
					console.assert(status >= 0x80);
					if (status === lastStatus) {
						// Applies running status rule.
						bytes.push(...event.slice(1));
					} else {
						bytes.push(...event);
					}
					lastStatus = status;

				} else if (status === 0xf0) {
					// SysEx
					bytes.push(0xf0, ...varNum(event.length - 1), ...event.slice(1));
					lastStatus = 0;

				} else {
					// Meta events
					console.assert(status === 0xff);	// This converter doesn't generate F7 SysEx.
					bytes.push(...event);
					lastStatus = 0;
				}
			}

			p.push(...bytes);
			return p;
		}, []);

		// Extracts MTrk events with a leading MTrk header.
		return [...strToBytes('MTrk'), ...uintBE(mtrk.length, 4), ...mtrk];
	});

	// Extracts track events with a leading header chunk.
	const smf = mthd.concat(...mtrks);

	return new Uint8Array(smf);

	function uintBE(value, width) {
		console.assert(Number.isInteger(value) && (width === 2 || width === 4), 'Invalid argument', {value, width});
		const bytes = [];
		for (let i = 0; i < width; i++) {
			bytes.unshift(value & 0xff);
			value >>= 8;
		}
		console.assert(value === 0);
		return bytes;
	}
}

function varNum(value) {
	console.assert(Number.isInteger(value) && (0 <= value && value < 0x10000000), 'Invalid argument', {value});
	if (value < 0x80) {
		return [value];
	} else if (value < 0x4000) {
		return [(value >> 7) | 0x80, value & 0x7f];
	} else if (value < 0x200000) {
		return [(value >> 14) | 0x80, ((value >> 7) & 0x7f) | 0x80, value & 0x7f];
	} else {
		return [(value >> 21) | 0x80, ((value >> 14) & 0x7f) | 0x80, ((value >> 7) & 0x7f) | 0x80, value & 0x7f];
	}
}

function hexStr(bytes) {
	console.assert(bytes && 'length' in bytes, 'Invalid argument', {bytes});
	return [...bytes].map((e) => e.toString(16).padStart(2, '0')).join(' ');
}

function strToBytes(str) {
	console.assert(typeof str === 'string' && /^[\x20-\x7E]*$/u.test(str), 'Invalid argument', {str});
	return str.split('').map((e) => e.codePointAt(0));
}

function rawTrim(bytes, bits = 0b11) {
	console.assert(bytes && 'length' in bytes, 'Invalid argument', {bytes});
	console.assert(Number.isInteger(bits) && (bits & ~0b11) === 0, 'Invalid argument', {bits});

	if (bytes.every((e) => e === 0x20)) {
		return new Uint8Array();
	}

	const begin = ((bits & 0b01) === 0) ? 0         : bytes.findIndex((e) => e !== 0x20);
	const end   = ((bits & 0b10) === 0) ? undefined : String.fromCharCode(...bytes).replace(/\x20+$/u, '').length;

	return bytes.slice(begin, end);
}

function rawTrimNul(bytes) {
	console.assert(bytes && 'length' in bytes, 'Invalid argument', {bytes});

	const index = bytes.indexOf(0x00);
	if (index < 0) {
		return bytes;
	} else {
		return bytes.slice(0, index);
	}
}

function isIn7bitRange(...values) {
	console.assert(values && values.length, 'Invalid argument', {values});
	return values.every((e) => (e & ~0x7f) === 0);
}

function validateAndThrow(isValid, message) {
	if (!isValid) {
		throw new Error(message);
	}
	return true;
}

function validateAndIgnore(isValid, message) {
	if (!isValid) {
		console.warn(`${message} Ignored.`);
	}
	return isValid;
}

function nop() {
	/* EMPTY */
}
