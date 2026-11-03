import Foundation
import UIKit
import AVFoundation
import AudioToolbox
import CoreMotion
import UserNotifications
import Capacitor

/**
 * SH✡MER native bridge for iOS - the same JS surface as Android's ShomerNativePlugin.java,
 * so shomer.html calls window.Capacitor.Plugins.ShomerNative the same way on both platforms.
 *
 * NOT YET COMPILED: written on Linux. First Xcode build may need small fixes.
 *
 * Android method          -> iOS behaviour
 * startAlarm / stopAlarm  -> looping SOS sound, .playback session (plays through the Silent switch)
 * enable/disableBackgroundShake -> CoreMotion shake detector (runs in the background while
 *                            background location keeps the app alive) + dashboard heartbeat
 * beat / gaHandled / start|stopGuardAlarm -> ShomerBeat (port of BeatTask.java)
 * requestBatteryExemption -> nothing to ask on iOS: resolves {granted:true}
 * canFullScreen           -> no full-screen intents on iOS: resolves {granted:true} so the
 *                            Android-only lock-screen nudge is never shown
 * openFullScreenSettings  -> opens SH✡MER's page in iOS Settings
 * requestNotifications    -> UNUserNotificationCenter authorisation
 */
@objc(ShomerNativePlugin)
public class ShomerNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShomerNativePlugin"
    public let jsName = "ShomerNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isNative", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableBackgroundShake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disableBackgroundShake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startGuardAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gaHandled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopGuardAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBatteryExemption", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canFullScreen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openFullScreenSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifications", returnType: CAPPluginReturnPromise)
    ]

    private let shake = ShomerShake()
    private var lastFire: TimeInterval = 0

    override public func load() {
        shake.onFire = { [weak self] in self?.fireShakeSos() }
        DispatchQueue.main.async {
            ShomerBeat.shared.webForeground = UIApplication.shared.applicationState == .active
        }
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            ShomerBeat.shared.webForeground = true
        }
        nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
            ShomerBeat.shared.webForeground = false
        }
    }

    @objc func isNative(_ call: CAPPluginCall) {
        call.resolve(["native": true, "platform": "ios"])
    }

    @objc func startAlarm(_ call: CAPPluginCall) {
        ShomerAlarm.shared.start()
        call.resolve()
    }

    @objc func stopAlarm(_ call: CAPPluginCall) {
        ShomerAlarm.shared.stop()
        call.resolve()
    }

    @objc func enableBackgroundShake(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.shake.start() }
        ShomerBeat.shared.start()   // Android: ShakeService starts BeatTask
        call.resolve()
    }

    @objc func disableBackgroundShake(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.shake.stop() }
        ShomerBeat.shared.stop()
        call.resolve()
    }

    @objc func beat(_ call: CAPPluginCall) {
        ShomerBeat.shared.configure(call.options ?? [:])
        call.resolve()
    }

    @objc func startGuardAlarm(_ call: CAPPluginCall) {
        ShomerAlarm.shared.start()
        call.resolve()
    }

    @objc func gaHandled(_ call: CAPPluginCall) {
        ShomerBeat.shared.markHandled(call.getString("id") ?? "")
        call.resolve()
    }

    @objc func stopGuardAlarm(_ call: CAPPluginCall) {
        ShomerBeat.shared.clearGuardAlert()
        call.resolve()
    }

    @objc func requestBatteryExemption(_ call: CAPPluginCall) {
        call.resolve(["granted": true, "platform": "ios"])
    }

    @objc func canFullScreen(_ call: CAPPluginCall) {
        call.resolve(["granted": true, "platform": "ios"])
    }

    @objc func openFullScreenSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
        }
        call.resolve()
    }

    @objc func requestNotifications(_ call: CAPPluginCall) {
        var opts: UNAuthorizationOptions = [.alert, .sound, .badge]
        if ShomerNotify.criticalAlertsApproved { opts.insert(.criticalAlert) }
        UNUserNotificationCenter.current().requestAuthorization(options: opts) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    // MARK: - Shake-to-SOS

    private func fireShakeSos() {
        let now = Date().timeIntervalSince1970
        if now - lastFire < 8 { return }   // still shaking after it fired - not a second press
        lastFire = now
        ShomerAlarm.vibrateBurst(times: 3) // felt confirmation in the pocket
        deliverSos("shake", attempt: 0)
        // iOS cannot bring an app over the lock screen (no full-screen intent). Tell the user
        // the cancellable countdown is running; tapping opens SH✡MER on the SOS screen.
        if UIApplication.shared.applicationState != .active {
            ShomerNotify.post(id: "shomer-shake",
                              title: "SH✡MER - SOS",
                              body: "Shake detected - SOS countdown started. Open to cancel. / זוהה ניעור - ספירה ל-SOS התחילה. פתח/י לביטול.")
        }
    }

    /// Hand the SOS to the web app and keep trying until it confirms (the page may still be
    /// loading). Same contract as MainActivity.deliverSos on Android.
    func deliverSos(_ reason: String, attempt: Int) {
        let safe = reason.replacingOccurrences(of: "'", with: "")
        DispatchQueue.main.async {
            guard let wv = self.bridge?.webView else { return }
            let js = "(typeof window.__shomerNativeSOS==='function')?(window.__shomerNativeSOS('\(safe)'),'ok'):'wait'"
            wv.evaluateJavaScript(js) { result, _ in
                if let s = result as? String, s == "ok" { return }
                if attempt < 60 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) {
                        self.deliverSos(safe, attempt: attempt + 1)
                    }
                }
            }
        }
    }
}

