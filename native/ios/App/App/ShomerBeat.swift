import Foundation
import CryptoKit
import Security

/**
 * BACKGROUND DASHBOARD HEARTBEAT + ALERTS FROM MY SHOMERS - port of Android's BeatTask.java.
 *
 * Same data, same rules (see CLAUDE.md data & privacy policy):
 *  - same anonymous dashboard row the web app owns (dashown/<id> = my uid), same ~1 km point
 *    the web app already rounded, same daily-rotating anonymous tag - nothing new is collected;
 *  - skipped while the app is on screen (the web layer beats then);
 *  - a new unlinkable row every Israel calendar day, the old one deleted;
 *  - ghost mode / no location / sign-out: the web app sends on=false; wipe=true forgets all.
 *
 * iOS difference: there is no always-on foreground service. This timer only runs while iOS
 * keeps SH✡MER alive in the background, which it does while background location is active.
 * The reliable closed-app path for alerts is an APNs push (see IOS-PARITY.md, row "push").
 *
 * NOT YET COMPILED: written on Linux. First Xcode build may need small fixes.
 */
final class ShomerBeat {
    static let shared = ShomerBeat()

    private let every: TimeInterval = 60
    private let queue = DispatchQueue(label: "shomer-beat")
    private var timer: DispatchSourceTimer?
    private var idTok: String?
    private var idTokExp: TimeInterval = 0
    private var ringingId: String?
    var webForeground = true

    private let defaults = UserDefaults.standard
    private let prefix = "shomer_beat."
    private let defaultDb = "https://shomergency-default-rtdb.firebaseio.com"

    private func get(_ k: String) -> String? { defaults.string(forKey: prefix + k) }
    private func set(_ k: String, _ v: Any?) { defaults.set(v, forKey: prefix + k) }

    // MARK: lifecycle

    func start() {
        queue.async {
            if self.timer != nil { return }
            let t = DispatchSource.makeTimerSource(queue: self.queue)
            t.schedule(deadline: .now() + 15, repeating: self.every)
            t.setEventHandler { [weak self] in self?.tick() }
            t.resume()
            self.timer = t
        }
    }

    func stop() {
        queue.async {
            self.timer?.cancel()
            self.timer = nil
        }
    }

    /// Called from the web app on every foreground beat (or on=false to remove my row).
    func configure(_ o: [AnyHashable: Any]) {
        queue.async {
            if (o["wipe"] as? Bool) == true {   // account deleted: forget everything
                for k in ["on", "key", "nativeKey", "day", "uid", "dev", "rt", "apiKey", "db", "lat", "lng", "ga_seen"] { self.set(k, nil) }
                self.idTok = nil
                return
            }
            let oldKey = self.get("key")
            let oldNative = self.defaults.bool(forKey: self.prefix + "nativeKey")
            let newKey = o["key"] as? String
            self.set("on", (o["on"] as? Bool) ?? false)
            if let nk = newKey, nk.hasPrefix("hb_") {
                self.set("key", nk)
                self.set("nativeKey", false)
                self.set("day", self.dayKey())
            }
            for k in ["uid", "dev", "rt", "apiKey", "db"] {
                if let v = o[k] as? String, !v.isEmpty { self.set(k, v) }
            }
            if let lat = o["lat"] as? Double, let lng = o["lng"] as? Double {
                self.set("lat", String(lat))
                self.set("lng", String(lng))
            }
            // A row this timer created after midnight is replaced by the web app's own row: remove mine.
            if oldNative, let ok = oldKey, let nk = newKey, ok != nk, let t = self.token() {
                _ = self.rest("DELETE", "dashfeed/" + ok, nil, t)
                _ = self.rest("DELETE", "dashown/" + ok, nil, t)
            }
        }
    }

    // MARK: tick

    private func tick() {
        if webForeground { return }
        checkGuardAlerts()   // alerts from my linked SHOMERs reach a locked phone too
        beatOnce()
    }

    private func beatOnce() {
        guard defaults.bool(forKey: prefix + "on") else { return }
        guard var key = get("key"), let uid = get("uid"), let dev = get("dev"),
              let latS = get("lat"), let lngS = get("lng"),
              let lat = Double(latS), let lng = Double(lngS) else { return }
        guard let t = token() else { return }
        let dk = dayKey()
        if dk != (get("day") ?? "") {   // midnight: fresh unlinkable row, old one deleted
            let nk = "hb_" + hex(8)
            if rest("PUT", "dashown/" + nk, jsonString(uid), t) / 100 != 2 { return }
            _ = rest("DELETE", "dashfeed/" + key, nil, t)
            _ = rest("DELETE", "dashown/" + key, nil, t)
            set("key", nk); set("day", dk); set("nativeKey", true)
            key = nk
        }
        let row: [String: Any] = [
            "type": "presence",
            "lat": lat, "lng": lng,   // already ~1 km (2 decimals) from the app
            "ts": Int64(Date().timeIntervalSince1970 * 1000),
            "status": "v2:" + String(sha256(dev + ":" + dk).prefix(12))
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: row),
              let json = String(data: body, encoding: .utf8) else { return }
        if rest("PUT", "dashfeed/" + key, json, t) == 401 { idTok = nil }
    }

