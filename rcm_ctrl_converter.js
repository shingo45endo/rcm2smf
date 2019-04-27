export const [convertMTDToSysEx, convertCM6ToSysEx] = ['MTD', 'CM6'].map((kind) => {
	const pos = {
		MTD: {
			la: {
				SystemArea:      0x0080,
				PatchTempArea:   0x00a0,
				RhythmSetupTemp: 0x0130,
				TimbreTempArea:  0x0230,
				PatchMemory:     0x09e0,
				UserPatch:       0x0de0,	// Only for MTD
				TimbreMemory:    0x0fe0,
			},
			totalSize: 0x4fe0,
		},
		CM6: {
			la: {
				SystemArea:       0x0080,
				PatchTempArea:    0x00a0,
				RhythmSetupTemp:  0x0130,
				RhythmSetupTemp2: 0x0230,	// Only for CM6
				TimbreTempArea:   0x0284,
				PatchMemory:      0x0a34,
				TimbreMemory:     0x0e34,
			},
			pcm: {
				PatchTempArea: 0x4e34,
				PatchMemory:   0x4eb2,
				SystemArea:    0x5832,
			},
			totalSize: 0x5843,
		},
	}[kind];

	const makeSysExMTCM = (bytes, addrH, addrM, addrL) => makeSysEx(bytes, 0x16, addrH, addrM, addrL);

	return (buf) => {
		// Checks the file header.
		console.assert(pos.totalSize);
		if (!buf || !buf.length || buf.length < pos.totalSize ||
		    !String.fromCharCode(...buf.slice(0x0000, 0x000d)).startsWith('COME ON MUSIC') ||
		    !String.fromCharCode(...buf.slice(0x0010, 0x0012)).startsWith('R ')) {
			return null;
		}
		const idStr = String.fromCharCode(...buf.slice(0x0012, 0x001a));
		if (!idStr.startsWith('MT-32') && !idStr.startsWith('CM-64')) {
			return null;
		}

		const sysExs = [];

		// [LA SOUND PART]
		console.assert(pos.la);

		// System Area
		sysExs.push(makeSysExMTCM(buf.slice(pos.la.SystemArea, pos.la.SystemArea + 0x17), 0x10, 0x00, 0x00));

		// Timbre Memory (#1 - #64)
		for (let i = 0; i < 64; i++) {
			const index = pos.la.TimbreMemory + i * 0x100;
			sysExs.push(makeSysExMTCM(buf.slice(index, index + 0x100), 0x08, i * 2, 0x00));
		}

		// Rhythm Setup Temporary Area
		sysExs.push(makeSysExMTCM(buf.slice(pos.la.RhythmSetupTemp, pos.la.RhythmSetupTemp + 0x4 * 64), 0x03, 0x01, 0x10));	// #24 - #87
		if (pos.la.RhythmSetupTemp2) {
			sysExs.push(makeSysExMTCM(buf.slice(pos.la.RhythmSetupTemp2, pos.la.RhythmSetupTemp2 + 0x4 * 21), 0x03, 0x03, 0x10));	// #88 - #108
		}

		// Patch Temporary Area
		sysExs.push(makeSysExMTCM(buf.slice(pos.la.PatchTempArea, pos.la.PatchTempArea + 0x10 * 9), 0x03, 0x00, 0x00));

		// Timbre Temporary Area
		for (let i = 0; i < 8; i++) {
			const addr = i * 0xf6;	// 0xf6: 0x0e + 0x3a * 4
			const index = pos.la.TimbreTempArea + addr;
			sysExs.push(makeSysExMTCM(buf.slice(index, index + 0xf6), 0x04, addr >> 7, addr & 0x7f));
		}

		// Patch Memory (#1 - #128)
		for (let i = 0; i < 8; i++) {
			const index = pos.la.PatchMemory + i * 0x8 * 16;
			sysExs.push(makeSysExMTCM(buf.slice(index, index + 0x8 * 16), 0x05, i, 0x00));
		}

		// User Patch (Only for MTD)
		if (pos.la.UserPatch) {
			for (let i = 0; i < 4; i++) {
				const index = pos.la.UserPatch + i * 0x8 * 16;
				sysExs.push(makeSysExMTCM(buf.slice(index, index + 0x8 * 16), 0x05, i, 0x00));
			}
		}

		// [PCM SOUND PART]
		if (pos.pcm) {
			// Patch Temporary Area
			sysExs.push(makeSysExMTCM(buf.slice(pos.pcm.PatchTempArea, pos.pcm.PatchTempArea + 0x15 * 6), 0x50, 0x00, 0x00));

			// Patch Memory (#1 - #128)
			for (let i = 0; i < 16; i++) {
				const addr = i * 0x13 * 8;
				const index = pos.pcm.PatchMemory + addr;
				sysExs.push(makeSysExMTCM(buf.slice(index, index + 0x13 * 8), 0x51, addr >> 7, addr & 0x7f));
			}

			// System Area
			sysExs.push(makeSysExMTCM(buf.slice(pos.pcm.SystemArea, pos.pcm.SystemArea + 0x11), 0x52, 0x00, 0x00));
		}

		console.assert(sysExs.every((e) => e.length <= 256 + 10), 'Too long SysEx', {sysExs});
		return sysExs;
	};
});

