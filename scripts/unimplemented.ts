/**
 * Placeholder for a script whose owning implementation unit has not landed yet.
 *
 * `package.json` declares the full command surface from U1 onward so the shape
 * of the project is visible immediately. A command that is not implemented yet
 * must fail loudly and name the unit that will implement it, rather than
 * exiting 0 and letting CI believe it ran.
 */
const [command, unit] = process.argv.slice(2);

if (!command || !unit) {
  console.error('unimplemented.ts requires <command> <unit>');
  process.exit(2);
}

console.error(`npm run ${command} is not implemented yet — it lands in ${unit}.`);
process.exit(1);
