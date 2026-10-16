import { iconFacet } from './_icon.js';

const base = iconFacet('record', { label: 'Record' });
export default { ...base, tags: [...new Set([...base.tags, 'rec', 'recording', 'stream', 'streaming', 'broadcast', 'obs-style'])] };
