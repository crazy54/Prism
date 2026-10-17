import { iconFacet } from './_icon.js';

const base = iconFacet('chat', { label: 'Chat' });
export default { ...base, tags: [...new Set([...base.tags, 'chat', 'live chat', 'stream', 'streaming', 'messages', 'obs-style'])] };
