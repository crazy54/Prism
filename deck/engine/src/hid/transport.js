// Transports: the only code that touches a device node.
//
// openHidraw(path)   the real thing — node:fs on /dev/hidrawN, O_RDWR | O_NONBLOCK.
//   write(report)    ONE report per write(), strictly serialized through a promise chain
//                    (concurrent fs.write calls on one fd can be reordered by the libuv pool;
//                    position must be null — pwrite on a char device is ESPIPE)
//   read()           non-blocking: one input report or null (EAGAIN); EIO/ENODEV → disconnect
// memoryTransport()  a fake /dev/hidraw* for tests and --dry-run: records every write, plays
//                    back queued input reports one per read.
//
// openHidraw takes { fs } so tests can hand it a fake char device; nothing here ever opens a
// path it was not given.

import nodeFs from 'node:fs';
import { HidError } from './claim.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Map an open()/write() errno to a friendly HidError. */
export function explainErrno(e, path) {
  switch (e?.code) {
    case 'EACCES': case 'EPERM': return new HidError('EACCES', `no permission to open ${path} — install the udev rule (prism-deck hid udev) and replug, or check \`getfacl ${path}\``, { cause: e });
    case 'EBUSY': return new HidError('EBUSY', `${path} is busy (the kernel refused the open)`, { cause: e });
    case 'ENOENT': case 'ENODEV': case 'ENXIO': return new HidError('ENODEV', `${path} is gone (unplugged?)`, { cause: e });
    case 'EIO': return new HidError('ENODEV', `${path}: I/O error (unplugged?)`, { cause: e });
    default: return e instanceof HidError ? e : new HidError(e?.code || 'EIO', `${path}: ${e?.message || e}`, { cause: e });
  }
}

/**
 * Open a hidraw node. EACCES is retried for `retryAccessMs` (udev applies the uaccess ACL a
 * moment after the node appears on hotplug).
 */
export async function openHidraw(path, { fs = nodeFs, retryAccessMs = 2000, readSize = 512 } = {}) {
  const flags = fs.constants.O_RDWR | (fs.constants.O_NONBLOCK || 0);
  let fd, waited = 0;
  for (;;) {
    try { fd = fs.openSync(path, flags); break; } catch (e) {
      if ((e.code === 'EACCES' || e.code === 'EPERM') && waited < retryAccessMs) { await sleep(200); waited += 200; continue; }
      throw explainErrno(e, path);
    }
  }
  const rbuf = Buffer.alloc(readSize);
  let chain = Promise.resolve(), closed = false, writes = 0, bytes = 0;
  const writeOne = (pkt) => new Promise((res, rej) => {
    fs.write(fd, pkt, 0, pkt.length, null, (err, n) => {
      if (err) return rej(explainErrno(err, path));
      if (n !== pkt.length) return rej(new HidError('EIO', `${path}: short write (${n} of ${pkt.length})`));
      writes++; bytes += n; res();
    });
  });
  return {
    path,
    get closed() { return closed; },
    get stats() { return { writes, bytes }; },
    /** Queue one report; resolves when it has been written. */
    write(pkt) {
      if (closed) return Promise.reject(new HidError('ENODEV', `${path} is closed`));
      const p = chain.then(() => writeOne(pkt));
      chain = p.catch(() => {});
      return p;
    },
    /** One input report (a fresh Uint8Array) or null when none is pending. */
    read() {
      if (closed) return null;
      let n;
      try { n = fs.readSync(fd, rbuf, 0, rbuf.length, null); } catch (e) {
        if (e.code === 'EAGAIN' || e.code === 'EWOULDBLOCK') return null;
        throw explainErrno(e, path);
      }
      return n > 0 ? new Uint8Array(rbuf.subarray(0, n)) : null;
    },
    /** Resolves when every queued write has finished. */
    drain() { return chain; },
    close() { if (closed) return; closed = true; try { fs.closeSync(fd); } catch { /* already gone */ } },
  };
}

/** In-memory fake hidraw: { writes: Uint8Array[], push(report) (queue input), write, read, drain, close }. */
export function memoryTransport({ path = '/dev/hidraw-fake', failAfter = Infinity, writeDelayMs = 0 } = {}) {
  const writes = [], inbox = [];
  let closed = false, bytes = 0;
  return {
    path, writes,
    get closed() { return closed; },
    get stats() { return { writes: writes.length, bytes }; },
    push(report) { inbox.push(report instanceof Uint8Array ? report : new Uint8Array(report)); },
    async write(pkt) {
      if (closed) throw new HidError('ENODEV', `${path} is closed`);
      if (writes.length >= failAfter) throw new HidError('ENODEV', `${path}: I/O error (unplugged?)`);
      if (writeDelayMs) await sleep(writeDelayMs);
      writes.push(new Uint8Array(pkt)); bytes += pkt.length;
    },
    read() { return closed ? null : inbox.shift() || null; },
    drain: async () => {},
    close() { closed = true; },
  };
}