    // MARK: alerts from linked SHOMERs (ping/<me>/<them>)

    private func checkGuardAlerts() {
        guard let uid = get("uid"), let t = token() else { return }
        guard let body = getJson("ping/" + uid, t), body != "null",
              let data = body.data(using: .utf8),
              let all = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        var seen = get("ga_seen") ?? ""
        let now = Date().timeIntervalSince1970 * 1000
        for (_, raw) in all {
            guard let v = raw as? [String: Any] else { continue }
            let id = v["id"] as? String ?? ""
            let lv = v["level"] as? String ?? ""
            if id.isEmpty { continue }
            if lv == "stop" && id == ringingId { clearGuardAlert(); continue }
            if !(lv == "alert" || lv == "alarm") { continue }
            let ts = (v["ts"] as? NSNumber)?.doubleValue ?? 0
            if now - ts > 15 * 60_000 { continue }
            if seen.contains("|" + id + "|") { continue }
            seen = "|" + id + "|" + seen
            if seen.count > 1200 { seen = String(seen.prefix(1200)) }
            set("ga_seen", seen)
            ringingId = id
            ShomerAlarm.shared.start()
            let name = v["name"] as? String ?? "SHOMER"
            ShomerNotify.post(id: "shomer-guard",
                              title: (lv == "alarm" ? "🚨 " : "🔔 ") + "SHOMER - " + name,
                              body: "Open and enter your cancel code / פתח/י והזן/י קוד ביטול")
        }
    }

    /// The app handled this alert: never ring it again from the background, and silence it now.
    func markHandled(_ id: String) {
        if id.isEmpty { return }
        queue.async {
            var seen = self.get("ga_seen") ?? ""
            if !seen.contains("|" + id + "|") {
                seen = "|" + id + "|" + seen
                if seen.count > 1200 { seen = String(seen.prefix(1200)) }
                self.set("ga_seen", seen)
            }
            if id == self.ringingId { self.clearGuardAlertNow() }
        }
    }

    func clearGuardAlert() {
        queue.async { self.clearGuardAlertNow() }
    }

    private func clearGuardAlertNow() {
        ShomerAlarm.shared.stop()
        ringingId = nil
        ShomerNotify.remove(id: "shomer-guard")
    }

    // MARK: network (blocking, always on `queue`)

    private func db() -> String { get("db") ?? defaultDb }

    /// Firebase ID token from the anonymous account's refresh token (the same sign-in the app uses).
    private func token() -> String? {
        if let t = idTok, Date().timeIntervalSince1970 < idTokExp { return t }
        guard let rt = get("rt"), let key = get("apiKey"),
              let url = URL(string: "https://securetoken.googleapis.com/v1/token?key=" + enc(key)) else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = ("grant_type=refresh_token&refresh_token=" + enc(rt)).data(using: .utf8)
        guard let r = send(req), r.0 / 100 == 2,
              let j = (try? JSONSerialization.jsonObject(with: r.1)) as? [String: Any],
              let tok = j["id_token"] as? String else { return nil }
        if let nrt = j["refresh_token"] as? String, !nrt.isEmpty, nrt != rt { set("rt", nrt) }
        let exp = Double(j["expires_in"] as? String ?? "") ?? (j["expires_in"] as? Double) ?? 3600
        idTok = tok
        idTokExp = Date().timeIntervalSince1970 + max(60, exp - 300)
        return tok
    }

    private func rest(_ method: String, _ path: String, _ json: String?, _ tok: String) -> Int {
        guard let url = URL(string: db() + "/" + path + ".json?auth=" + enc(tok)) else { return -1 }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = method
        if let j = json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = j.data(using: .utf8)
        }
        return send(req)?.0 ?? -1
    }

    private func getJson(_ path: String, _ tok: String) -> String? {
        guard let url = URL(string: db() + "/" + path + ".json?auth=" + enc(tok)) else { return nil }
        guard let r = send(URLRequest(url: url, timeoutInterval: 15)), r.0 / 100 == 2 else { return nil }
        return String(data: r.1, encoding: .utf8)
    }

    private func send(_ req: URLRequest) -> (Int, Data)? {
        let sem = DispatchSemaphore(value: 0)
        var out: (Int, Data)?
        URLSession.shared.dataTask(with: req) { data, resp, _ in
            if let h = resp as? HTTPURLResponse { out = (h.statusCode, data ?? Data()) }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 20)
        return out
    }

    // MARK: helpers

    private func enc(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    private func jsonString(_ s: String) -> String {
        if let d = try? JSONSerialization.data(withJSONObject: [s]), let a = String(data: d, encoding: .utf8) {
            return String(a.dropFirst().dropLast())   // ["x"] -> "x"
        }
        return "\"" + s + "\""
    }

    private func dayKey() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Jerusalem")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    private func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func hex(_ n: Int) -> String {
        var b = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
        return b.map { String(format: "%02x", $0) }.joined()
    }
}
