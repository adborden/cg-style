var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var prompt = require('prompt');

var p = require('../package.json');

var args = Array.prototype.slice.call(process.argv);

var rootPath = path.resolve(__dirname, '..');
var gemPath = `${rootPath}/gem`;

function exec(cmd, opts) {
  opts = opts || {};
  return new Promise(function(resolve, reject) {
    childProcess.exec(cmd, opts, function (error, stdout) {
      if (error) reject(error);
      resolve(stdout);
    });
  });
}

function promptForValues(values) {
  return new Promise(function(resolve, reject) {
    prompt.get(values, function (err, result) {
      if (err) reject(err);
      resolve(result);
    });
  });
}

function updatePackageJson(updates) {
  return Object.assign({}, p, updates);
}

function writePackageJson(package) {
  var packagePath = path.resolve(rootPath, 'package.json');
  var content = JSON.stringify(package, null, '  ');
  console.log('Updating package.json with version number');
  console.log(`\tat ${packagePath}`);
  fs.writeFileSync(packagePath, `${content}\n`);
}

function writeGemVersion(version) {
  var versionRegex = /([0-9\.]+)/g;
  var versionFilePath = `${gemPath}/lib/cloudgov-style/version.rb`;
  var oldVersionFile = fs.readFileSync(versionFilePath, 'utf8');
  var newVersionFile = oldVersionFile.replace(versionRegex, version);
  console.log('Updating version.rb with version number');
  console.log(`\tat ${versionFilePath}`);
  fs.writeFileSync(versionFilePath, newVersionFile);
}

function checkoutJSReleaseBranch(release) {
  console.log(`Checking out a new branch (${release.branch}) for the JS release`);
  return exec(`cd ${rootPath}`).then(function() {
    return exec('git checkout master');
  }).then(function(){
    return exec(`git checkout -b ${release.branch}`);
  });
}

function checkoutGemReleaseBranch(release) {
  console.log(`Checking out a new branch (${release.branch}) for the Ruby release`);
  return exec('git checkout master', { cwd: gemPath }).then(function() {
    return exec(`git checkout -b ${release.branch}`, { cwd: gemPath });
  });
}

function commitNewPackageJson(release) {
  console.log('Commiting package.json with new version number');
  return exec(`git add package.json`).then(function() {
    return exec(`git commit -m "Updating package.json version to ${release.version}"`);
  });
}

function commitNewGemVersion(release) {
  var opts = { cwd: gemPath };
  console.log('Commiting package.json with new version number');
  return exec(`git add lib/cloudgov-style/version.rb`, opts).then(function() {
    return exec(`git commit -m "Updating gem version to ${release.version}"`, opts);
  });
}

function tagAndPushNewPackageJson(release) {
  console.log('Tagging release branch and pushing to Github');
  var tag = `git tag -a ${release.version} -m 'v${release.version} - ${release.description}'`;
  var pushBranch = `git push origin ${release.branch}`;
  var pushTag = `git push origin ${release.version}`;

  return exec(tag).then(function() {
    return exec(pushBranch);
  }).then(function() {
    return exec(pushTag);
  });
}

function tagAndPushNewGemVersion(release) {
  console.log('Tagging release branch and pushing to Github');
  var opts = { cwd: gemPath };
  var tag = `git tag -a ${release.version} -m 'v${release.version} - ${release.description}'`;
  var pushBranch = `git push origin ${release.branch}`;
  var pushTag = `git push origin ${release.version}`;

  return exec(tag, opts).then(function() {
    return exec(pushBranch, opts);
  }).then(function() {
    return exec(pushTag, opts);
  });
}

prompt.message = '';

var values = {
  properties: {
    version: {
      description: `New version number to release (current is ${p.version})`,
      type: 'string',
      required: true
    },
    description: {
      description: 'Main idea behind release',
      type: 'string',
      required: true
    }
  }
};

promptForValues(values)
.then(function(results) {
  var release = Object.assign({ branch: `release-${results.version}` }, results);
  console.log('release', release);
  console.log(`Preparing to release version ${release.version}`)
  return release;
})
.then(function(release) {
  var packageJson = updatePackageJson({ version: release.version });
  console.log('First we\'ll publish a release to the npm registry');

  return checkoutJSReleaseBranch(release)
    .then(function() {
      writePackageJson(packageJson);
      return commitNewPackageJson(release)
    })
    .then(function() {
      return tagAndPushNewPackageJson(release);
    })
    .then(function() {
      return release;
    });
  return release;
})
.then(function(release) {
  var gemCmd = 'npm run gem-clone-ssh && npm run gem-dirs && npm run gem-copy';
  console.log('Next we\'ll publish a release to ruby gems');
  console.log('Cloning the gem repository into the project');

  return exec(gemCmd).then(function(){
    return checkoutGemReleaseBranch(release);
  }).then(function() {
    writeGemVersion(release.version);
    return commitNewGemVersion(release);
  }).then(function() {
    return tagAndPushNewGemVersion(release);
  }).then(function() {
    return release;
  });
})
.catch(function(err) {
  console.error('err happened', err);
})
