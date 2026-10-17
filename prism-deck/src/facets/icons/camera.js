import { iconFacet } from './_icon.js';
import { pairLink } from '../apps/_muted.js';

// Linked to the device's camera state (scene/link.js 'camera.on').
const base = iconFacet('camera', { label: 'Camera' });
export default { ...base, link: pairLink('camera', ['on', 'off']) };
