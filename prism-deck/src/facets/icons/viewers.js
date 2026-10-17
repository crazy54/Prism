import { iconFacet } from './_icon.js';
import { pairLink } from '../apps/_muted.js';

// Linked to the device's live state (scene/link.js 'stream.live').
const base = iconFacet('viewers', { label: 'Viewers' });
export default { ...base, tags: [...new Set([...base.tags, 'stream', 'streaming', 'audience', 'chat'])], link: pairLink('viewers', ['live', 'offline']) };
