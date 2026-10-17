import { iconFacet } from './_icon.js';

const base = iconFacet('scene', { label: 'Scene' });
export default { ...base, tags: [...new Set([...base.tags, 'stream', 'streaming', 'broadcast', 'scene', 'scenes', 'obs-style'])] };
