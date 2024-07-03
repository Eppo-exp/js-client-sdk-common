#!/usr/bin/env bash
set -eo pipefail

## usage: local-install.sh <package-to-install-dir> <consuming-app-dir>'
##
## examples:
##
##  Install js-client-sdk-common changes into js-client-sdk:
##   ./scripts/local-install.sh . ../js-client-sdk
##
##  Install js-client-sdk changes into a test app
##   ./scripts/local-install.sh ../js-client-sdk ../test-apps/my-react-app
##
##  Install js-client-sdk-common changes into a test app
##   ./scripts/local-install.sh . ../js-client-sdk && ./scripts/local-install.sh ../js-client-sdk ../test-apps/my-react-app

if ! command -v jq &> /dev/null; then
  echo "jq must be installed before using this script"
  exit 1
fi

if [[ "$1" = "" || "$2" = "" ]]; then
  echo 'usage: local-install.sh <package-to-install-dir> <consuming-app-dir>'
  exit 1
fi

if [ ! -d "$1" ]; then
  echo "$1 is not a directory"
  exit 1
fi

if [ ! -f "$1/package.json" ]; then
  echo "$1 is not an npm package"
  exit 1
fi

if [ ! -d "$2" ]; then
  echo "$2 is not a directory"
  exit 1
fi

if [ ! -f "$2/package.json" ]; then
  echo "$2 is not an npm package"
  exit 1
fi

### Create local package via "npm pack"
pushd "$1" > /dev/null
mkdir -p /tmp/packages
PACKAGE_DIR=/tmp/packages/"$(basename "$(pwd)")"
rm -rf "${PACKAGE_DIR}" /tmp/pack.out && npm pack > /tmp/pack.out
COMPRESSED_PACKAGE="$(tail -1 /tmp/pack.out)"
tar -xzf "${COMPRESSED_PACKAGE}"
rm "${COMPRESSED_PACKAGE}"
mv package "${PACKAGE_DIR}"
PACKAGE_NAME=$(cat ./package.json | jq -r '.name')
popd > /dev/null

### Install local package to target package
pushd "$2" > /dev/null
TARGET_DIR="$(pwd)"
rm -rf node_modules/.cache
yarn remove "${PACKAGE_NAME}"
yarn add "${PACKAGE_DIR}" --exact
popd > /dev/null

echo "$PACKAGE_DIR installed in $TARGET_DIR"