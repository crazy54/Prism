// Shared bits for ops facets that script a shell: a bash prompt with its working directory and a
// host colour (so a remote shell reads apart from the local one), and a command being typed at it.
import { ATTR, typed, blink } from './_kit.js';

/** `user@host:dir$ cmd` as segments, with an optional block cursor after the command. */
export const shellPrompt = (c, { user = 'ops', host, dir = '~', hostColor } = {}, cmd = '', cursor = false) => [
  [`${user}@${host}`, hostColor ?? c.green, ATTR.BOLD], [':', c.fg], [dir, c.blue, ATTR.BOLD], ['$ ', c.fg], [cmd, c.fg],
  ...(cursor ? [[' ', c.bg, 0, c.fg]] : []),
];

/**
 * A command typed at a prompt from `at` (seconds) at `cps`: the prompt line (cursor blinking while it
 * types), whether the command is complete, and the time typing ends.
 */
export function typedLine(c, p, cmd, T, at, cps = 18, period = 0.8) {
  const ty = typed(cmd, T, at, cps);
  return { parts: shellPrompt(c, p, ty.text, !ty.done && blink(T, period)), done: ty.done, end: ty.at };
}
