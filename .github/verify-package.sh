#!/usr/bin/env bash
set -euo pipefail

localInstall () {
  ### Create local package via "npm pack"
  pushd "$1" > /dev/null
  mkdir -p /tmp/packages
  PACKAGE_DIR=/tmp/packages/"$(basename "$(pwd)")"
  rm -rf "${PACKAGE_DIR}" /tmp/pack.out && npm pack > /tmp/pack.out
  COMPRESSED_PACKAGE="$(tail -1 /tmp/pack.out)"
  tar -xzf "${COMPRESSED_PACKAGE}"
  rm "${COMPRESSED_PACKAGE}"
  mv package "${PACKAGE_DIR}"
  popd > /dev/null

  ### Install local package to target package
  pushd "$2" > /dev/null
  TARGET_DIR="$(pwd)"
  rm -rf node_modules/.cache
  cat package.json
  yarn add "${PACKAGE_DIR}" --exact --ignore-scripts
  popd > /dev/null

  echo "$PACKAGE_DIR installed in $TARGET_DIR"
}

rm -rf /tmp/js-client-sdk

pushd /tmp
git clone -b main --depth 1 --single-branch https://github.com/Eppo-exp/js-client-sdk.git
cd js-client-sdk
yarn install --ignore-scripts
popd

echo 'Installing package changes into js-client-sdk...'
localInstall . /tmp/js-client-sdk

echo 'Installing js-client-sdk into test-consumer-package...'
localInstall /tmp/js-client-sdk test/e2e/test-consumer-package

echo 'Running Tests...'
npx jest test/e2e/test-consumer-package/e2e.spec.ts