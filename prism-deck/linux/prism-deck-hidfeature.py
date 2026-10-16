#!/usr/bin/env python3
# prism-deck-hidfeature.py - HID feature reports for Prism Deck on Linux. Python 3.6+, stdlib only.
#
# Why this exists: Node's fs can write()/read() a /dev/hidrawN node but cannot call ioctl().
# Brightness, show-logo and the Corsair Galleon 100 SD keep-alive are HID *feature* reports
# (HIDIOCSFEATURE / HIDIOCGFEATURE), so Prism Deck runs this as a co-process:
#
#     python3 -I prism-deck-hidfeature.py /dev/hidrawN
#
# Safety, by construction:
#   * it only opens /dev/hidraw<N> character devices;
#   * it only sends the documented feature reports in ALLOWED_SET (brightness, logo, colour fills,
#     sleep timer, Galleon keep-alive / ring LEDs) with zero padding - nothing else, no firmware,
#     no vendor commands; GETs are limited to ALLOWED_GET (serial, firmware, unit info);
#   * the keep-alive stops and the helper exits when stdin closes (Prism Deck exited or crashed),
#     which hands a Galleon back to its standalone mode.
#
# Line protocol (stdin -> stdout):
#   "<id> S <hex>"         set a feature report (hex bytes, report id first)
#   "<id> G <rid> <len>"   get feature report <rid> (hex) of <len> bytes
#   "<id> K <ms> <hex>"    repeat "S <hex>" every <ms> ms in a thread (ms 0 = stop); Galleon 0327 only
#   <- "ready 1"           once, after the device opened
#   <- "<id> ok [hex]"  |  "<id> err <errno> <reason>"
#   <- "* keepalive err <errno>"   (asynchronous, when a keep-alive write fails)
# Self-checks that never open a device:  --check <hex>...   --ioc <len>...
#
# ioctl numbers: _IOC(_IOC_READ|_IOC_WRITE, 'H', nr, len). Read|write is 3<<30 on asm-generic
# (x86, arm, arm64, riscv) and 6<<29 on powerpc/mips/sparc/alpha - both 0xC0000000 - and the size
# field starts at bit 16 everywhere (13 bits minimum), so one formula covers every Linux arch.

import os
import stat
import sys
import threading

VERSION = 1
HIDIOCSFEATURE_NR = 0x06
HIDIOCGFEATURE_NR = 0x07

# [prefix bytes, number of free argument bytes]; every byte after them must be zero.
# Keep identical to ALLOWED_SET in src/hid/features.js (test/hid.test.js compares them).
ALLOWED_SET = [
    ([0x03, 0x02], 0),                    # show logo (gen2)
    ([0x03, 0x05], 3),                    # fill LCD r g b
    ([0x03, 0x06], 4),                    # fill key idx r g b
    ([0x03, 0x08], 1),                    # brightness 0-100
    ([0x03, 0x0D], 4),                    # sleep timeout int32 LE
    ([0x03, 0x27], 0),                    # Corsair Galleon 100 SD keep-alive
    ([0x03, 0x24], 4),                    # Galleon dial ring pixel idx r g b
    ([0x05, 0x55, 0xAA, 0xD1, 0x01], 1),  # gen1 brightness 0-100
    ([0x0B, 0x63], 0),                    # gen1 reset / show logo
]
ALLOWED_GET = [0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0A, 0x11, 0x13]
KEEPALIVE_OK = [bytes([0x03, 0x27])]


def ioc_rw(nr, size):
    if not 0 < size < 8192:
        raise ValueError("ioctl size out of range")
    return 0xC0000000 | (size << 16) | (ord("H") << 8) | nr


def check(b):
    """None when b is an allowed SET feature report, else the reason."""
    if not 2 <= len(b) <= 64:
        return "length %d outside 2-64" % len(b)
    for prefix, args in ALLOWED_SET:
        if len(b) < len(prefix) or list(b[:len(prefix)]) != prefix:
            continue
        end = len(prefix) + args
        if len(b) < end:
            return "truncated report"
        if any(b[end:]):
            return "non-zero padding"
        if prefix == [0x03, 0x08] and b[2] > 100:
            return "brightness above 100"
        if prefix[0] == 0x05 and b[5] > 100:
            return "brightness above 100"
        return None
    return "feature %02x %02x is not on the allowlist" % (b[0], b[1])


