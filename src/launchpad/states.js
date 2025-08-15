import {COLORS} from './led-colors.js';

/**
 * Lists all logical LED states used across the app.
 *
 * Purpose:
 * - Acts as the canonical list of semantic states for pads.
 * - Used to drive both LED colors and behavior logic.
 *
 * Notes:
 * - Frozen to prevent accidental additions or modifications at runtime.
 * - State names are descriptive and UI-agnostic — they map to colors in
 *   LedStateColors but could also be used for other output layers.
 */
export const LedState = Object.freeze({
    UNASSIGNED: 'UNASSIGNED',
    ASSIGNED_STOPPED: 'ASSIGNED_STOPPED',
    RUNNING_BACKGROUND: 'RUNNING_BACKGROUND', // soft green
    RUNNING_FOCUSED: 'RUNNING_FOCUSED',       // intense green
    MINIMIZED: 'MINIMIZED',
    LAUNCHING: 'LAUNCHING',
    FOCUSING: 'FOCUSING',
    MINIMIZING: 'MINIMIZING',
    QUITTING: 'QUITTING',
    ERROR: 'ERROR',
});

/**
 * Mapping from logical LED state → Launchpad color tuple.
 *
 * Conventions:
 * - All tuples are defined in COLORS and are frozen there.
 * - Mapping is frozen here to avoid accidental runtime changes.
 * - Each state’s color choice reflects the intended UX meaning.
 *
 * Color semantics:
 * - Green tones: active / success states
 * - Amber / yellow: minimized or transitional actions
 * - Red tones: error / quitting / stopped states
 *
 * @type {Readonly<Record<keyof typeof LedState, [number, number]>>}
 */
export const LedStateColors = Object.freeze({
    [LedState.UNASSIGNED]: COLORS.off,
    [LedState.ASSIGNED_STOPPED]: COLORS.dimRed,
    [LedState.RUNNING_BACKGROUND]: COLORS.dimGreen,     // truly soft
    [LedState.RUNNING_FOCUSED]: COLORS.green,        // intense
    [LedState.MINIMIZED]: COLORS.amber,        // stable minimized
    [LedState.LAUNCHING]: COLORS.green,
    [LedState.FOCUSING]: COLORS.green,
    [LedState.MINIMIZING]: COLORS.yellowBright, // action-in-progress (distinct from amber)
    [LedState.QUITTING]: COLORS.red,
    [LedState.ERROR]: COLORS.red,
});
