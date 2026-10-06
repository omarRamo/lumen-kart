package com.omartrabelsi.lumenkart;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;

/**
 * The whole screen belongs to the race: immersive (no system bars), drawn under the camera
 * cutout, never dimming mid-race, and the bottom thumb band is protected from system gestures.
 * Safe areas, pause and saving are handled by the web layer (env(safe-area-inset-*), @capacitor/app).
 */
public class MainActivity extends BridgeActivity {

    /** Android grants at most 200 dp of gesture exclusion per edge: give it to the thumbs. */
    private static final int THUMB_BAND_DP = 200;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(TiltMotionPlugin.class);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Steady frame rate rather than a burst followed by thermal throttling (ignored where unsupported).
            getWindow().setSustainedPerformanceMode(true);
        }
        hideSystemBars();
        keepThumbsAwayFromSystemGestures();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // A swiped-down notification shade brings the bars back: hide them again on return.
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    private void keepThumbsAwayFromSystemGestures() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        getWindow()
            .getDecorView()
            .addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
                int width = right - left, height = bottom - top;
                int band = Math.min(
                    height,
                    (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, THUMB_BAND_DP, getResources().getDisplayMetrics())
                );
                view.setSystemGestureExclusionRects(Collections.singletonList(new Rect(0, height - band, width, height)));
            });
    }
}
