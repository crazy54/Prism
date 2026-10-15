// The udev rule that lets the logged-in seat user open every supported deck's
// hidraw node (systemd-logind "uaccess" ACL) — generated from the model table so
// linux/60-prism-deck.rules can never drift from what the driver supports
// (test/hid.test.js compares the shipped file with udevRules()).
//
// The file number must sort BEFORE 73: 73-seat-late.rules applies the ACL for
// devices already tagged "uaccess" (research linux.md §3.2), so a 99- rule would tag
// the node too late and silently grant nothing.

import { MODELS } from './models.js';

export const UDEV_RULES_NAME = '60-prism-deck.rules';

export function udevRules() {
  const lines = [
    '# Prism Deck: hidraw access for the logged-in seat user (systemd-logind uaccess ACL).',
    '# Elgato Stream Deck family + Corsair Galleon 100 SD (Stream Deck interface). Generated from',
    '# prism-deck/src/hid/models.js — regenerate with: prism-deck hid udev > 60-prism-deck.rules',
    '#',
    '# Install (the number must sort before 73-seat-late.rules):',
    '#   sudo install -m 0644 60-prism-deck.rules /etc/udev/rules.d/',
    '#   sudo udevadm control --reload-rules && sudo udevadm trigger --subsystem-match=hidraw --action=change',
    '# Headless / service account (no logind seat): replace TAG+="uaccess" with GROUP="plugdev"',
    '# (Debian/Ubuntu; elsewhere create a group: sudo groupadd --system streamdeck) and add the user to it.',
    '# Never widen the Corsair line to the whole vendor (1b1c): that would cover every Corsair peripheral.',
    '',
  ];
  for (const m of MODELS) {
    const [vid, pid] = m.usb.split(':');
    lines.push(`# ${m.name} [${m.id}]${m.id === 'galleon' ? ' — composite device; the driver opens interface 0 only' : ''}`);
    lines.push(`KERNEL=="hidraw*", ATTRS{idVendor}=="${vid}", ATTRS{idProduct}=="${pid}", MODE:="0660", TAG+="uaccess"`);
  }
  return `${lines.join('\n')}\n`;
}
