// Settings	(TODO: Can be specified from users)
const defaultSettings = {
	maxLoopNestLevel:           5,
	loopNumChangedFromInfLoop:  2,
	thresholdBeatNumOfLoopBomb: 4000,

	initialRolDevDeviceId: 0x10,
	initialRolDevModelId:  0x16,
	initialYamDevDeviceId: 0x10,
	initialYamDevModelId:  0x16,
};

export async function rcm2smf(buf, controlFileReader) {
	// Checks the arguments.
	if (!buf || !buf.length) {
		throw new Error('Invalid argument');
	}

	// Converts from RCP/G36 to SMF.
	const rcm = await parseRCM(buf, controlFileReader);
	const seq = convertRcmToSeq(rcm);
	const smf = convertSeqToSmf(seq, rcm.header.timeBase);

	return smf;
}

export async function parseRCM(buf, controlFileReader) {
	// Checks the arguments.
	if (!buf || !buf.length || buf.length < 518 + 512 + 384) {
		throw new Error('Invalid argument');
	}

	// Parses the data as RCP format. If it failed, parses it again as G36 format.
	const rcm = parseRCP(buf) || parseG36(buf);
	if (!rcm) {
		throw new Error('Not RECOMPOSER file');
	}

	// Reads control files.
	for (const kind of ['CM6', 'GSD', 'GSD2']) {
		const name = `fileName${kind}`;
		const data = `fileData${kind}`;

		if (rcm.header[name] && rcm.header[name].length > 0) {
			const fileName = String.fromCodePoint(...rcm.header[name]);
			if (controlFileReader) {
				rcm.header[data] = await controlFileReader(fileName, (/^[\x20-\x7E]*$/u.test(fileName)) ? undefined : rcm.header[name]).catch((e) => {
					console.error(`Not found: ${fileName}`, e);
				});
			} else {
				console.error('Control file reader is not specified');
			}
		}
	}

	// Executes post-processing for each track.
	for (const track of rcm.tracks) {
		// Sets MIDI channel No. and port No.
		track.chNo   = (track.midiCh >= 0) ? track.midiCh % 16 : -1;
		track.portNo = (track.midiCh >= 0) ? Math.trunc(track.midiCh / 16) : 0;

		// Extracts same measures and loops.
		track.extractedEvents = extractEvents(track.events, rcm.header.timeBase);
	}

	return rcm;
}

