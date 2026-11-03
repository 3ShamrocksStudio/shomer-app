import UIKit
import Capacitor

/// SH✡MER's bridge view controller. It registers SH✡MER's own native plugin
/// ("ShomerNative") before the web layer loads - the iOS twin of
/// MainActivity.registerPlugin(ShomerNativePlugin.class) on Android.
/// Main.storyboard points at this class instead of CAPBridgeViewController.
class ShomerViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ShomerNativePlugin())
    }
}