// MARK: - SOS alarm

/// The loud SOS alarm. Uses the .playback audio session, which keeps playing with the
/// Ring/Silent switch on silent and (with the "audio" background mode) on a locked phone.
/// iOS does not let an app raise the system volume itself - that is the one gap vs Android.
final class ShomerAlarm {
    static let shared = ShomerAlarm()
    private var player: AVAudioPlayer?
    private var vibeTimer: Timer?

    func start() {
        DispatchQueue.main.async {
            if let p = self.player, p.isPlaying { return }
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [])
                try session.setActive(true)
                if let url = Bundle.main.url(forResource: "sos_alarm", withExtension: "wav") {
                    let p = try AVAudioPlayer(contentsOf: url)
                    p.numberOfLoops = -1
                    p.volume = 1.0
                    p.prepareToPlay()
                    p.play()
                    self.player = p
                }
            } catch {
                // never crash the alarm
            }
            self.vibeTimer?.invalidate()
            self.vibeTimer = Timer.scheduledTimer(withTimeInterval: 1.2, repeats: true) { _ in
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            }
        }
    }

    func stop() {
        DispatchQueue.main.async {
            self.player?.stop()
            self.player = nil
            self.vibeTimer?.invalidate()
            self.vibeTimer = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    static func vibrateBurst(times: Int) {
        for i in 0..<max(1, times) {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.55) {
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            }
        }
    }
}

// MARK: - Shake detector

/// Same gravity-free shake algorithm and thresholds as Android's ShakeService.java:
/// REQUIRED hard peaks above THRESHOLD m/s^2 within WINDOW seconds, at least MIN_GAP apart.
final class ShomerShake {
    var onFire: (() -> Void)?
    private let motion = CMMotionManager()
    private var count = 0
    private var firstT: TimeInterval = 0
    private var lastPeak: TimeInterval = 0
    private let required = 6
    private let window: TimeInterval = 1.5
    private let minGap: TimeInterval = 0.12
    private let threshold = 16.0   // m/s^2, gravity removed
    private let g = 9.80665

    func start() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 50.0   // ~SENSOR_DELAY_GAME
        motion.startDeviceMotionUpdates(to: OperationQueue.main) { [weak self] data, _ in
            guard let self = self, let a = data?.userAcceleration else { return }
            let mag = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot() * self.g
            let now = Date().timeIntervalSince1970
            if mag > self.threshold && now - self.lastPeak > self.minGap {
                if self.firstT == 0 || now - self.firstT > self.window { self.firstT = now; self.count = 0 }
                self.count += 1
                self.lastPeak = now
                if self.count >= self.required {
                    self.count = 0
                    self.firstT = 0
                    self.onFire?()
                }
            }
        }
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
    }
}

// MARK: - Local notifications

enum ShomerNotify {
    /// Flip to true only after Apple grants the Critical Alerts entitlement and it is added to
    /// App.entitlements. Until then alerts are Time Sensitive (break through Focus, not mute).
    static let criticalAlertsApproved = false

    static func post(id: String, title: String, body: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        if criticalAlertsApproved {
            c.sound = UNNotificationSound.defaultCriticalSound(withAudioVolume: 1.0)
        } else {
            c.sound = UNNotificationSound.default
        }
        if #available(iOS 15.0, *) {
            c.interruptionLevel = criticalAlertsApproved ? .critical : .timeSensitive
        }
        let req = UNNotificationRequest(identifier: id, content: c, trigger: nil)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    static func remove(id: String) {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [id])
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }
}
