import { iconFacet } from './_icon.js';
import { pairLink } from '../apps/_muted.js';

// Linked to the device's live state (scene/link.js 'stream.live'): the Galleon Studio screen and every On Air key agree.
const base = iconFacet('broadcast', { label: 'On Air' });
export default { ...base, tags: [...new Set([...base.tags, 'on air', 'live', 'stream', 'streaming', 'broadcast', 'obs-style'])], link: pairLink('broadcast', ['live', 'offline']) };
