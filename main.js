import fs from 'fs';
import path from 'path';
import util from 'util';
import assert from 'assert';

import iconv from 'iconv-lite';
import {rcm2smf} from './rcm2smf.js';

console.assert = assert;

const readFileAsync  = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

const fileReader = (fileName, fileNameRaw) => {
	console.assert(fileName, 'Invalid argument');

	const baseDir = path.parse(process.argv[2]).dir;
	if (/^[\x20-\x7E]*$/u.test(fileName)) {
		return readFileAsync(path.join(baseDir, fileName));

	} else if (fileNameRaw) {
		const fileNameCP932 = iconv.decode(fileNameRaw, 'CP932');
		return readFileAsync(path.join(baseDir, fileNameCP932));

	} else {
		return Promise.reject(new Error('File not found'));
	}
};

(async () => {
	try {
		const rcmData = await readFileAsync(process.argv[2]);
		const smfData = await rcm2smf(new Uint8Array(rcmData), fileReader);
		await writeFileAsync(`${process.argv[2]}.mid`, smfData);
	} catch (e) {
		console.error(e);
	}
})();
