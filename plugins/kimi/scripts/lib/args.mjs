// Minimal argument parser, no dependencies.
//
// parseArgs(['--base', 'main', '--background', 'fix', 'this'], { valueFlags: ['base'] })
//   -> { flags: { base: 'main', background: true }, positionals: ['fix', 'this'] }
//
// Flags listed in valueFlags consume the next token as their value; every other
// --flag is boolean. Anything not starting with '--' is a positional.
//
// With flagsFirst: true, parsing switches to positional-only mode at the first
// non-flag token — free-text commands (rescue, adversarial-review) use this so
// that text like "fix the --verbose flag" keeps its '--verbose' intact instead
// of being swallowed as a boolean flag.
export function parseArgs(argv, { valueFlags = [], flagsFirst = false } = {}) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && !(flagsFirst && positionals.length > 0)) {
      const name = arg.slice(2);
      if (valueFlags.includes(name)) {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new Error(`Flag --${name} requires a value`);
        }
        flags[name] = value;
        i++;
      } else {
        flags[name] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}
