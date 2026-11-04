#!/usr/bin/env bash
# Merge SHOMER's required keys into the Info.plist that `npx cap add ios`
# just generated. Run from the `native` directory, after `cap add ios`.
#
# The generated ios/ folder is gitignored, so this script is how anything
# SHOMER needs survives a fresh CI checkout.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$HERE/../ios/App/App/Info.plist}"
ADDITIONS="$HERE/Info-additions.plist"

[ -f "$TARGET" ]    || { echo "ERROR: no generated Info.plist at $TARGET — run 'npx cap add ios' first" >&2; exit 1; }
[ -f "$ADDITIONS" ] || { echo "ERROR: missing $ADDITIONS" >&2; exit 1; }

python3 - "$TARGET" "$ADDITIONS" <<'PY'
import plistlib, sys

target, additions = sys.argv[1], sys.argv[2]

with open(target, 'rb') as f:
    base = plistlib.load(f)
with open(additions, 'rb') as f:
    extra = plistlib.load(f)

base.update(extra)

with open(target, 'wb') as f:
    plistlib.dump(base, f)

# Fail loudly rather than shipping a build that crashes on first permission ask.
required = [
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
    'NSContactsUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSSpeechRecognitionUsageDescription',
    'NSMotionUsageDescription',
    'NSCameraUsageDescription',
    'UIBackgroundModes',
]
missing = [k for k in required if k not in base]
if missing:
    print('ERROR: Info.plist still missing: ' + ', '.join(missing), file=sys.stderr)
    sys.exit(1)

print('Info.plist merged — %d keys, background modes: %s'
      % (len(base), ', '.join(base.get('UIBackgroundModes', []))))
PY