class Device:
    def __init__(self, path):
        if not (path.startswith("/dev/hidraw") and path[11:].isdigit()):
            raise OSError(22, "not a /dev/hidrawN path")
        try:
            import fcntl  # Linux only; imported here so the self-checks run anywhere
        except ImportError:
            raise OSError(38, "no fcntl module (not Linux)")
        self.fcntl = fcntl
        self.fd = os.open(path, os.O_RDWR | getattr(os, "O_CLOEXEC", 0))
        if not stat.S_ISCHR(os.fstat(self.fd).st_mode):
            os.close(self.fd)
            raise OSError(19, "not a character device")
        self.lock = threading.Lock()

    def set(self, b):
        why = check(b)
        if why:
            raise PermissionError(1, why)
        buf = bytearray(b)
        with self.lock:
            self.fcntl.ioctl(self.fd, ioc_rw(HIDIOCSFEATURE_NR, len(buf)), buf, True)

    def get(self, rid, n):
        if rid not in ALLOWED_GET or not 2 <= n <= 64:
            raise PermissionError(1, "get %02x/%d is not on the allowlist" % (rid, n))
        buf = bytearray(n)
        buf[0] = rid
        with self.lock:
            self.fcntl.ioctl(self.fd, ioc_rw(HIDIOCGFEATURE_NR, n), buf, True)
        return bytes(buf)


def say(line):
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def serve(path):
    try:
        dev = Device(path)
    except OSError as e:
        say("fatal %d %s" % (e.errno or 5, e.strerror or e))
        return 2
    stop = [None]  # current keep-alive Event

    def keepalive(ev, ms, b):
        failing = False
        while True:
            try:
                dev.set(b)
                failing = False
            except OSError as e:
                if not failing:
                    say("* keepalive err %d" % (e.errno or 5))
                failing = True
            if ev.wait(ms / 1000.0):
                return

    def stop_keepalive():
        if stop[0] is not None:
            stop[0].set()
            stop[0] = None

    say("ready %d" % VERSION)
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        rid, op, args = parts[0], parts[1], parts[2:]
        try:
            if op == "S" and len(args) == 1:
                dev.set(bytes.fromhex(args[0]))
                say(rid + " ok")
            elif op == "G" and len(args) == 2:
                say(rid + " ok " + dev.get(int(args[0], 16), int(args[1])).hex())
            elif op == "K" and len(args) == 2:
                ms, b = int(args[0]), bytes.fromhex(args[1])
                stop_keepalive()
                if ms > 0:
                    if b not in KEEPALIVE_OK or not 100 <= ms <= 2000:
                        raise PermissionError(1, "keep-alive must be 0327 every 100-2000 ms")
                    dev.set(b)  # first ping now, so the device is live before we answer
                    ev = threading.Event()
                    stop[0] = ev
                    threading.Thread(target=keepalive, args=(ev, ms, b), daemon=True).start()
                say(rid + " ok")
            else:
                say(rid + " err 22 bad request")
        except (OSError, ValueError) as e:
            say("%s err %d %s" % (rid, getattr(e, "errno", None) or 22, getattr(e, "strerror", None) or e))
    stop_keepalive()
    os.close(dev.fd)
    return 0


def main(argv):
    if len(argv) >= 2 and argv[1] == "--check":
        for h in argv[2:]:
            why = check(bytes.fromhex(h))
            print("allow" if why is None else "deny " + why)
        return 0
    if len(argv) >= 2 and argv[1] == "--ioc":
        for n in argv[2:]:
            print("%08X %08X" % (ioc_rw(HIDIOCSFEATURE_NR, int(n)), ioc_rw(HIDIOCGFEATURE_NR, int(n))))
        return 0
    if len(argv) != 2:
        sys.stderr.write("usage: prism-deck-hidfeature.py /dev/hidrawN | --check <hex>... | --ioc <len>...\n")
        return 64
    return serve(argv[1])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
