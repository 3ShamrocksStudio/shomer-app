#!/usr/bin/env bash
set -x
OUT=demo-out; mkdir -p $OUT
APK=native/android/app/build/outputs/apk/debug/app-debug.apk
P=il.co.shomerapp
adb wait-for-device
adb shell settings put system screen_off_timeout 1800000
adb install -r -g "$APK"
for perm in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION POST_NOTIFICATIONS CAMERA; do adb shell pm grant $P android.permission.$perm || true; done
adb shell appops set $P USE_FULL_SCREEN_INTENT allow || true
adb emu geo fix 34.7818 32.0853 || true
# record (max 180s)
adb shell screenrecord --time-limit 175 --bit-rate 3000000 /sdcard/demo.mp4 &
REC=$!
sleep 2
adb shell am start -n $P/.MainActivity
sleep 35
adb devices -l | tee $OUT/devices.txt; adb shell dumpsys activity top | head -5 | tee -a $OUT/devices.txt
timeout 240 python3 .github/demo/drive.py signin | tee $OUT/drive.log
sleep 6
timeout 240 python3 .github/demo/drive.py settings | tee -a $OUT/drive.log
sleep 2
# show the always-on "Shake-to-SOS armed" notification
adb shell cmd statusbar expand-notifications; sleep 5; adb devices | tee -a $OUT/devices.txt
adb shell cmd statusbar collapse; sleep 2
# lock the phone
adb shell input keyevent KEYCODE_POWER; sleep 4
# shake: alternate strong acceleration on the X axis, ~20 times
for i in $(seq 1 22); do adb emu sensor set acceleration 26:0:9.8 >/dev/null; sleep 0.06; adb emu sensor set acceleration -26:0:9.8 >/dev/null; sleep 0.06; done
adb emu sensor set acceleration 0:0:9.8
sleep 6
sleep 12
timeout 240 python3 .github/demo/drive.py state | tee -a $OUT/drive.log || true
sleep 6
adb shell pkill -INT screenrecord || true
sleep 4
wait $REC || true
timeout 120 adb pull /sdcard/demo.mp4 $OUT/shomer-shake-sos-demo.mp4 || true
timeout 60 adb logcat -d > $OUT/logcat.txt || true
ls -la $OUT
