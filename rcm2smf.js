
import {parseRCM, convertRcmToSeq, convertSeqToSmf} from './rcm_converter.js';

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
