/**
 * Launchpad MIDI adapter built on top of @julusian/midi.
 *
 * Responsibilities
 * - Discover and open Launchpad input/output ports (or honor LP_IN / LP_OUT env overrides).
 * - Decode NOTE ON/OFF messages into pad press/release callbacks.
 * - Encode per‑pad LED colors into Launchpad‑compatible velocities and send them efficiently.
 * - Provide safe shutdown/cleanup routines (clear LEDs, close ports, remove listeners).
 *
 * Performance notes
 * - LED writes are deduplicated using a local cache (padId → last velocity).
 * - Input handling is lightweight: minimal branching and no allocations on the hot path.
 *
 * Pad addressing
 * - Note pads: padId in 0..127 → NOTE ON with velocity (color).
 * - “Control” style pads: padId >= 200 → maps to Control Change (CC) (CC = padId - 200).
 *
 * Environment overrides
 * - LP_IN / LP_OUT: numeric port indices (0‑based). If both are set, auto‑detection is skipped.
 */

import midi from '@julusian/midi';
import {LaunchpadPort} from '../port.js';
import {encodeColor} from '../color-encoder.js';
import {logger} from '../../utils/logger.js';

/** Return true if a MIDI port name looks like a Launchpad device (case‑insensitive). */
function isLaunchpadName(name = '') {
    return /launchpad/i.test(String(name));
}

/**
 * Find the first MIDI port index whose name matches a predicate.
 * @param {midi.Input|midi.Output} io
 * @param {(name: string, index: number) => boolean} predicate
 * @returns {number|null}
 */
function findPort(io, predicate) {
    const n = io.getPortCount();
    for (let i = 0; i < n; i++) {
        if (predicate(io.getPortName(i), i)) return i;
    }
    return null;
}

/**
 * Resolve default Launchpad MIDI ports (input/output).
 * Honors LP_IN/LP_OUT if both are valid numbers; otherwise tries to detect by name.
 * Falls back to index 0 for each side if detection fails but ports exist.
 *
 * @returns {{ inIdx: number|null, outIdx: number|null }}
 */
export function getDefaultLaunchpadPorts() {
    const input = new midi.Input();
    const output = new midi.Output();
    try {
        const envIn = Number.isFinite(+process.env.LP_IN) ? +process.env.LP_IN : null;
        const envOut = Number.isFinite(+process.env.LP_OUT) ? +process.env.LP_OUT : null;
        if (envIn != null && envOut != null) return {inIdx: envIn, outIdx: envOut};

        let inIdx = findPort(input, isLaunchpadName);
        let outIdx = findPort(output, isLaunchpadName);

        if (inIdx == null && input.getPortCount() > 0) inIdx = 0;
        if (outIdx == null && output.getPortCount() > 0) outIdx = 0;

        return {inIdx, outIdx};
    } finally {
        // These objects keep native handles; close immediately after probing.
        try {
            input.closePort?.();
        } catch {
        }
        try {
            output.closePort?.();
        } catch {
        }
    }
}

/**
 * Adapter for Launchpad devices using @julusian/midi.
 *
 * Events
 * - `onPadEvents(onDown, onUp)`: subscribe to pad presses/releases.
 *
 * Output
 * - `setPad(padId, [r,g])`: set LED color with internal dedupe to limit traffic.
 *
 * Lifecycle
 * - `clearAll()`: ensure the hardware is visually reset (bypasses cache).
 * - `shutdown()`: clear LEDs then close ports.
 * - `close()`: remove listeners and close ports (idempotent).
 */
