// Minimal console logger with timestamp, basic ANSI colors, and level filtering

const colors = {
    info: '\x1b[36m', // cyan
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    debug: '\x1b[90m', // gray
};
const reset = '\x1b[0m';
const ts = () => new Date().toISOString();

// Allowed levels in order of verbosity
const levels = ['error', 'warn', 'info', 'debug'];

// Get current log level from env (default: debug)
const currentLevel = process.env.LOG_LEVEL?.toLowerCase() || 'debug';
const currentIndex = levels.indexOf(currentLevel);

function shouldLog(level) {
    return levels.indexOf(level) <= currentIndex;
}

export const logger = {
    info: (...a) => shouldLog('info') && console.log(`${colors.info}[INFO ${ts()}]${reset}`, ...a),
    warn: (...a) => shouldLog('warn') && console.warn(`${colors.warn}[WARN ${ts()}]${reset}`, ...a),
    error: (...a) => shouldLog('error') && console.error(`${colors.error}[ERROR ${ts()}]${reset}`, ...a),
    debug: (...a) => shouldLog('debug') && console.debug(`${colors.debug}[DEBUG ${ts()}]${reset}`, ...a),
};