function parseRCP(buf) {
	console.assert(buf && buf.length, 'Invalid argument', {buf});

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

function parseG36(buf) {
	console.assert(buf && buf.length, 'Invalid argument', {buf});

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

function convertCM6ToSysEx(buf) {
	console.assert(buf && buf.length, 'Invalid argument', {buf});

	// Checks the file header.
	if (buf.length < 0x5843 ||
	    !String.fromCharCode(...buf.slice(0x0000, 0x000d)).startsWith('COME ON MUSIC') ||
	    !String.fromCharCode(...buf.slice(0x0010, 0x001a)).startsWith('R ')) {
		return null;
	}

	const sysExs = [];

	// [LA SOUND PART]
	// System Area
	sysExs.push(makeSysEx(buf.slice(0x0080, 0x0098), 0x10, 0x00, 0x00));

	// Timbre Memory (#1 - #64)
	for (let i = 0; i < 64; i++) {
		const index = 0x0e34 + i * 0x100;
		sysExs.push(makeSysEx(buf.slice(index, index + 0x100), 0x08, i * 2, 0x00));
	}

	// Rhythm Setup Temporary Area
	sysExs.push(makeSysEx(buf.slice(0x0130, 0x0230), 0x03, 0x01, 0x10));	// #24 - #87
	sysExs.push(makeSysEx(buf.slice(0x0230, 0x0284), 0x03, 0x03, 0x10));	// #88 - #108

	// Patch Temporary Area
	sysExs.push(makeSysEx(buf.slice(0x00a0, 0x0130), 0x03, 0x00, 0x00));

	// Timbre Temporary Area
	for (let i = 0; i < 8; i++) {
		const addr = i * 0xf6;
		const index = 0x0284 + addr;
		sysExs.push(makeSysEx(buf.slice(index, index + 0xf6), 0x04, addr >> 7, addr & 0x7f));
	}

	// Patch Memory (#1 - #128)
	for (let i = 0; i < 8; i++) {
		const index = 0x0a34 + i * 0x80;
		sysExs.push(makeSysEx(buf.slice(index, index + 0x80), 0x05, i, 0x00));
	}

	// [PCM SOUND PART]
	// Patch Temporary Area
	sysExs.push(makeSysEx(buf.slice(0x4e34, 0x4ef1), 0x50, 0x00, 0x00));

	// Patch Memory (#1 - #128)
	for (let i = 0; i < 16; i++) {
		const addr = i * 0x98;
		const index = 0x4eb2 + addr;
		sysExs.push(makeSysEx(buf.slice(index, index + 0x98), 0x51, addr >> 7, addr & 0x7f));
	}

	// System Area
	sysExs.push(makeSysEx(buf.slice(0x5832, 0x5843), 0x52, 0x00, 0x00));

	console.assert(sysExs.every((e) => e.length <= 256 + 10), 'Too long SysEx', {sysExs});
	return sysExs;

	function makeSysEx(bytes, addrH, addrM, addrL) {
		console.assert([addrH, addrM, addrL].every((e) => (0x00 <= e && e < 0x80)), 'Invalid address', {addrH, addrM, addrL});
		const sysEx = [0xf0, 0x41, 0x10, 0x16, 0x12, addrH, addrM, addrL, ...bytes, 0, 0xf7];
		sysEx[sysEx.length - 2] = checkSum(sysEx.slice(5, -2));
		return sysEx;
	}
}

function convertGSDToSysEx(buf) {
	console.assert(buf && buf.length, 'Invalid argument', {buf});

	// Checks the file header.
	if (buf.length < 0x0a71 ||
	    !String.fromCharCode(...buf.slice(0x0000, 0x000d)).startsWith('COME ON MUSIC') ||
	    !String.fromCharCode(...buf.slice(0x000e, 0x001c)).startsWith('GS CONTROL 1.0')) {
		return null;
	}

	const sysExs = [];

	// Master Tune
	sysExs.push(makeSysEx(buf.slice(0x0020, 0x0024), 0x40, 0x00, 0x00));

	// Master Volume, Master Key Shift, and Master Panpot
	for (let i = 0; i < 3; i++) {
		sysExs.push(makeSysEx([buf[0x0024 + i]], 0x40, 0x00, 0x04 + i));
	}

	// Reverb
	for (let i = 0; i < 7; i++) {
		sysExs.push(makeSysEx([buf[0x0027 + i]], 0x40, 0x01, 0x30 + i));
	}

	// Chorus
	for (let i = 0; i < 8; i++) {
		sysExs.push(makeSysEx([buf[0x002e + i]], 0x40, 0x01, 0x38 + i));
	}

	// Voice Reserve
	sysExs.push(makeSysEx([0x04f9, 0x00af, 0x0129, 0x01a3, 0x021d, 0x0297, 0x0311, 0x038b, 0x0405, 0x047f, 0x0573, 0x05ed, 0x0667, 0x06e1, 0x075b, 0x07d5].map((e) => buf[e]), 0x40, 0x01, 0x10));

	// Patch Parameter
	for (let i = 0; i < 16; i++) {
		const index = 0x0036 + i * 0x7a;
		const bytes = buf.slice(index, index + 0x7a);
		const addr = 0x90 + 0xe0 * [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15][i];
		sysExs.push(...makeSysExsForPatch(bytes, 0x48, addr >> 7, addr & 0x7f));
	}

	// Drum Setup Parameter
	for (let i = 0; i < 2; i++) {
		const index = 0x07d6 + i * 0x148;
		const bytes = buf.slice(index, index + 0x148);
		const zeroes = new Array(128).fill(0);
		const [level, panpot, reverb, chorus] = bytes.reduce((p, c, i) => {
			p[i % 4][27 + Math.trunc(i / 4)] = c;
			return p;
		}, [[...zeroes], [...zeroes], [...zeroes], [...zeroes]]);

		sysExs.push(makeSysEx(nibblize(...level.slice(0, 64)),  0x49, 0x02 + i * 0x10, 0x00));
		sysExs.push(makeSysEx(nibblize(...level.slice(64)),     0x49, 0x03 + i * 0x10, 0x00));
		sysExs.push(makeSysEx(nibblize(...panpot.slice(0, 64)), 0x49, 0x06 + i * 0x10, 0x00));
		sysExs.push(makeSysEx(nibblize(...panpot.slice(64)),    0x49, 0x07 + i * 0x10, 0x00));
		sysExs.push(makeSysEx(nibblize(...reverb.slice(0, 64)), 0x49, 0x08 + i * 0x10, 0x00));
		sysExs.push(makeSysEx(nibblize(...reverb.slice(64)),    0x49, 0x09 + i * 0x10, 0x00));
		sysExs.push(makeSysEx(nibblize(...chorus.slice(0, 64)), 0x49, 0x0a + i * 0x10, 0x00));
		sysExs.push(makeSysEx(nibblize(...chorus.slice(64)),    0x49, 0x0b + i * 0x10, 0x00));
	}

	// Master Fine Tune and Master Course Tuning
	// (Needed to add universal SysEx?)

	console.assert(sysExs.every((e) => e.length <= 256 + 10), 'Too long SysEx', {sysExs});
	return sysExs;

	function nibblize(...values) {
		return values.reduce((p, c) => {
			p.push((c >> 4) & 0x0f, c & 0x0f);
			return p;
		}, []);
	}

	function makeSysEx(bytes, addrH, addrM, addrL) {
		console.assert([addrH, addrM, addrL].every((e) => (0x00 <= e && e < 0x80)), 'Invalid address', {addrH, addrM, addrL});
		const sysEx = [0xf0, 0x41, 0x10, 0x42, 0x12, addrH, addrM, addrL, ...bytes, 0, 0xf7];
		sysEx[sysEx.length - 2] = checkSum(sysEx.slice(5, -2));
		return sysEx;
	}

	function makeSysExsForPatch(bytes, addrH, addrM, addrL) {
		console.assert([addrH, addrM, addrL].every((e) => (0x00 <= e && e < 0x80)), 'Invalid address', {addrH, addrM, addrL});

		const nibbles = [];

		// [0-3] Tone Number (Bank LSB & Program Change)
		nibbles.push(...nibblize(bytes[0x00], bytes[0x01]));
		console.assert(nibbles.length === 4, {nibbles});

		// [4-7] Rx. parameters
		nibbles.push(...bytes.slice(0x03, 0x13).reduce((p, c, i) => {
			const bit = c & 0x01;
			if (i % 4 === 0) {
				p.push(bit << 3);
			} else {
				p[p.length - 1] |= bit << (3 - i % 4);
			}
			return p;
		}, []));
		console.assert(nibbles.length === 8, {nibbles});

		// [8-9] MIDI Ch.
		nibbles.push(...nibblize(bytes[0x02]));
		console.assert(nibbles.length === 10, {nibbles});

		// [10-11] MONO/POLY Mode, Assign Mode, and Use For Rhythm Part
		nibbles.push(((bytes[0x13] & 0x01) << 3) | ((bytes[0x15] & 0x03) << 1) | ((bytes[0x15] > 0) ? 0x01 : 0x00), bytes[0x14] & 0x03);
		console.assert(nibbles.length === 12, {nibbles});

		// [12-15] Pitch Key Shift and Pitch Offset Fine
		nibbles.push(...nibblize(bytes[0x16]), bytes[0x17] & 0x0f, bytes[0x18] & 0x0f);
		console.assert(nibbles.length === 16, {nibbles});

		// [16-27] Part Level, Part Panpot, Velocity Sense Offset, Velocity Sense Depth, Key Range Low, and Key Range High
		nibbles.push(...nibblize(bytes[0x19]), ...nibblize(bytes[0x1c]), ...nibblize(bytes[0x1b]), ...nibblize(bytes[0x1a]), ...nibblize(bytes[0x1d]), ...nibblize(bytes[0x1e]));
		console.assert(nibbles.length === 28, {nibbles});

		// [28-47] Chorus Send Depth, Reverb Send Depth, and Tone Modify 1-8
		nibbles.push(...nibblize(...bytes.slice(0x21, 0x2b)));
		console.assert(nibbles.length === 48, {nibbles});

		// [48-51] Zero
		nibbles.push(0, 0, 0, 0);
		console.assert(nibbles.length === 52, {nibbles});

		// [52-75] Scale Tuning C to B
		nibbles.push(...nibblize(...bytes.slice(0x2b, 0x37)));
		console.assert(nibbles.length === 76, {nibbles});

		// [76-79] CC1/CC2 Controller Number
		nibbles.push(...nibblize(...bytes.slice(0x1f, 0x21)));
		console.assert(nibbles.length === 80, {nibbles});

		// [80-223] Destination Controllers
		for (let i = 0; i < 6; i++) {
			const index = 0x37 + i * 11;
			nibbles.push(...nibblize(...bytes.slice(index, index + 3)), 0, 0, ...nibblize(...bytes.slice(index + 3, index + 11)));
		}
		console.assert(nibbles.length === 224, {nibbles});
		console.assert(nibbles.every((e) => (0x0 <= e && e < 0x10)), 'Invalid SysEx nibble', {nibbles});

		// Divides the whole data by 2 packets.
		return [0, 1].map((i) => {
			const packet = nibbles.slice(i * 128, (i + 1) * 128);
			const sysEx = [0xf0, 0x41, 0x10, 0x42, 0x12, addrH, addrM + i, addrL, ...packet, 0, 0xf7];
			sysEx[sysEx.length - 2] = checkSum(sysEx.slice(5, -2));
			return sysEx;
		});
	}
}

function extractEvents(events, timeBase) {
	console.assert(events && events.length, 'Invalid argument', {events});
	console.assert(timeBase > 0, 'Invalid argument', {timeBase});

	// Sets constants and chooses event parser.
	const EVENT_LENGTH = events[0].length;
	console.assert(EVENT_LENGTH === 4 || EVENT_LENGTH === 6, 'Event length must be 4 or 6', {EVENT_LENGTH});
	console.assert(events.every((e) => e.length === EVENT_LENGTH), 'All of events must be same length', {events});
	const HEADER_LENGTH = (EVENT_LENGTH === 4) ? 44 : 46;
	const convertEvent = (EVENT_LENGTH === 4) ? convertEvent4byte : convertEvent6byte;

	// Extracts same measures and loops.
	const extractedEvents = [];
	const stacks = [];
	let lastIndex = -1;
	for (let index = 0; index < events.length;) {	// TODO: Avoid infinity loop
		const event = convertEvent(events[index]);

		// Resolves Same Measure (FC) event.
		if (event[0] === 0xfc) {
			// If it is already in Same Measure mode, quits Same Measure.
			if (lastIndex >= 0) {
				// Leaves Same Measure mode and goes backs to the previous position.
				index = lastIndex + 1;
				lastIndex = -1;

				// Adds a dummy End Measure event.
				extractedEvents.push([0xfd, 0, 0xfc, 0xfc]);

			} else {
				// Enters Same Measure mode.
				lastIndex = index;

				// If the previous event isn't an End Measure event, adds a dummy End Measure event.
				if (index > 0 && events[index - 1][0] !== 0xfd && events[index - 1][0] !== 0xfc) {
					extractedEvents.push([0xfd, 0, 0xfc, 0xfc]);
				}

				// Moves the current index to the measure.	// TODO: Avoid infinity loop
				while (events[index][0] === 0xfc) {
					const [cmd, measure, offset] = convertEvent(events[index]);
					console.assert(cmd === 0xfc, {cmd, measure, offset});
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
		case 0xfc:	// Same Measure
			console.assert(false, 'Same Measure event must be resolved', {event});
			break;

		case 0xf9:	// Loop Start
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

		case 0xf8:	// Loop End
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

		case 0xfe:	// End of Track
			if (stacks.length > 0) {
				console.warn(`Detected ${stacks.length}-level of unclosed loop. Ignored.`);
			}
			/* FALLTHRU */
		case 0xfd:	// Measure End
			if (lastIndex >= 0) {
				index = lastIndex + 1;
				lastIndex = -1;
			} else {
				index++;
			}
			extractedEvents.push([...event]);
			break;

		case 0x98:	// Channel Exclusive
		case 0x99:	// External Command
		case 0xf6:	// Comment Start
			{
				// Concats trailing F7 events.
				const concattedEvent = [...event];
				index++;
				while (events[index][0] === 0xf7) {
					concattedEvent.push(...convertEvent(events[index]).slice(1));
					index++;
				}

				// Trims trailing 0xf7.
				const end = String.fromCodePoint(...concattedEvent).replace(/\xf7+$/u, '').length;
				extractedEvents.push(concattedEvent.slice(0, end));
			}
			break;

		case 0xf7:	// 2nd Event
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

		if (bytes[0] === 0xf6 || bytes[0] === 0xf7) {
			return [bytes[0], bytes[2], bytes[3]];
		} else if (bytes[0] === 0xfc) {
			const measure = bytes[1] | ((bytes[2] & 0x03) << 8);
			const offset = (bytes[2] & 0xfc) | (bytes[3] << 8);
			return [bytes[0], measure, offset];
		} else {
			return [...bytes];
		}
	}
	function convertEvent6byte(bytes) {
		console.assert(bytes && bytes.length && bytes.length === 6, 'Invalid argument', {bytes});

		if (bytes[0] === 0xf6 || bytes[0] === 0xf7) {
			return [...bytes];
		} else if (bytes[0] === 0xfc) {
			const measure = bytes[2] | (bytes[3] << 8);
			const offset = (bytes[4] | (bytes[5] << 8)) * 6 - 0xf2;
			return [bytes[0], measure, offset];
		} else {
			return [bytes[0], bytes[2] | (bytes[3] << 8), bytes[4] | (bytes[5] << 8), bytes[1]];
		}
	}
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

function convertRcmToSeq(rcm) {
	console.assert(rcm, 'Invalid argument', {rcm});

	let baseTime = 0;
	const smf = {
		tracks: [],
	};

	const smfBeat = {n: 4, d: 4};
	if (rcm.header.beatD !== 0 && (rcm.header.beatD & (rcm.header.beatD - 1) === 0)) {
		smfBeat.d = rcm.header.beatD;
		smfBeat.n = rcm.header.beatN;
	}

	// Adds meta events to the conductor track.
	const conductorTrack = {seq: new Map()};
	smf.tracks.push(conductorTrack);

	// Sequence Name and Text Events
	setSeq(conductorTrack.seq, 0, makeText(0x03, rawTrim(rcm.header.title)));
	if (rcm.header.memoLines.some((e) => rawTrim(e).length > 0)) {
		for (const memoLine of rcm.header.memoLines) {
			setSeq(conductorTrack.seq, 0, makeText(0x01, memoLine));
		}
	}

	// Time Signature
	setSeq(conductorTrack.seq, 0, [0xff, 0x58, 0x04, smfBeat.n, Math.log2(smfBeat.d), 0x18, 0x08]);

	// Key Signature
	setSeq(conductorTrack.seq, 0, makeKeySignature(rcm.header.key));

	// Adds a setup measure which consists of SysEx converted from control files.
	if (rcm.header.fileDataCM6 || rcm.header.fileDataGSD || rcm.header.fileDataGSD2) {
		// Parses control files.
		const allSysExs = [];
		if (rcm.header.fileDataCM6) {
			const sysExs = convertCM6ToSysEx(rcm.header.fileDataCM6);
			if (sysExs) {
				allSysExs.push(...sysExs);
			} else {
				console.warn(`Not CM6 file`);
			}
		}
		if (rcm.header.fileDataGSD) {
			const sysExs = convertGSDToSysEx(rcm.header.fileDataGSD);
			if (sysExs) {
				allSysExs.push(...sysExs);
			} else {
				console.warn(`Not GSD file`);
			}
		}
		if (rcm.header.fileDataGSD2) {
			const sysExs = convertGSDToSysEx(rcm.header.fileDataGSD2);
			if (sysExs) {
				// TODO: Support >16ch
				allSysExs.push(...sysExs);
			} else {
				console.warn(`Not GSD file`);
			}
		}

		// Decides each interval between SysExs.
		const extraSt = calcSetupMeasureLength(smfBeat.n, smfBeat.d, rcm.header.timeBase);
		const timings = spaceEachSysEx(allSysExs, extraSt, rcm.header.timeBase);
		const maxUsecPerBeat = Math.max(...timings.map((e) => e.usecPerBeat));

		// Sets tempo slow during the setup measure.
		setSeq(conductorTrack.seq, baseTime, makeTempo(maxUsecPerBeat));

		// Inserts SysExs from control files
		let timestamp = baseTime;
		for (const timing of timings) {
			setSeq(conductorTrack.seq, timestamp, timing.sysEx);
			timestamp += timing.tick;
		}

		baseTime += extraSt;
	}

	// Set Tempo
	setSeq(conductorTrack.seq, baseTime, makeTempo(60 * 1000 * 1000 / rcm.header.tempo));

	// Converts each track.
	const isAllPortSame = ((new Set(rcm.tracks.map((e) => e.portNo))).size === 1);
	let maxDuration = 0;
	for (const rcmTrack of rcm.tracks) {
		// Skips the track if it is empty or muted.
		if ((rcmTrack.mode & 0x01) !== 0 || rcmTrack.extractedEvents.length <= 1) {
			continue;
		}

		const smfTrack = {
			seq: new Map(),
		};
		const noteGts = new Array(128).fill(0);
		const keyShift = ((rcmTrack.keyShift & 0x80) !== 0) ? 0 : rcm.header.playBias + rcmTrack.keyShift - ((rcmTrack.keyShift >= 0x40) ? 0x80 : 0);
		let timestamp = baseTime + rcmTrack.stShift;
		let {chNo, portNo} = rcmTrack;
		let rolDev, rolBase, yamDev, yamBase;	// TODO: Investigate whether they belong to track or global.

		// Track Name
		setSeq(smfTrack.seq, 0, makeText(0x03, rawTrim(rcmTrack.memo)));

		// If any port No. are not same among all the track, adds an unofficial MIDI Port meta event. (0x21)
		if (!isAllPortSame) {
			setSeq(smfTrack.seq, 0, [0xff, 0x21, 0x01, portNo]);
		}

		// Converts each RCM event to MIDI/SysEx/meta event.
		for (const event of rcmTrack.extractedEvents) {
			const [cmd, stOrg, gt, vel] = event;
			let st = stOrg;

			if (cmd < 0x80) {
				// Note event
				if (gt > 0 && vel > 0) {
					const noteNo = cmd + keyShift;
					if (0 <= noteNo && noteNo < 0x80) {
						// Note on or Tie
						console.assert(noteGts[noteNo] >= 0);
						if (noteGts[noteNo] === 0) {
							setSeq(smfTrack.seq, timestamp, [0x90 | chNo, noteNo, vel]);
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
				case 0x90:	// UsrExc0
				case 0x91:	// UsrExc1
				case 0x92:	// UsrExc2
				case 0x93:	// UsrExc3
				case 0x94:	// UsrExc4
				case 0x95:	// UsrExc5
				case 0x96:	// UsrExc6
				case 0x97:	// UsrExc7
					throwUnless7bit(gt, vel);
					{
						const {bytes, memo} = rcm.header.userSysExs[cmd - 0x90];
						setSeq(smfTrack.seq, timestamp, makeText(0x01, rawTrim(memo)));
						setSeq(smfTrack.seq, timestamp, makeSysEx(bytes, chNo, gt, vel));
					}
					break;
				case 0x98:	// Tr.Excl
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, makeSysEx(event.slice(4), chNo, gt, vel));
					break;

				// MIDI messages
				case 0xe1:	// BankPrgL (LSB)
				case 0xe2:	// BankPrg  (MSB)
					// Note: According to the MIDI spec, Bank Select must be transmitted as a pair of MSB and LSB.
					// But, a BankPrg event is converted to a single MSB or LSB at the current implementation.
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xb0 | chNo, (cmd === 0xe2) ? 0 : 32, vel]);
					setSeq(smfTrack.seq, timestamp, [0xc0 | chNo, gt]);
					break;

				case 0xea:	// AFTER C.
					throwUnless7bit(gt);
					setSeq(smfTrack.seq, timestamp, [0xd0 | chNo, gt]);
					break;
				case 0xeb:	// CONTROL
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xb0 | chNo, gt, vel]);
					break;
				case 0xec:	// PROGRAM
					throwUnless7bit(gt);
					setSeq(smfTrack.seq, timestamp, [0xc0 | chNo, gt]);
					break;
				case 0xed:	// AFTER K.
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xa0 | chNo, gt, vel]);
					break;
				case 0xee:	// PITCH
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xe0 | chNo, gt, vel]);
					break;

				// 1-byte DT1 SysEx for Roland devices
				case 0xdd:	// RolBase
					throwUnless7bit(gt, vel);
					rolBase = [gt, vel];
					break;
				case 0xdf:	// RolDev#
					throwUnless7bit(gt, vel);
					rolDev = [gt, vel];
					break;
				case 0xde:	// RolPara
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
						setSeq(smfTrack.seq, timestamp, makeSysEx(bytes, chNo, gt, vel));
					}
					break;

				// 1-byte parameter change SysEx for YAMAHA XG devices
				case 0xd0:	// YamBase
					throwUnless7bit(gt, vel);
					yamBase = [gt, vel];
					break;
				case 0xd1:	// YamDev#
					throwUnless7bit(gt, vel);
					yamDev = [gt, vel];
					break;
				case 0xd3:	// XGPara
					throwUnless7bit(gt, vel);
					yamDev = [0x10, 0x4c];	// Note: Is it really OK to overwrite YamDev#?
					/* FALLTHRU */
				case 0xd2:	// YamPara
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
						setSeq(smfTrack.seq, timestamp, bytes);
					}
					break;

				// Meta events
				case 0xe6:	// MIDI CH.
					if (0 < gt && gt <= 32) {
						const oldPortNo = portNo;
						const midiCh = gt - 1;	// The internal representations of MIDI CH. are different between track headers and event.
						chNo   = (midiCh >= 0) ? midiCh % 16 : -1;
						portNo = (midiCh >= 0) ? Math.trunc(midiCh / 16) : portNo;

						// Adds an unofficial MIDI Port meta event if necessary.
						if (portNo !== oldPortNo) {
							// TODO: Investigate whether this event can be appeared in the song body.
							setSeq(smfTrack.seq, timestamp, [0xff, 0x21, 0x01, portNo]);
						}
					}
					break;

				case 0xe7:	// TEMPO
					// TODO: Support tempo gradation
					setSeq(conductorTrack.seq, timestamp, makeTempo(60 * 1000 * 1000 * 64.0 / (rcm.header.tempo * gt)));
					break;

				case 0xf5:	// Music Key
					setSeq(conductorTrack.seq, timestamp, makeKeySignature(st));
					st = 0;
					break;

				case 0xf6:	// Comment
					setSeq(smfTrack.seq, timestamp, makeText(0x01, event.slice(1)));
					st = 0;
					break;

				case 0x99:	// External Command
					{
						const kind = (event[2] === 0x00) ? 'MCI' : (event[2] === 0x01) ? 'RUN' : '???';
						setSeq(conductorTrack.seq, timestamp, makeText(0x07, [...strToBytes(kind), ...event.slice(4)]));
					}
					break;

				case 0xe5:	// KeyScan
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
						setSeq(conductorTrack.seq, timestamp, makeText(0x07, [...strToBytes(`KeyScan: ${cue}`)]));
					}
					break;

				// RCM commands
				case 0xf7:	// 2nd Event
				case 0xf8:	// Loop End
				case 0xf9:	// Loop Start
				case 0xfc:	// Same Measure
					console.assert(false, 'Such kind of events must be resolved in the previous phase', {event});
					break;

				case 0xfd:	// Measure End
					st = 0;
					break;
				case 0xfe:	// End of Track
					// Expands the current step time to wait for all of note-off.
					st = Math.max(...noteGts);
					console.assert(st >= 0);
					break;

				// Special commands for particular devices
				case 0xc0:	// DX7FUNC
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x08, gt, vel, 0xf7]);
					break;
				case 0xc1:	// DX.PARA
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x00, gt, vel, 0xf7]);
					break;
				case 0xc2:	// DX.PERF
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x04, gt, vel, 0xf7]);
					break;
				case 0xc3:	// TX.FUNC
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x11, gt, vel, 0xf7]);
					break;
				case 0xc5:	// FB-01 P
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x15, gt, vel, 0xf7]);
					break;
				case 0xc6:	// FB-01 S
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x75, 0x01, 0x10, gt, vel, 0xf7]);
					break;
				case 0xc7:	// TX81Z V
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x12, gt, vel, 0xf7]);
					break;
				case 0xc8:	// TX81Z A
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x13, gt, vel, 0xf7]);
					break;
				case 0xc9:	// TX81Z P
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x10, gt, vel, 0xf7]);
					break;
				case 0xca:	// TX81Z S
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x10, 0x7b, gt, vel, 0xf7]);
					break;
				case 0xcb:	// TX81Z E
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x10, 0x7c, gt, vel, 0xf7]);
					break;
				case 0xcc:	// DX7-2 R
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x1b, gt, vel, 0xf7]);
					break;
				case 0xcd:	// DX7-2 A
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x18, gt, vel, 0xf7]);
					break;
				case 0xce:	// DX7-2 P
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x19, gt, vel, 0xf7]);
					break;
				case 0xcf:	// TX802 P
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x43, 0x11, 0x1a, gt, vel, 0xf7]);
					break;
				case 0xdc:	// MKS-7
					throwUnless7bit(gt, vel);
					setSeq(smfTrack.seq, timestamp, [0xf0, 0x41, 0x32, 0x01, gt, vel, 0xf7]);
					break;

				default:
					console.warn(`${cmd.toString(16)}: Unknown command.`);
					break;
				}
			}

			// Note off
			for (let noteNo = 0; noteNo < noteGts.length; noteNo++) {
				const noteGt = noteGts[noteNo];
				console.assert(noteGt >= 0);
				if (noteGt === 0) {
					continue;
				}

				if (noteGt <= st) {
					setSeq(smfTrack.seq, timestamp + noteGt, [0x90 | chNo, noteNo, 0]);
					noteGts[noteNo] = 0;
				} else {
					noteGts[noteNo] -= st;
				}
			}

			timestamp += st;
		}

		// End of Track
		setSeq(smfTrack.seq, timestamp, [0xff, 0x2f, 0x00]);
		if (timestamp > maxDuration) {
			maxDuration = timestamp;
		}

		smf.tracks.push(smfTrack);
	}

	// End of Track for the conductor track
	setSeq(conductorTrack.seq, maxDuration, [0xff, 0x2f, 0x00]);

	return smf;

	function throwUnless7bit(...values) {
		console.assert(values && values.length, 'Invalid argument', {values});
		if (values.some((e) => !Number.isInteger(e) || (e < 0 || 0x80 <= e))) {
			throw new Error(`Invalid value ${values}`);
		}
	}

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

