import Foundation
import UIKit
import AVFAudio
import CallKit
import PushKit
import Capacitor

// Started by AppDelegate so a VoIP push is reported even before the WebView loads.
final class OlamideCalls: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = OlamideCalls()
    private let provider: CXProvider
    private var registry: PKPushRegistry?
    private var calls: [String: UUID] = [:]
    private var answering: [String: CXAnswerCallAction] = [:]
    private var pending: [[String: String]] = []
    private var token: String?
    weak var plugin: NativePushPlugin?
    override init() {
        let config = CXProviderConfiguration()
        config.supportedHandleTypes = [.generic]
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportsVideo = false
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: .main)
    }
    func start() {
        guard registry == nil else { return }
        let r = PKPushRegistry(queue: .main)
        r.delegate = self
        r.desiredPushTypes = [.voIP]
        registry = r
    }
    func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        token = credentials.token.map { String(format: "%02x", $0) }.joined()
        plugin?.notifyListeners("tokenChanged", data: [:], retainUntilConsumed: true)
    }
    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) { token = nil }
    func currentToken() -> String? { token }
    func emit(_ action: String, _ callId: String) {
        pending.append(["action": action, "callId": callId])
        plugin?.notifyListeners("callAction", data: [:], retainUntilConsumed: true)
    }
    func drain() -> [[String: String]] { let events = pending; pending = []; return events }
    func incoming(_ callId: String, completion: @escaping (Error?) -> Void) {
        if calls[callId] != nil { completion(nil); return }
        let uuid = UUID(); calls[callId] = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Olamide")
        update.localizedCallerName = "Incoming Olamide call"
        update.hasVideo = false
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if error != nil { self.calls.removeValue(forKey: callId) }
            completion(error)
        }
    }
    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        let id = payload.dictionaryPayload["callId"] as? String ?? UUID().uuidString
        // Always report a delivered VoIP push promptly. Disabled/expired calls then end.
        incoming(id) { _ in
            let expiry = Double(payload.dictionaryPayload["expiresAt"] as? String ?? "0") ?? 0
            if !UserDefaults.standard.bool(forKey: "nativePushEnabled") || expiry <= Date().timeIntervalSince1970 * 1000 { self.end(id, reason: .failed) }
            else {
                self.emit("wake", id)
                DispatchQueue.main.asyncAfter(deadline: .now() + min(45, (expiry / 1000 - Date().timeIntervalSince1970))) {
                    if self.answering[id] != nil || self.calls[id] != nil && !self.active.contains(id) { self.end(id, reason: .unanswered) }
                }
            }
            completion()
        }
    }
    private var active = Set<String>()
    func connected(_ id: String) {
        guard calls[id] != nil else { return }
        active.insert(id)
        if let action = answering.removeValue(forKey: id) { action.fulfill() }
        else if let uuid = calls[id] { CXCallController().request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { _ in } }
    }
    func end(_ id: String, reason: CXCallEndedReason = .remoteEnded) {
        answering.removeValue(forKey: id)?.fail(); active.remove(id)
        if let uuid = calls.removeValue(forKey: id) { provider.reportCall(with: uuid, endedAt: Date(), reason: reason) }
    }
    func disable() { for id in Array(calls.keys) { end(id) }; pending = [] }
    func providerDidReset(_ provider: CXProvider) { for id in Array(calls.keys) { emit("end", id); end(id, reason: .failed) } }
    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let id = calls.first(where: { $0.value == action.callUUID })?.key else { action.fail(); return }
        if active.contains(id) { action.fulfill(); return }
        do { try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth]) }
        catch { action.fail(); end(id, reason: .failed); return }
        answering[id] = action; emit("answer", id)
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { if self.answering[id] != nil { self.emit("end", id); self.end(id, reason: .failed) } }
    }
    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        guard let id = calls.first(where: { $0.value == action.callUUID })?.key else { action.fulfill(); return }
        emit("end", id); answering.removeValue(forKey: id)?.fail(); calls.removeValue(forKey: id); active.remove(id); action.fulfill()
    }
    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) { action.fail() }
    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) { plugin?.notifyListeners("audioActivated", data: [:], retainUntilConsumed: true) }
}

@objc(NativePushPlugin)
public class NativePushPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativePushPlugin"
    public let jsName = "NativePush"
    public let pluginMethods: [CAPPluginMethod] = ["getToken", "setEnabled", "setCallActive", "drainActions", "reportIncoming", "completeCall"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    public override func load() { OlamideCalls.shared.plugin = self; OlamideCalls.shared.start() }
    @objc func getToken(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let token = OlamideCalls.shared.currentToken() else { call.reject("APNs VoIP token pending; check signing and network"); return }
            call.resolve(["token": token, "platform": "ios"])
        }
    }
    @objc func setEnabled(_ call: CAPPluginCall) { DispatchQueue.main.async { let enabled = call.getBool("enabled") ?? false; UserDefaults.standard.set(enabled, forKey: "nativePushEnabled"); if !enabled { OlamideCalls.shared.disable() }; call.resolve() } }
    @objc func setCallActive(_ call: CAPPluginCall) { call.resolve() }
    @objc func drainActions(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(["events": OlamideCalls.shared.drain()]) } }
    @objc func reportIncoming(_ call: CAPPluginCall) { DispatchQueue.main.async { guard let id = call.getString("callId") else { call.reject("Call ID required"); return }; OlamideCalls.shared.incoming(id) { error in if let error = error { call.reject(error.localizedDescription) } else { call.resolve() } } } }
    @objc func completeCall(_ call: CAPPluginCall) { DispatchQueue.main.async { guard let id = call.getString("callId") else { call.reject("Call ID required"); return }; if call.getBool("active") == true { OlamideCalls.shared.connected(id) } else { OlamideCalls.shared.end(id) }; call.resolve() } }
}

class OlamideBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(NativePushPlugin()) }
}
