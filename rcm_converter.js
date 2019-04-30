import {convertMTDToSysEx, convertCM6ToSysEx, convertGSDToSysEx, isSysExRedundant} from './rcm_ctrl_converter.js';

// Settings (TODO: Can be specified from users)
const defaultSettings = {
	maxLoopNestLevel:           5,
	loopNumChangedFromInfLoop:  2,
	thresholdBeatNumOfLoopBomb: 4000,

	initialRolDevDeviceId: 0x10,
	initialRolDevModelId:  0x16,
	initialYamDevDeviceId: 0x10,
	initialYamDevModelId:  0x16,	// TODO: Investigate actual value.
};

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
	MusicKey:    -1,
	Comment:     -1,
	SecondEvt:   -1,
	LoopEnd:   0xfb,	// Loop End
	LoopStart: 0xfc,	// Loop Start
	SameMeas:    -1,
	MeasEnd:   0xfd,	// Measure End
	TrackEnd:  0xfe,	// End of Track
	CMU_800:   0xf9,	// CMU-800
	UserPrg:   0xe0,	// Program Change (User Patch)
};

export async function parseRCM(buf, controlFileReader) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error('Invalid argument');
	}

	// Parses the data as RCP format. If it failed, parses it again as G36 format.
	const rcm = parseRCP(buf) || parseG36(buf) || parseMCP(buf);
	if (!rcm) {
		throw new Error('Not RECOMPOSER file');
	}

	// Reads and parses control files.
	for (const kind of ['MTD', 'CM6', 'GSD', 'GSD2']) {
		if (!controlFileReader) {
			console.error('Control file reader is not specified');
			break;
		}

		const name  = `fileName${kind}`;
		const data  = `fileData${kind}`;
		const sysEx = `sysExs${kind}`;

		if (rcm.header[name] && rcm.header[name].length > 0) {
			// Reads the control file.
			const fileName = String.fromCharCode(...rcm.header[name]);
			const buf = await controlFileReader(fileName, (/^[\x20-\x7E]*$/u.test(fileName)) ? undefined : rcm.header[name]).catch((e) => {
				console.error(`Control file not found.`, e);
			});

			// Parses the control file.
			if (buf) {
				const sysExs = {
					MTD:  convertMTDToSysEx,
					CM6:  convertCM6ToSysEx,
					GSD:  convertGSDToSysEx,
					GSD2: convertGSDToSysEx,
				}[kind](buf);
				if (!sysExs) {
					console.error(`Not ${kind.slice(0, 3)} file.`);
					continue;
				}

				rcm.header[data]  = buf;
				rcm.header[sysEx] = sysExs;

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
		}
	}

	// Executes post-processing for each track.
	if (!rcm.header.isMCP) {
		// For RCP/G36
		for (const track of rcm.tracks) {
			// Sets MIDI channel No. and port No.
			track.chNo   = (track.midiCh >= 0) ? track.midiCh % 16 : -1;
			track.portNo = (track.midiCh >= 0) ? Math.trunc(track.midiCh / 16) : 0;

			// Extracts same measures and loops.
			track.extractedEvents = extractEvents(track.events, rcm.header.timeBase, false);
		}
	} else {
		// For MCP
		for (const track of rcm.tracks.slice(1, -1)) {
			// Sets MIDI channel No.
			track.chNo = (track.midiCh >= 0) ? track.midiCh : -1;

			// Extracts loops.
			track.extractedEvents = extractEvents(track.events, rcm.header.timeBase, true);
		}

		// Extracts rhythm track.
		console.assert(rcm.tracks.length >= 10);
		const seqTrack     = rcm.tracks[9];
		const patternTrack = rcm.tracks[0];

		seqTrack.chNo = seqTrack.midiCh;
		seqTrack.extractedEvents = extractRhythm(seqTrack.events, patternTrack.events);
	}

	return rcm;
}

export function parseRCP(buf) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error('Invalid argument');
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
	rcm.header.isF = (trackNum === 0);

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
		throw new Error('Invalid argument');
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

export function parseMCP(buf) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error('Invalid argument');
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
	const rcm = {header: {}, tracks: []};

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

	rcm.header.maxTracks = 1 + 8 + 1;
	rcm.header.isMCP = true;

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

