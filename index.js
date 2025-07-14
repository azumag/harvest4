/**
 * Harvest4 - GitHub Actions automation project
 */

function hello() {
  return 'Hello, Harvest4!';
}

function getVersion() {
  return '1.0.0';
}

module.exports = {
  hello,
  getVersion
};

// If this file is run directly, print a welcome message
if (require.main === module) {
  console.log(hello());
  console.log(`Version: ${getVersion()}`);
}