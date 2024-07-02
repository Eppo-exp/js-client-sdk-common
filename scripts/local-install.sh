#!/usr/bin/env bash
set -eo pipefail

## Example:
##
## local-install.sh sdk/js-client-sdk-common sdk/js-client-sdk && local-install.sh sdk/js-client-sdk test-apps/my-test-react-app
##

## (requires jq (`brew install jq`))

if [[ "$1" = "" || "$2" = "" ]]; then
  echo 'USAGE: ./local-install.sh <package-to-install-path> <consuming-app-path>'
  ehco ''
  echo ''
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

rm -rf ~/.yarn/berry/cache/\@eppo-*

### Create local package via "npm pack"
pushd "$1" > /dev/null
rm -rf package pack.out pack.err && npm pack 2> pack.err > pack.out
COMPRESSED_PACKAGE="$(tail -1 pack.out)"
tar -xzf "${COMPRESSED_PACKAGE}"
rm "${COMPRESSED_PACKAGE}"
PACKAGE_DIR="$(pwd)/package"
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