export class LaunchpadJulusian extends LaunchpadPort {
    /**
     * @param {{ inIdx?:number, outIdx?:number, channel?:number, logPressedNotes?:boolean }} [opts]
     *  - inIdx/outIdx: explicit MIDI port indices; if omitted, auto‑detection is used.
     *  - channel: MIDI channel (0..15), default 0.
     *  - logPressedNotes: when true, logs each NOTE ON with velocity> 0 as debug.
     */
    constructor({inIdx, outIdx, channel = 0, logPressedNotes = true} = {}) {
        super();

        // Channel and status bytes
        this.channel = channel & 0x0F;
        this.logPressedNotes = !!logPressedNotes;
        this.STATUS_NOTE_ON = 0x90 | this.channel;
        this.STATUS_NOTE_OFF = 0x80 | this.channel;
        this.STATUS_CC = 0xB0 | this.channel;

        // MIDI handles
        this.input = new midi.Input();
        this.output = new midi.Output();
        this._closed = false;

        // Resolve ports if not provided
        if (inIdx == null || outIdx == null) {
            const def = getDefaultLaunchpadPorts();
            inIdx = def.inIdx;
            outIdx = def.outIdx;
        }
        if (inIdx == null || outIdx == null) {
            throw new Error('Launchpad ports not found');
        }

        // Open ports and configure input
        logger.info('[MIDI] open', {inIdx, outIdx, channel: this.channel});
        this.input.openPort(inIdx);
        this.output.openPort(outIdx);
        // Pass all message types through
        this.input.ignoreTypes(false, false, false);

        // Some devices need a small “init” CC on boot; the best‑effort only.
        try {
            this.output.sendMessage([this.STATUS_CC, 0x00, 0x01]);
        } catch {
        }

        // LED velocity cache: padId → last velocity sent
        this._lastVel = new Map();

        // Single bound handler for all incoming MIDI messages
        this._onMessage = (_dt, msg) => {
            const status = msg[0] | 0;
            if ((status & 0x0F) !== this.channel) return; // ignore other channels

            const kind = status & 0xF0;
            const data1 = msg[1] & 0x7F; // note/cc
            const data2 = msg[2] & 0x7F; // velocity

            let down = false, up = false;
            if (kind === 0x90) { // NOTE ON
                down = data2 > 0;
                up = data2 === 0;   // many devices send NOTE ON with velocity=0 for release
            } else if (kind === 0x80) { // NOTE OFF
                up = true;
            } else {
                return; // ignore non‑note messages here
            }

            try {
                if (down) {
                    if (this.logPressedNotes) logger.debug('[MIDI] note down', {note: data1});
                    this._onDown && this._onDown(data1);
                } else if (up) {
                    this._onUp && this._onUp(data1);
                }
            } catch (e) {
                logger.error('[MIDI] handler error', e);
            }
        };

        this.input.on('message', this._onMessage);
    }

    /** Optional async hook point (reserved for future use). */
    async open() {
    }

    /** Optional async hook point (reserved for future use). */
    async init() {
    }

    /**
     * Subscribe to pad events.
     * @param {(padId:number)=>void} onDown
     * @param {(padId:number)=>void} onUp
     * @returns {() => void} unsubscribe function
     */
    onPadEvents(onDown, onUp) {
        this._onDown = onDown;
        this._onUp = onUp;
        return () => {
            this._onDown = null;
            this._onUp = null;
        };
    }

    /**
     * Set a pad’s LED color.
     * - For padId in 0..127: NOTE ON with encoded velocity.
     * - For padId >= 200: CC message (cc = padId - 200) with encoded velocity.
     * Writes are deduplicated; identical consecutive values are skipped.
     *
     * @param {number} padId
     * @param {[number,number]} color - [r,g] intensities (0..3 each)
     */
    setPad(padId, color) {
        if (this._closed || padId == null) return;

        const velocity = encodeColor(color) & 0x7F;
        const prev = this._lastVel.get(padId);
        if (prev === velocity) return; // skip redundant writes
        this._lastVel.set(padId, velocity);

        try {
            if (padId >= 200) {
                const cc = (padId - 200) & 0x7F;
                this.output.sendMessage([this.STATUS_CC, cc, velocity]);
            } else {
                const note = padId & 0x7F;
                this.output.sendMessage([this.STATUS_NOTE_ON, note, velocity]);
            }
        } catch (e) {
            logger.warn('[MIDI] sendMessage failed', {padId, velocity, err: String(e)});
        }
    }

    /**
     * Clear all LEDs (cache‑bypassing hardware reset).
     * Sends NOTE ON with velocity 0 for all notes 0..127,
     * and then “All Notes Off” CC (123) across channels 0..15.
     */
    async clearAll() {
        if (this._closed) return;
        try {
            for (let n = 0; n <= 127; n++) {
                this.output.sendMessage([this.STATUS_NOTE_ON, n & 0x7F, 0x00]);
            }
            // All Notes Off on every channel to cover devices with multiple logical ports
            for (let ch = 0; ch < 16; ch++) {
                this.output.sendMessage([0xB0 | ch, 123, 0]);
            }
            this._lastVel.clear();
            await new Promise(r => setTimeout(r, 15));
        } catch (e) {
            logger.warn('[MIDI] clearAll failed', {err: String(e)});
        }
    }

    /** Clear LEDs and close ports. Safe to call multiple times. */
    async shutdown() {
        try {
            await this.clearAll();
        } catch {
        }
        this.close();
    }

    /** Remove listeners and close MIDI ports. Safe to call multiple times. */
    close() {
        if (this._closed) return;
        this._closed = true;
        try {
            this.input?.removeListener?.('message', this._onMessage);
        } catch {
        }
        try {
            this.input?.closePort();
        } catch {
        }
        try {
            this.output?.closePort();
        } catch {
        }
        logger.info('[MIDI] closed');
    }
}
