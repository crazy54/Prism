import { iconFacet } from './_icon.js';
import { pairLink } from '../apps/_muted.js';

// Linked to the device's output mute (scene/link.js 'volume.muted').
const base = iconFacet('volume');
export default { ...base, link: pairLink('volume', ['on', 'muted']) };