export function convertGSDToSysEx(buf) {
	// Checks the file header.
	if (!buf || !buf.length || buf.length < 0x0a71 ||
	    !String.fromCharCode(...buf.slice(0x0000, 0x000d)).startsWith('COME ON MUSIC') ||
	    !String.fromCharCode(...buf.slice(0x000e, 0x001c)).startsWith('GS CONTROL 1.0')) {
		return null;
	}

	const makeSysExGS = (bytes, addrH, addrM, addrL) => makeSysEx(bytes, 0x42, addrH, addrM, addrL);
	const sysExs = [];

	// Master Tune
	sysExs.push(makeSysExGS(buf.slice(0x0020, 0x0024), 0x40, 0x00, 0x00));

	// Master Volume, Master Key Shift, and Master Panpot
	for (let i = 0; i < 3; i++) {
		sysExs.push(makeSysExGS([buf[0x0024 + i]], 0x40, 0x00, 0x04 + i));
	}

	// Reverb
	for (let i = 0; i < 7; i++) {
		sysExs.push(makeSysExGS([buf[0x0027 + i]], 0x40, 0x01, 0x30 + i));
	}

	// Chorus
	for (let i = 0; i < 8; i++) {
		sysExs.push(makeSysExGS([buf[0x002e + i]], 0x40, 0x01, 0x38 + i));
	}

	// Voice Reserve
	sysExs.push(makeSysExGS([0x04f9, 0x00af, 0x0129, 0x01a3, 0x021d, 0x0297, 0x0311, 0x038b, 0x0405, 0x047f, 0x0573, 0x05ed, 0x0667, 0x06e1, 0x075b, 0x07d5].map((e) => buf[e]), 0x40, 0x01, 0x10));

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

		sysExs.push(makeSysExGS(nibblize(...level.slice(0, 64)),  0x49, 0x02 + i * 0x10, 0x00));
		sysExs.push(makeSysExGS(nibblize(...level.slice(64)),     0x49, 0x03 + i * 0x10, 0x00));
		sysExs.push(makeSysExGS(nibblize(...panpot.slice(0, 64)), 0x49, 0x06 + i * 0x10, 0x00));
		sysExs.push(makeSysExGS(nibblize(...panpot.slice(64)),    0x49, 0x07 + i * 0x10, 0x00));
		sysExs.push(makeSysExGS(nibblize(...reverb.slice(0, 64)), 0x49, 0x08 + i * 0x10, 0x00));
		sysExs.push(makeSysExGS(nibblize(...reverb.slice(64)),    0x49, 0x09 + i * 0x10, 0x00));
		sysExs.push(makeSysExGS(nibblize(...chorus.slice(0, 64)), 0x49, 0x0a + i * 0x10, 0x00));
		sysExs.push(makeSysExGS(nibblize(...chorus.slice(64)),    0x49, 0x0b + i * 0x10, 0x00));
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
		return [0, 1].map((i) => makeSysExGS(nibbles.slice(i * 128, (i + 1) * 128), addrH, addrM + i, addrL));
	}
}

function makeSysEx(bytes, modelId, addrH, addrM, addrL) {
	console.assert([modelId, addrH, addrM, addrL].every((e) => (0x00 <= e && e < 0x80)), 'Invalid address', {addrH, addrM, addrL});
	const sysEx = [0xf0, 0x41, 0x10, modelId, 0x12, addrH, addrM, addrL, ...bytes, -1, 0xf7];
	sysEx[sysEx.length - 2] = checkSum(sysEx.slice(5, -2));
	return sysEx;

	function checkSum(bytes) {
		console.assert(bytes && bytes.length, 'Invalid argument', {bytes});
		const sum = bytes.reduce((p, c) => p + c, 0);
		return (0x80 - (sum & 0x7f)) & 0x7f;
	}
}
