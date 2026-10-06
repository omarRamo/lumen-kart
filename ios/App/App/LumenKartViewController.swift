import Capacitor
import CoreMotion
import UIKit
import WebKit

/// Local Capacitor plugin consumed by `src/native-motion.js` (`registerPlugin('TiltMotion')`).
/// Emits `gravity` events `{ x, y, z }` in g, CoreMotion device coordinates (portrait upright: y = -1).
/// Sensors stop in the background and resume on return while JS still wants them.
@objc(TiltMotionPlugin)
public class TiltMotionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TiltMotionPlugin"
    public let jsName = "TiltMotion"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private let motion = CMMotionManager()
    private var backgroundObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?
    private var requested = false

    public override func load() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.motion.stopDeviceMotionUpdates() }
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self, self.requested else { return }
            self.beginUpdates()
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard self.motion.isDeviceMotionAvailable else {
                call.reject("Motion sensors are unavailable on this device")
                return
            }
            self.requested = true
            self.beginUpdates()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.requested = false
            self?.motion.stopDeviceMotionUpdates()
            call.resolve()
        }
    }

    private func beginUpdates() {
        motion.stopDeviceMotionUpdates()
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let gravity = data?.gravity else { return }
            self?.notifyListeners("gravity", data: ["x": gravity.x, "y": gravity.y, "z": gravity.z])
        }
    }

    deinit {
        motion.stopDeviceMotionUpdates()
        if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }
        if let observer = foregroundObserver { NotificationCenter.default.removeObserver(observer) }
    }
}

/// The whole screen belongs to the race: no status bar, home indicator auto-hidden (SystemBars config),
/// the first bottom-edge swipe goes to the thumbs, no text selection / magnifier / rubber-band,
/// and the screen never dims mid-race. Safe areas are handled in CSS with env(safe-area-inset-*).
class LumenKartViewController: CAPBridgeViewController {
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        configuration.preferences.isTextInteractionEnabled = false
        configuration.ignoresViewportScaleLimits = false
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        return configuration
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(TiltMotionPlugin())
        webView?.scrollView.bounces = false
        webView?.scrollView.isScrollEnabled = false
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView?.isOpaque = false
        webView?.backgroundColor = UIColor(red: 0x1f / 255.0, green: 0x4f / 255.0, blue: 0x4c / 255.0, alpha: 1)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        UIApplication.shared.isIdleTimerDisabled = true
        setNeedsStatusBarAppearanceUpdate()
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false
    }

    override var prefersStatusBarHidden: Bool { true }
    // Home indicator auto-hide comes from Capacitor's SystemBars plugin (capacitor.config.json: SystemBars.hidden = true).
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }
}