function convertSeqToSmf(seq, timeBase = 48) {
	console.assert(seq, 'Invalid argument', {seq});

	// Makes a header chunk.
	const mthd = [...strToBytes('MThd'), ...uintbe(6, 4), ...uintbe(1, 2), ...uintbe(seq.tracks.length, 2), ...uintbe(timeBase, 2)];

	// Makes track chunks.
	const mtrks = seq.tracks.map((smfTrack) => {
		let prevTime = 0;
		const mtrk = [...smfTrack.seq.entries()].sort((a, b) => a[0] - b[0]).reduce((p, c) => {
			const [timestamp, events] = c;

			// Makes MTrk events.
			const bytes = [];
			for (const event of events) {
				// Delta time
				const deltaTime = timestamp - prevTime;
				bytes.push(...varNum(deltaTime));
				prevTime = timestamp;

				// Event
				if (event[0] === 0xf0) {
					bytes.push(0xf0, ...varNum(event.length - 1), ...event.slice(1));
				} else {
					bytes.push(...event);
				}
			}

			p.push(...bytes);
			return p;
		}, []);

		// Extracts MTrk events with a leading MTrk header.
		return [...strToBytes('MTrk'), ...uintbe(mtrk.length, 4), ...mtrk];
	});

	// Extracts track events with a leading header chunk.
	const smf = mthd.concat(...mtrks);

	return new Uint8Array(smf);

	function uintbe(value, width) {
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

function checkSum(bytes) {
	console.assert(bytes && bytes.length, 'Invalid argument', {bytes});
	const sum = bytes.reduce((p, c) => p + c, 0);
	return (0x80 - (sum & 0x7f)) & 0x7f;
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
	const end = String.fromCodePoint(...buf).replace(/\x20+$/u, '').length;
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
