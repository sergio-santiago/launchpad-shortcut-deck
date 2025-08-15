// Minimal console logger with timestamp and basic ANSI colors

const colors = {
    info: '\x1b[36m', // cyan
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    debug: '\x1b[90m', // gray
};
const reset = '\x1b[0m';
const ts = () => new Date().toISOString();

export const logger = {
    info: (...a) => console.log(`${colors.info}[INFO ${ts()}]${reset}`, ...a),
    warn: (...a) => console.warn(`${colors.warn}[WARN ${ts()}]${reset}`, ...a),
    error: (...a) => console.error(`${colors.error}[ERROR ${ts()}]${reset}`, ...a),
    debug: (...a) => console.debug(`${colors.debug}[DEBUG ${ts()}]${reset}`, ...a),
};
