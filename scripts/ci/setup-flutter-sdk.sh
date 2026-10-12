#!/usr/bin/env bash
set -euo pipefail

test "${RUNNER_OS:?}" = Linux
test "${RUNNER_ARCH:?}" = X64
test "${FLUTTER_CHANNEL:?}" = stable
case "${FLUTTER_CACHE:?}" in true|false) ;; *) exit 2 ;; esac
test -f "${FLUTTER_VERSION_FILE:?}"
flutter_version="$(node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).flutter; if(typeof value!=="string" || !/^\d+\.\d+\.\d+$/.test(value)) process.exit(2); process.stdout.write(value);' "$FLUTTER_VERSION_FILE")"
sdk_parent="${RUNNER_TOOL_CACHE:?}/lythaus-flutter/${flutter_version}/${FLUTTER_CHANNEL}"
sdk_root="${sdk_parent}/flutter"

case "${1:?}" in
  resolve)
    printf 'version=%s\nroot=%s\n' "$flutter_version" "$sdk_root" >> "${GITHUB_OUTPUT:?}"
    ;;
  install)
    if [[ ! -x "$sdk_root/bin/flutter" ]]; then
      mkdir -p "$sdk_parent"
      archive="${RUNNER_TEMP:?}/flutter_linux_${flutter_version}-stable.tar.xz"
      curl --fail --location --retry 4 --retry-delay 2 --output "$archive" "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${flutter_version}-stable.tar.xz"
      tar -xJf "$archive" -C "$sdk_parent"
      rm -f "$archive"
    fi
    test -x "$sdk_root/bin/flutter"
    "$sdk_root/bin/flutter" --version --machine > "${RUNNER_TEMP:?}/lythaus-flutter-version.json"
    node -e 'const fs=require("node:fs"); const actual=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(actual.frameworkVersion!==process.argv[2] || actual.channel!==process.argv[3]) { console.error("Flutter SDK does not match the requested version and channel"); process.exit(1); } console.log("Flutter " + actual.frameworkVersion + " (" + actual.channel + ")");' "$RUNNER_TEMP/lythaus-flutter-version.json" "$flutter_version" "$FLUTTER_CHANNEL"
    printf '%s\n%s\n' "$sdk_root/bin" "$sdk_root/bin/cache/dart-sdk/bin" >> "${GITHUB_PATH:?}"
    ;;
  *) exit 2 ;;
esac
