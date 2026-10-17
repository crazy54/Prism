// The udev rule that lets the logged-in seat user open every supported deck's
// hidraw node (systemd-logind "uaccess" ACL) — generated from the model table so
// linux/60-prism-deck.rules can never drift from what the driver supports
// (test/hid.test.js compares the shipped file with udevRules() and runs it through
// a small udev evaluator against fake device chains).
//
// The file number must sort BEFORE 73: 73-seat-late.rules applies the ACL for
// devices already tagged "uaccess" (research linux.md §3.2), so a 99- rule would tag
// the node too late and silently grant nothing.
//
// Composite devices (the Galleon 100 SD is a keyboard AND a Stream Deck behind one
// USB id) get a two-stage rule: ATTRS keys in one rule must all match on the SAME
// ancestor, and idVendor/idProduct live on the usb_device while bInterfaceNumber
// lives on the usb_interface, so a one-line rule can't say "only interface 00".
// Stage 1 matches the USB id and jumps to a label; everything else skips the
// section; stage 2 grants access only when the hidraw node's parent interface is
// the deck interface. The keyboard's hidraw nodes (raw keystrokes) stay root-only.

import { MODELS } from './models.js';

export const UDEV_RULES_NAME = '60-prism-deck.rules';

const hex2 = (n) => n.toString(16).padStart(2, '0');

export function udevRules() {
  const lines = [
    '# Prism Deck: hidraw access for the logged-in seat user (systemd-logind uaccess ACL).',
    '# Elgato Stream Deck family + Corsair Galleon 100 SD (Stream Deck interface only). Generated from',
    '# prism-deck/src/hid/models.js — regenerate with: prism-deck hid udev > 60-prism-deck.rules',
    '#',
    '# Install (the number must sort before 73-seat-late.rules):',
    '#   sudo install -m 0644 60-prism-deck.rules /etc/udev/rules.d/',
    '#   sudo udevadm control --reload-rules && sudo udevadm trigger --subsystem-match=hidraw --action=change',
    '# Headless / service account (no logind seat): replace TAG+="uaccess" with GROUP="plugdev"',
    '# (Debian/Ubuntu; elsewhere create a group: sudo groupadd --system streamdeck) and add the user to it.',
    '# Never widen the Corsair rule to the whole vendor (1b1c) or drop its interface check: the Galleon',
    '# is also a keyboard, and its keyboard hidraw nodes would expose every keystroke to the user.',
    '',
  ];
  const composite = [];
  for (const m of MODELS) {
    const [vid, pid] = m.usb.split(':');
    if (m.iface !== undefined) { composite.push(m); continue; }
    lines.push(`# ${m.name} [${m.id}]`);
    lines.push(`KERNEL=="hidraw*", ATTRS{idVendor}=="${vid}", ATTRS{idProduct}=="${pid}", MODE:="0660", TAG+="uaccess"`);
  }
  for (const m of composite) {
    const [vid, pid] = m.usb.split(':');
    const label = `prism_deck_${m.id.replace(/[^a-z0-9]/gi, '_')}`;
    lines.push(
      '',
      `# ${m.name} [${m.id}] — composite device: only USB interface ${hex2(m.iface)} (the deck) is opened to the`,
      '# seat user. Stage 1 matches the USB id on the usb_device ancestor; stage 2 requires the hidraw',
      '# node\'s usb_interface ancestor to be the deck interface. Every other device skips the section.',
      `KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="${vid}", ATTRS{idProduct}=="${pid}", GOTO="${label}"`,
      `GOTO="${label}_end"`,
      `LABEL="${label}"`,
      `KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{bInterfaceNumber}=="${hex2(m.iface)}", MODE:="0660", TAG+="uaccess"`,
      `LABEL="${label}_end"`,
    );
  }
  return `${lines.join('\n')}\n`;
}