function extractEvents(events, timeBase, isMCP) {
	console.assert(Array.isArray(events), 'Invalid argument', {events});
	console.assert(timeBase > 0, 'Invalid argument', {timeBase});

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
	for (let index = 0; index < events.length;) {	// TODO: Avoid infinity loop
		const event = convertEvent(events[index]);

		// Resolves Same Measure event.
		if (event[0] === EVENT.SameMeas) {
			// If it is already in Same Measure mode, quits Same Measure.
			if (lastIndex >= 0) {
				// Leaves Same Measure mode and goes backs to the previous position.
				index = lastIndex + 1;
				lastIndex = -1;

				// Adds a dummy End Measure event.
				extractedEvents.push([EVENT.MeasEnd, 0, 0xfc, 0xfc]);

			} else {
				// Enters Same Measure mode.
				lastIndex = index;

				// If the previous event isn't an End Measure event, adds a dummy End Measure event.
				if (index > 0 && events[index - 1][0] !== EVENT.MeasEnd && events[index - 1][0] !== EVENT.SameMeas) {
					extractedEvents.push([EVENT.MeasEnd, 0, 0xfc, 0xfc]);
				}

				// Moves the current index to the measure.	// TODO: Avoid infinity loop
				while (events[index][0] === EVENT.SameMeas) {
					const [cmd, measure, offset] = convertEvent(events[index]);
					console.assert(cmd === EVENT.SameMeas, {cmd, measure, offset});
					index = (offset - HEADER_LENGTH) / EVENT_LENGTH;
					if (!Number.isInteger(index)) {
						throw new Error(`Invalid event ${events[index]}`);
					}
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
			if (stacks.length < defaultSettings.maxLoopNestLevel) {
				stacks.push({index, lastIndex,
					count: -1,
					extractedIndex: (extractedEvents.length > 0) ? extractedEvents.length - 1 : 0,
				});
			} else {
				console.warn(`Detected more than ${defaultSettings.maxLoopNestLevel}-level of nested loops. Ignored.`);
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
						console.warn(`Detected an infinite loop. Set number of loops to ${defaultSettings.loopNumChangedFromInfLoop}.`);
						lastStack.count = defaultSettings.loopNumChangedFromInfLoop;
					}

					// Checks whether it would be a "loop bomb" and revises the number of loops if necessary.
					const beatNum = extractedEvents.slice(lastStack.extractedIndex).reduce((p, c) => ((c[0] <= 0xf5) ? p + c[1] : p), 0) / timeBase;
					if (beatNum * lastStack.count >= defaultSettings.thresholdBeatNumOfLoopBomb && lastStack.count > defaultSettings.loopNumChangedFromInfLoop) {
						console.warn(`Detected a loop bomb. Set number of loops to ${defaultSettings.loopNumChangedFromInfLoop}.`);
						lastStack.count = defaultSettings.loopNumChangedFromInfLoop;
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
				console.warn(`Detected an unexpected Loop End event. Ignored.`);
				index++;
			}
			break;

		case EVENT.TrackEnd:
			if (stacks.length > 0) {
				console.warn(`Detected ${stacks.length}-level of unclosed loop. Ignored.`);
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
			console.warn(`Detected an unexpected F7 event. Ignored.`);
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

function extractRhythm(seqEvents, patternEvents) {
	console.assert(Array.isArray(seqEvents), 'Invalid argument', {seqEvents});
	console.assert(Array.isArray(patternEvents), 'Invalid argument', {patternEvents});

	// Rhythm pattern track
	const patterns = patternEvents.reduce((p, c, i, a) => {
		if (i % (16 + 1) === 0 && c[0] !== EVENT_MCP.TrackEnd) {
			const pattern = a.slice(i, i + 16);
			if (pattern.length !== 16 || a[i + 16][0] !== EVENT_MCP.MeasEnd) {
				console.warn(`Invalid rhythm pattern. Ignored.`);
			} else {
				p.push(pattern);
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
		if (!pattern) {
			console.warn(`Invalid rhythm pattern No.${patternNo}. Ignored.`);
			continue;
		}

		// Extracts the rhythm pattern with velocity data from sequence track.
		for (const shot of pattern) {
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
			events.push([0, shot[3], 0, 0]);	// For step time

			extractedEvents.push(...events);
		}
	}

	return extractedEvents;
}

function calcSetupMeasureLength(beatN, beatD, timeBase/* , minTick = 0 */) {	// TODO: Consider minTick
	console.assert(Number.isInteger(Math.log2(beatD)), 'Invalid argument', {beatD});

	if ((beatN === 3 && beatD === 4) || (beatN === 6 && beatD === 8)) {
		return timeBase * 3;	// Special case
	}

	const unit = timeBase * 4 / beatD;
	let measureLen = unit * beatN;
	while (measureLen < timeBase * 4) {
		measureLen += unit;
	}

	console.assert(Number.isInteger(measureLen) && measureLen % timeBase === 0);
	return measureLen;
}

function spaceEachSysEx(sysExs, totalTick, timeBase) {
	console.assert(sysExs && sysExs.length, 'Invalid argument', {sysExs});
	console.assert(sysExs.length <= totalTick, 'Too many SysEx', {sysExs});
	console.assert(totalTick >= timeBase, 'Too small tick time', {totalTick, timeBase});

	// Calculates each tick time from the ratio of the size of each SysEx to the total size of SysEx.
	const totalBytes = sysExs.reduce((p, c) => p + c.length, 0);
	const timings = sysExs.map((sysEx) => {
		const tick = Math.max(Math.trunc(sysEx.length * totalTick / totalBytes), 1);
		const usecPerBeat = getUsecPerBeat(sysEx.length, tick);
		return {sysEx, tick, usecPerBeat};
	});

	// Decreases each tick time to set all SysEx with in given time frame.
	while (getTotalTick(timings) > totalTick) {
		const minUsecPerBeat = Math.min(...timings.filter((e) => e.tick > 1).map((e) => e.usecPerBeat));
		timings.filter((e) => e.usecPerBeat === minUsecPerBeat).forEach((e) => {
			e.tick--;
			console.assert(e.tick > 0);
			e.usecPerBeat = getUsecPerBeat(e.sysEx.length, e.tick);
		});
	}

	// Increases each tick time to make tempo faster as much as possible.
	while (getTotalTick(timings) < totalTick) {
		const maxUsecPerBeat = Math.max(...timings.map((e) => e.usecPerBeat));
		const elems = timings.filter((e) => e.usecPerBeat === maxUsecPerBeat);
		if (getTotalTick(timings) + elems.length > totalTick) {
			break;
		}
		elems.forEach((e) => {
			e.tick++;
			e.usecPerBeat = getUsecPerBeat(e.sysEx.length, e.tick);
		});
	}

	return timings;

	function getTotalTick(timings) {
		return timings.reduce((p, c) => p + c.tick, 0);
	}

	function getUsecPerBeat(size, tick) {
		return Math.trunc(size * 320 * timeBase / tick);
	}
}

export function convertRcmToSeq(rcm) {
	console.assert(rcm, 'Invalid argument', {rcm});

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

	// Adds meta events to the conductor track.
	const conductorTrack = new Map();
	seq.tracks.push(conductorTrack);

	// Sequence Name and Text Events
	setSeq(conductorTrack, 0, makeText(0x03, rawTrim(rcm.header.title)));
	if (rcm.header.memoLines && rcm.header.memoLines.some((e) => rawTrim(e).length > 0)) {
		for (const memoLine of rcm.header.memoLines) {
			setSeq(conductorTrack, 0, makeText(0x01, memoLine));
		}
	}

	// Time Signature
	setSeq(conductorTrack, 0, [0xff, 0x58, 0x04, smfBeat.n, Math.log2(smfBeat.d), 0x18, 0x08]);

	// Key Signature
	setSeq(conductorTrack, 0, makeKeySignature(rcm.header.key));

	// Adds a setup measure which consists of SysEx converted from control files.
	if (rcm.header.sysExsMTD || rcm.header.sysExsCM6 || rcm.header.sysExsGSD || rcm.header.sysExsGSD2) {
		// Gathers all the SysExs.
		const allSysExs = [];
		if (rcm.header.sysExsMTD || rcm.header.sysExsCM6) {
			// Inserts a reset SysEx.
			allSysExs.push([0xf0, 0x41, 0x10, 0x16, 0x12, 0x7f, 0x00, 0x00, 0x00, 0x01, 0xf7]);
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
		if (rcm.header.sysExsGSD || rcm.header.sysExsGSD2) {
			// Inserts GS reset SysEx.
			allSysExs.push([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7]);
		}
		if (rcm.header.sysExsGSD) {
			// Adds SysEx from GSd file.
			allSysExs.push(...rcm.header.sysExsGSD);
		}
		if (rcm.header.sysExsGSD2) {
			// Adds SysEx from GSD2 file.
			// TODO: Support >16ch
			allSysExs.push(...rcm.header.sysExsGSD2);
		}

		// Removes unnecessary SysEx.
		const sysExs = allSysExs.filter((e) => !isSysExRedundant(e));

		// Decides each interval between SysExs.
		const extraSt = calcSetupMeasureLength(smfBeat.n, smfBeat.d, seq.timeBase);
		const timings = spaceEachSysEx(sysExs, extraSt, seq.timeBase);
		const maxUsecPerBeat = Math.max(...timings.map((e) => e.usecPerBeat));

		// Sets tempo slow during the setup measure.
		setSeq(conductorTrack, startTime, makeTempo(maxUsecPerBeat));

		// Inserts SysExs from control files
		let timestamp = startTime;
		for (const timing of timings) {
			setSeq(conductorTrack, timestamp, timing.sysEx);
			timestamp += timing.tick;
		}

		startTime += extraSt;
	}

	// Set Tempo
	setSeq(conductorTrack, startTime, makeTempo(60 * 1000 * 1000 / rcm.header.tempo));

	// Converts each track.
	const EVENT = (rcm.header.isMCP) ? EVENT_MCP : EVENT_RCP;
	const isNoteOff = (rcm.header.isMCP) ? ((gt, st) => (gt < st)) : ((gt, st) => (gt <= st));
	const isAllPortSame = ((new Set(rcm.tracks.map((e) => e.portNo))).size === 1);
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
		let {chNo, portNo} = rcmTrack;
		let rolDev, rolBase, yamDev, yamBase;	// TODO: Investigate whether they belong to track or global.

		// Track Name
		setSeq(smfTrack, 0, makeText(0x03, rawTrim(rcmTrack.memo)));

		// If any port No. are not same among all the track, adds an unofficial MIDI Port meta event. (0x21)
		if (!isAllPortSame) {
			setSeq(smfTrack, 0, [0xff, 0x21, 0x01, portNo]);
		}

		// Converts each RCM event to MIDI/SysEx/meta event.
		for (const event of rcmTrack.extractedEvents) {
			const [cmd, stOrg, gt, vel] = event;
			let st = stOrg;

			if (cmd < 0x80) {
				// Note event
				if (chNo >= 0 && gt > 0 && vel > 0) {
					const noteNo = cmd + keyShift;
					if (0 <= noteNo && noteNo < 0x80) {
						// Note on or tie
						if (noteGts[noteNo] < 0) {
							setSeq(smfTrack, timestamp, [0x90 | chNo, noteNo, vel]);
						}
						noteGts[noteNo] = gt;
					} else {
						console.warn(`Note-on event (${cmd}) was out of range due to KEY+ and/or PLAY BIAS. Ignored.`);
					}
				}

			} else {
				// Command event
				switch (cmd) {
				// SysEx
				case EVENT.UsrExc0:
				case EVENT.UsrExc1:
				case EVENT.UsrExc2:
				case EVENT.UsrExc3:
				case EVENT.UsrExc4:
				case EVENT.UsrExc5:
				case EVENT.UsrExc6:
				case EVENT.UsrExc7:
					throwUnless7bit(gt, vel);
					{
						const {bytes, memo} = rcm.header.userSysExs[cmd - 0x90];
						setSeq(smfTrack, timestamp, makeText(0x01, rawTrim(memo)));
						setSeq(smfTrack, timestamp, makeSysEx(bytes, chNo, gt, vel));
					}
					break;
				case EVENT.TrExcl:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, makeSysEx(event.slice(4), chNo, gt, vel));
					break;

				// MIDI messages
				case EVENT.BankPrgL:
				case EVENT.BankPrg:
					// Note: According to the MIDI spec, Bank Select must be transmitted as a pair of MSB and LSB.
					// But, a BankPrg event is converted to a single MSB or LSB at the current implementation.
					if (chNo >= 0) {
						throwUnless7bit(gt, vel);
						setSeq(smfTrack, timestamp, [0xb0 | chNo, (cmd === 0xe2) ? 0 : 32, vel]);
						setSeq(smfTrack, timestamp, [0xc0 | chNo, gt]);
					}
					break;

				case EVENT.UserPrg:
					if (chNo >= 0) {
						if (gt < 0 || 192 <= gt) {
							throw new Error(`Invalid value ${gt}`);
						}

						// Inserts a SysEx to set Patch Memory if necessary.
						const progNo = gt & 0x7f;
						if (patchNos[progNo] !== gt && rcm.header.patches) {
							const addr = progNo * 8;
							const bytes = [0x41, 0x10, 0x16, 0x12, 0x83, 0x05, (addr >> 7) & 0x7f, addr & 0x7f, ...rcm.header.patches[gt], 0x84];
							console.assert(bytes.length === 17);
							setSeq(smfTrack, timestamp, makeSysEx(bytes, chNo, 0, 0));
							patchNos[progNo] = gt;
						}

						setSeq(smfTrack, timestamp, [0xc0 | chNo, progNo]);
					}
					break;

				case EVENT.AFTER_C:
					if (chNo >= 0) {
						throwUnless7bit(gt);
						setSeq(smfTrack, timestamp, [0xd0 | chNo, gt]);
					}
					break;
				case EVENT.CONTROL:
					if (chNo >= 0) {
						throwUnless7bit(gt, vel);
						setSeq(smfTrack, timestamp, [0xb0 | chNo, gt, vel]);
					}
					break;
				case EVENT.PROGRAM:
					if (chNo >= 0) {
						throwUnless7bit(gt);
						setSeq(smfTrack, timestamp, [0xc0 | chNo, gt]);
					}
					break;
				case EVENT.AFTER_K:
					if (chNo >= 0) {
						throwUnless7bit(gt, vel);
						setSeq(smfTrack, timestamp, [0xa0 | chNo, gt, vel]);
					}
					break;
				case EVENT.PITCH:
					if (chNo >= 0) {
						throwUnless7bit(gt, vel);
						setSeq(smfTrack, timestamp, [0xe0 | chNo, gt, vel]);
					}
					break;

				// 1-byte DT1 SysEx for Roland devices
				case EVENT.RolBase:
					throwUnless7bit(gt, vel);
					rolBase = [gt, vel];
					break;
				case EVENT.RolDev:
					throwUnless7bit(gt, vel);
					rolDev = [gt, vel];
					break;
				case EVENT.RolPara:
					throwUnless7bit(gt, vel);
					{
						// Initializes RolDev# and RolBase if they have not been set yet.
						if (!rolDev) {
							rolDev = [defaultSettings.initialRolDevDeviceId, defaultSettings.initialRolDevModelId];
							console.warn(`RolDev# has not been set yet. Initialized to [${rolDev}].`);
						}
						if (!rolBase) {
							rolBase = [0x00, 0x00];
							console.warn(`RolBase has not been set yet. Initialized to [${rolBase}].`);
						}

						// Makes a SysEx by UsrExcl/Tr.Excl parser.
						const bytes = [0x41, ...rolDev, 0x12, 0x83, ...rolBase, 0x80, 0x81, 0x84];
						console.assert(bytes.length === 10);
						setSeq(smfTrack, timestamp, makeSysEx(bytes, chNo, gt, vel));
					}
					break;

				// 1-byte parameter change SysEx for YAMAHA XG devices
				case EVENT.YamBase:
					throwUnless7bit(gt, vel);
					yamBase = [gt, vel];
					break;
				case EVENT.YamDev:
					throwUnless7bit(gt, vel);
					yamDev = [gt, vel];
					break;
				case EVENT.XGPara:
					throwUnless7bit(gt, vel);
					yamDev = [0x10, 0x4c];	// Note: Is it really OK to overwrite YamDev#?
					/* FALLTHRU */
				case EVENT.YamPara:
					throwUnless7bit(gt, vel);
					{
						// Initializes YamDev# and YamBase if they have not been set yet.
						if (!yamDev) {
							yamDev = [defaultSettings.initialYamDevDeviceId, defaultSettings.initialYamDevModelId];
							console.warn(`YamDev# has not been set yet. Initialized to [${yamDev}].`);
						}
						if (!yamBase) {
							yamBase = [0x00, 0x00];
							console.warn(`YamBase has not been set yet. Initialized to [${yamBase}].`);
						}

						// Makes a SysEx.
						const bytes = [0xf0, 0x43, ...yamDev, ...yamBase, gt, vel, 0xf7];
						console.assert(bytes.length === 9);
						setSeq(smfTrack, timestamp, bytes);
					}
					break;

				// Meta events
				case EVENT.MIDI_CH:
					if (0 < gt && gt <= 32) {
						const oldPortNo = portNo;
						const midiCh = gt - 1;	// The internal representations of MIDI CH. are different between track headers and event.
						chNo   = (midiCh >= 0) ? midiCh % 16 : -1;
						portNo = (midiCh >= 0) ? Math.trunc(midiCh / 16) : portNo;

						// Adds an unofficial MIDI Port meta event if necessary.
						if (portNo !== oldPortNo) {
							// TODO: Investigate whether this event can be appeared in the song body.
							setSeq(smfTrack, timestamp, [0xff, 0x21, 0x01, portNo]);
						}
					}
					break;

				case EVENT.TEMPO:
					if (gt === 0) {
						throw new Error(`Invalid tempo rate ${gt}`);
					}
					setSeq(conductorTrack, timestamp, makeTempo(60 * 1000 * 1000 * 64.0 / (rcm.header.tempo * gt)));
					if (vel !== 0) {
						// TODO: Support tempo gradation
						console.warn('Tempo gradation is not supported yet.', {vel});
					}
					break;

				case EVENT.MusicKey:
					setSeq(conductorTrack, timestamp, makeKeySignature(st));
					st = 0;
					break;

				case EVENT.Comment:
					setSeq(smfTrack, timestamp, makeText(0x01, event.slice(1)));
					st = 0;
					break;

				case EVENT.ExtCmd:
					{
						const kind = (event[2] === 0x00) ? 'MCI: ' : (event[2] === 0x01) ? 'RUN: ' : '???: ';
						setSeq(conductorTrack, timestamp, makeText(0x07, [...strToBytes(kind), ...event.slice(4)]));
					}
					break;

				case EVENT.KeyScan:
					{
						const cue = {
							12: 'suspend playing',
							18: 'increase play bias',
							23: 'stop playing',
							32: 'show main screen',
							33: 'show 11th track',
							34: 'show 12th track',
							35: 'show 13th track',
							36: 'show 14th track',
							37: 'show 15th track',
							38: 'show 16th track',
							39: 'show 17th track',
							40: 'show 18th track',
							48: 'show 10th track',
							49: 'show 1st track',
							50: 'show 2nd track',
							51: 'show 3rd track',
							52: 'show 4th track',
							53: 'show 5th track',
							54: 'show 6th track',
							55: 'show 7th track',
							56: 'show 8th track',
							57: 'show 9th track',
							61: 'mute 1st track',
						}[gt] || 'unknown';
						setSeq(conductorTrack, timestamp, makeText(0x07, [...strToBytes(`KeyScan: ${cue}`)]));
					}
					break;

				// RCM commands
				case EVENT.SecondEvt:
				case EVENT.LoopEnd:
				case EVENT.LoopStart:
				case EVENT.SameMeas:
					console.assert(false, 'Such kind of events must be resolved in the previous phase', {event});
					break;

				case EVENT.MeasEnd:
					st = 0;
					break;
				case EVENT.TrackEnd:
					// Expands the current step time to wait for all of note-off.
					st = Math.max(...noteGts, 0);
					break;

				// Special commands for particular devices
				case EVENT.DX7FUNC:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x08, gt, vel, 0xf7]);
					break;
				case EVENT.DX_PARA:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x00, gt, vel, 0xf7]);
					break;
				case EVENT.DX_PERF:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x04, gt, vel, 0xf7]);
					break;
				case EVENT.TX_FUNC:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x11, gt, vel, 0xf7]);
					break;
				case EVENT.FB_01_P:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x15, gt, vel, 0xf7]);
					break;
				case EVENT.FB_01_S:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x75, 0x01, 0x10, gt, vel, 0xf7]);
					break;
				case EVENT.TX81Z_V:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x12, gt, vel, 0xf7]);
					break;
				case EVENT.TX81Z_A:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x13, gt, vel, 0xf7]);
					break;
				case EVENT.TX81Z_P:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x10, gt, vel, 0xf7]);
					break;
				case EVENT.TX81Z_S:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x10, 0x7b, gt, vel, 0xf7]);
					break;
				case EVENT.TX81Z_E:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x10, 0x7c, gt, vel, 0xf7]);
					break;
				case EVENT.DX7_2_R:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x1b, gt, vel, 0xf7]);
					break;
				case EVENT.DX7_2_A:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x18, gt, vel, 0xf7]);
					break;
				case EVENT.DX7_2_P:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x19, gt, vel, 0xf7]);
					break;
				case EVENT.TX802_P:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x43, 0x11, 0x1a, gt, vel, 0xf7]);
					break;
				case EVENT.MKS_7:
					throwUnless7bit(gt, vel);
					setSeq(smfTrack, timestamp, [0xf0, 0x41, 0x32, 0x01, gt, vel, 0xf7]);
					break;

				default:
					console.warn(`Unknown command: ${event.map((e) => e.toString(16).padStart(2, '0')).join(' ')}. Ignored.`);
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
						setSeq(smfTrack, timestamp + noteGt, [0x90 | chNo, noteNo, 0]);
						noteGts[noteNo] = -1;
					} else {
						noteGts[noteNo] -= st;
					}
				}
			}

			timestamp += st;
		}

		// End of Track
		setSeq(smfTrack, timestamp, [0xff, 0x2f, 0x00]);
		if (timestamp > maxDuration) {
			maxDuration = timestamp;
		}

		seq.tracks.push(smfTrack);
	}

	// End of Track for the conductor track
	setSeq(conductorTrack, maxDuration, [0xff, 0x2f, 0x00]);

	return seq;

	function throwUnless7bit(...values) {
		console.assert(values && values.length, 'Invalid argument', {values});
		if (values.some((e) => !Number.isInteger(e) || (e < 0 || 0x80 <= e))) {
			throw new Error(`Invalid value ${values}`);
		}
	}

	// TODO: Support "overwrite" when some kind of "global" meta event is added at the same timestamp. (e.g. Set Tempo)
	function setSeq(map, timestamp, mes) {
		console.assert(map instanceof Map, 'Invalid argument', {map});
		console.assert(Number.isInteger(timestamp), 'Invalid argument', {timestamp});
		console.assert(mes && mes.length, 'Invalid argument', {mes});

		if (timestamp < 0) {
			console.warn(`An event appeared previous to the zero point due to ST+. Adjusted it to zero.`);
			timestamp = 0;
		}
		if (!map.has(timestamp)) {
			map.set(timestamp, []);
		}
		map.get(timestamp).push(mes);
	}

	function makeSysEx(bytes, ch, gt, vel) {
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
				throwUnless7bit(byte);
				break;
			}
			throwUnless7bit(value);

			// Adds a value and updates the checksum.
			sysEx.push(value);
			checkSum = (checkSum + value) & 0x7f;
		}

		// Adds trailing 0xf7.
		console.assert(sysEx[sysEx.length - 1] !== 0xf7);
		sysEx.push(0xf7);

		return sysEx;
	}

	function makeText(kind, bytes) {
		console.assert((0x01 <= kind && kind <= 0x0f), 'Invalid argument', {kind});
		console.assert(bytes && 'length' in bytes, 'Invalid argument', {bytes});
		return [0xff, kind, ...varNum(bytes.length), ...bytes];
	}

	function makeTempo(usecPerBeat) {
		console.assert(Number.isFinite(usecPerBeat), 'Invalid argument', {usecPerBeat});
		const bytes = new Uint8Array(4);
		(new DataView(bytes.buffer)).setUint32(0, Math.trunc(usecPerBeat));
		return [0xff, 0x51, 0x03, ...bytes.slice(1)];
	}

	function makeKeySignature(value) {
		console.assert(Number.isInteger(value), 'Invalid argument', {value});
		const tmp = value & 0x0f;
		const sf = (tmp < 8) ? tmp : 8 - tmp;
		console.assert(-7 <= sf && sf <= 7);
		const mi = ((value & 0x10) === 0) ? 0x00 : 0x01;
		return [0xff, 0x59, 0x02, (sf + 0x100) & 0xff, mi];
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

function strToBytes(str) {
	console.assert(typeof str === 'string' && /^[\x20-\x7E]*$/u.test(str), 'Invalid argument', {str});
	return str.split('').map((e) => e.codePointAt(0));
}

function rawTrim(buf) {
	console.assert(buf instanceof Uint8Array, 'Invalid argument', {buf});

	if (buf.every((e) => e === 0x20)) {
		return new Uint8Array();
	}

	const begin = buf.findIndex((e) => e !== 0x20);
	const end = String.fromCharCode(...buf).replace(/\x20+$/u, '').length;
	console.assert(begin < end);

	return buf.slice(begin, end);
}

function rawTrimNul(buf) {
	console.assert(buf instanceof Uint8Array, 'Invalid argument', {buf});

	const index = buf.indexOf(0x00);
	if (index < 0) {
		return buf;
	} else {
		return buf.slice(0, index);
	}
}
